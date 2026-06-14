import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvFile(".env", false);
loadEnvFile(".env.agent.local", true);

const HOST = process.env.MOAT_AGENT_HOST ?? "127.0.0.1";
const PORT = numberFromEnv("MOAT_AGENT_PORT", 8788);
const MAX_TICKERS = numberFromEnv("MOAT_AGENT_MAX_TICKERS", 50);
const DEFAULT_RECENCY_DAYS = numberFromEnv("MOAT_AGENT_RECENCY_DAYS", 365);
const OLLAMA_URL = trimSlash(process.env.OLLAMA_URL ?? "http://127.0.0.1:11434");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";
const USE_OLLAMA = boolFromEnv("MOAT_AGENT_USE_OLLAMA", false);
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY ?? "";
const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ??
  "EquityFortressMoatAgent/0.1 local-research contact@example.com";
const FETCH_TIMEOUT_MS = numberFromEnv("MOAT_AGENT_FETCH_TIMEOUT_MS", 10000);
const STOCK_TIMEOUT_MS = numberFromEnv("MOAT_AGENT_STOCK_TIMEOUT_MS", 25000);
const SOURCE_TEXT_LIMIT = numberFromEnv("MOAT_AGENT_SOURCE_TEXT_LIMIT", 1500000);

const MOAT_VALUES = new Set([
  "Excellent",
  "Very Good",
  "Good",
  "Average",
  "Bad",
  "Very Bad",
  "Unknown",
]);
const MOAT_RANK = {
  "Very Bad": 0,
  Bad: 1,
  Unknown: 2,
  Average: 3,
  Good: 4,
  "Very Good": 5,
  Excellent: 6,
};
const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const QUARTERLY_FORMS = new Set(["10-Q", "10-Q/A", "6-K", "6-K/A"]);
const MOAT_SIGNALS = [
  {
    label: "switching costs",
    point: "Customers would face real friction or disruption if they switched.",
    weight: 3,
    patterns: [
      "switching costs",
      "high switching costs",
      "mission-critical",
      "mission critical",
      "deeply integrated",
      "installed base",
      "customer retention",
      "recurring revenue",
      "software stack",
      "programming model",
      "platform adoption",
    ],
  },
  {
    label: "network effects",
    point: "The product becomes more valuable as more users, merchants, developers, or partners join.",
    weight: 4,
    patterns: [
      "network effect",
      "network effects",
      "two-sided network",
      "two sided network",
      "marketplace liquidity",
      "developer ecosystem",
      "merchant network",
      "payment network",
      "payments network",
      "global payments network",
      "acceptance network",
      "merchant acceptance",
      "issuers and acquirers",
      "acquirers and issuers",
      "multi-rail",
      "multi rail",
      "cuda",
      "platform ecosystem",
    ],
  },
  {
    label: "brand strength",
    point: "Brand trust appears to support repeat demand or pricing power.",
    weight: 1,
    patterns: [
      "brand recognition",
      "brand strength",
      "trusted brand",
      "customer loyalty",
      "pricing power",
      "premium pricing",
      "franchise",
      "trusted network",
    ],
  },
  {
    label: "scale advantage",
    point: "Scale may help the company spread fixed costs or serve customers more efficiently.",
    weight: 2,
    patterns: [
      "economies of scale",
      "scale advantage",
      "global scale",
      "at scale",
      "large installed base",
      "global reach",
      "global acceptance",
      "large-scale",
      "large scale",
    ],
  },
  {
    label: "cost advantage",
    point: "There is some evidence of a structural cost advantage.",
    weight: 3,
    patterns: [
      "cost advantage",
      "low-cost producer",
      "lowest cost",
      "structural cost",
      "procurement scale",
    ],
  },
  {
    label: "intellectual property",
    point: "Proprietary technology or IP may help defend the business, but this is not enough by itself.",
    weight: 1,
    patterns: [
      "patent portfolio",
      "intellectual property portfolio",
      "proprietary technology",
      "proprietary software",
      "proprietary platform",
      "trade secrets",
      "exclusive rights",
    ],
  },
  {
    label: "regulatory barrier",
    point: "Regulation, approvals, or licenses may make entry harder for competitors.",
    weight: 3,
    patterns: [
      "regulatory barrier",
      "barriers to entry",
      "required approvals",
      "exclusive license",
      "regulatory approvals",
    ],
  },
  {
    label: "distribution advantage",
    point: "Distribution or ecosystem reach may make it harder for rivals to match customer access.",
    weight: 2,
    patterns: [
      "distribution network",
      "partner network",
      "ecosystem",
      "channel partners",
      "route to market",
      "global distribution",
      "broad distribution",
    ],
  },
];
const WEAK_MOAT_PATTERNS = [
  "commodity",
  "commoditized",
  "low barriers to entry",
  "few barriers to entry",
  "limited differentiation",
  "undifferentiated",
  "primarily compete on price",
  "price is the primary",
  "no long-term contracts",
  "customers can switch",
];
const RISK_PATTERNS = [
  {
    label: "competition",
    patterns: ["intense competition", "highly competitive", "competition", "competitive pressure"],
  },
  {
    label: "pricing pressure",
    patterns: ["pricing pressure", "price competition", "lower prices"],
  },
  {
    label: "margin pressure",
    patterns: ["margin pressure", "gross margin pressure", "operating margin pressure"],
  },
  {
    label: "regulatory pressure",
    patterns: ["regulatory risk", "regulation could", "government regulation"],
  },
  {
    label: "customer concentration",
    patterns: ["customer concentration", "significant customer", "major customer"],
  },
  {
    label: "substitution risk",
    patterns: ["substitute products", "substitution", "alternative technology"],
  },
  {
    label: "technology change",
    patterns: ["technological change", "rapid innovation", "rapidly changing"],
  },
];

let companyTickersPromise = null;

const server = createServer(async (request, response) => {
  applyCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      await handleHealth(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/research/moats") {
      await handleMoatResearch(request, response);
      return;
    }

    jsonResponse(response, { error: "Route not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected agent error";
    jsonResponse(response, { error: message }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Moat agent listening on http://${HOST}:${PORT}`);
  console.log(
    USE_OLLAMA
      ? `Ollama: enabled at ${OLLAMA_URL} (${OLLAMA_MODEL})`
      : "Ollama: disabled (set MOAT_AGENT_USE_OLLAMA=true to enable)",
  );
  console.log(BRAVE_SEARCH_API_KEY ? "Brave Search: configured" : "Brave Search: not configured");
});

async function handleHealth(response) {
  const ollama = await checkOllama();

  jsonResponse(response, {
    ok: true,
    ollama,
    search: {
      braveConfigured: Boolean(BRAVE_SEARCH_API_KEY),
    },
    analysis: {
      ollamaEnabled: USE_OLLAMA,
      stockTimeoutMs: STOCK_TIMEOUT_MS,
    },
    sec: {
      userAgent: SEC_USER_AGENT.includes("contact@example.com")
        ? "default"
        : "configured",
    },
  });
}

async function handleMoatResearch(request, response) {
  const body = await readJson(request);
  const stocks = normalizeStocks(body.tickers).slice(0, MAX_TICKERS);
  const recencyDays = clampNumber(body.recencyDays, 31, 365, DEFAULT_RECENCY_DAYS);
  const concurrency = clampNumber(body.concurrency, 1, 4, 2);

  if (stocks.length === 0) {
    jsonResponse(response, { error: "tickers must include at least one valid ticker" }, 400);
    return;
  }

  const researchedAt = new Date().toISOString();
  const results = await mapLimit(stocks, concurrency, (stock) =>
    withTimeout(
      researchStockMoat(stock, { recencyDays }),
      STOCK_TIMEOUT_MS,
      () => timedOutStockResult(stock, new Date().toISOString(), STOCK_TIMEOUT_MS),
    )
  );

  jsonResponse(response, {
    researchedAt,
    results,
  });
}

async function researchStockMoat(stock, options) {
  const warnings = [];
  const startedAt = new Date().toISOString();
  const [secResult, braveResult] = await Promise.allSettled([
    loadSecSources(stock),
    loadBraveSources(stock, options),
  ]);

  const sources = [];

  if (secResult.status === "fulfilled") {
    sources.push(...secResult.value.sources);
    warnings.push(...secResult.value.warnings);
  } else {
    warnings.push(`SEC lookup failed: ${secResult.reason.message ?? secResult.reason}`);
  }

  if (braveResult.status === "fulfilled") {
    sources.push(...braveResult.value.sources);
    warnings.push(...braveResult.value.warnings);
  } else {
    warnings.push(`Web search failed: ${braveResult.reason.message ?? braveResult.reason}`);
  }

  const rankedSources = rankSources(sources).slice(0, 8);

  if (rankedSources.length === 0) {
    return {
      ticker: stock.ticker,
      company: stock.company,
      status: "error",
      moat: "Unknown",
      confidence: "Low",
      summary: "No recent official or freshness-filtered sources were found.",
      keyPoints: [],
      risks: [],
      suggestedNote: "",
      researchedAt: startedAt,
      sources: [],
      warnings,
      modelUsed: null,
    };
  }

  let analysis = fallbackAnalysis(stock, rankedSources);
  let modelUsed = null;

  if (USE_OLLAMA) {
    try {
      analysis = await analyzeWithOllama(stock, rankedSources);
      modelUsed = OLLAMA_MODEL;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Ollama unavailable, used source-based fallback: ${message}`);
    }
  }

  return {
    ticker: stock.ticker,
    company: stock.company,
    status: warnings.length > 0 ? "warning" : "ok",
    moat: analysis.moat,
    confidence: analysis.confidence,
    summary: analysis.summary,
    keyPoints: analysis.keyPoints,
    risks: analysis.risks,
    suggestedNote: analysis.suggestedNote,
    researchedAt: startedAt,
    sources: rankedSources.map(publicSource),
    warnings,
    modelUsed,
  };
}

async function loadSecSources(stock) {
  const warnings = [];
  const mapping = await loadCompanyTickers();
  const entry = mapping.get(stock.ticker) ??
    mapping.get(stock.ticker.replace(".", "-")) ??
    mapping.get(stock.ticker.replace("-", "."));

  if (!entry) {
    return {
      sources: [],
      warnings: [`No SEC ticker match for ${stock.ticker}`],
    };
  }

  const cik = String(entry.cik).padStart(10, "0");
  const submissions = await fetchJson(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
    secHeaders("application/json"),
  );
  const filings = normalizeFilings(submissions);
  const selected = [
    latestFiling(filings, ANNUAL_FORMS),
    latestFiling(filings, QUARTERLY_FORMS),
  ].filter(Boolean);

  if (selected.length === 0) {
    return {
      sources: [],
      warnings: [`No recent SEC annual or quarterly filing found for ${stock.ticker}`],
    };
  }

  const sources = [];
  await Promise.all(
    selected.map(async (filing) => {
      try {
        const text = await fetchTextLimited(
          filing.documentUrl,
          secHeaders("text/html,application/xhtml+xml,text/plain"),
          SOURCE_TEXT_LIMIT,
        );
        const plainText = htmlToText(text);
        const excerpt = extractMoatContext(plainText);
        if (excerpt) {
          sources.push({
            type: "filing",
            title: `${stock.ticker} ${filing.form} filed ${filing.filingDate}`,
            url: filing.documentUrl,
            date: filing.filingDate,
            dateLabel: filing.reportDate ? `period ${filing.reportDate}` : filing.filingDate,
            excerpt,
          });
        }
      } catch (error) {
        warnings.push(
          `Could not read ${filing.form}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  return { sources, warnings };
}

async function loadBraveSources(stock, options) {
  if (!BRAVE_SEARCH_API_KEY) {
    return {
      sources: [],
      warnings: ["Brave Search key not configured; using SEC filings only"],
    };
  }

  const queryParts = [
    stock.company ?? stock.ticker,
    stock.ticker,
    "moat competitive advantage pricing power switching costs",
  ];
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", queryParts.join(" "));
  url.searchParams.set("count", "8");
  url.searchParams.set("country", "us");
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("safesearch", "moderate");
  url.searchParams.set("extra_snippets", "true");
  url.searchParams.set("freshness", braveFreshness(options.recencyDays));

  const payload = await fetchJson(url.toString(), {
    "Accept": "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
  });
  const results = Array.isArray(payload.web?.results) ? payload.web.results : [];
  const sources = [];

  for (const result of results) {
    const title = cleanText(result.title);
    const sourceUrl = typeof result.url === "string" ? result.url : "";
    const description = cleanText(result.description);
    const extraSnippets = Array.isArray(result.extra_snippets)
      ? result.extra_snippets.map(cleanText).filter(Boolean)
      : [];
    const date = parseBraveAge(result.age);

    if (!title || !sourceUrl || !description) {
      continue;
    }

    if (date && !isWithinDays(date, options.recencyDays)) {
      continue;
    }

    sources.push({
      type: "web",
      title,
      url: sourceUrl,
      date,
      dateLabel: date ?? "freshness-filtered",
      excerpt: clipText([description, ...extraSnippets].join(" "), 1800),
    });
  }

  return { sources, warnings: [] };
}

async function analyzeWithOllama(stock, sources) {
  const prompt = buildPrompt(stock, sources);
  const response = await fetchJson(`${OLLAMA_URL}/api/generate`, {
    "Content-Type": "application/json",
  }, {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
    format: "json",
    options: {
      temperature: 0.1,
      top_p: 0.8,
    },
  });

  const parsed = parseJsonObject(response.response);
  return normalizeAnalysis(stock, parsed, sources);
}

function buildPrompt(stock, sources) {
  const evidence = evaluateEvidence(stock, sources);
  const sourceBlock = sources.map((source, index) => {
    return [
      `[${index + 1}] ${source.title}`,
      `Type: ${source.type}`,
      `Date: ${source.date ?? source.dateLabel ?? "unknown"}`,
      `URL: ${source.url}`,
      `Excerpt: ${clipText(source.excerpt, 2200)}`,
    ].join("\n");
  }).join("\n\n");

  return `
You are an equity research assistant for a personal dashboard. This is research support, not investment advice.

Company:
Ticker: ${stock.ticker}
Name: ${stock.company ?? "Unknown"}
Sector: ${stock.sector ?? "Unknown"}
Industry: ${stock.industry ?? "Unknown"}

Rules:
- Use only the sources below.
- Prefer dated filings and freshness-filtered web results.
- If a source has no exact date, treat it as weak support.
- Classify moat on this app scale: Excellent, Very Good, Good, Average, Bad, Very Bad, Unknown.
- Be very conservative. "Excellent" is rare and means an unusually durable, very hard-to-displace moat with strong evidence from sources.
- Use "Very Good" for clearly strong moats that are not quite exceptional, "Good" for solid but contested advantages, "Average" for ordinary or uncertain advantages, "Bad" for weak positioning, "Very Bad" for commodity-like/no-barrier businesses, and "Unknown" when evidence is thin.
- Do not treat generic mentions of brand, scale, IP, or competition as moat evidence unless the source clearly links them to pricing power, retention, barriers to entry, or durable advantage versus competitors.
- AMD-style semiconductor competition should not be "Excellent" unless the sources show a truly structural and durable edge.
- Keep notes human and specific. No phrases like "shows X based on the latest available source set".
- Write 3 key notes by default. Use 5 only if the evidence is unusually rich.
- The conservative source-based ceiling is ${evidence.recommendedMoat}; do not grade above that unless the sources directly justify it.
- Return JSON only.

Sources:
${sourceBlock}

JSON shape:
{
  "moat": "Excellent | Very Good | Good | Average | Bad | Very Bad | Unknown",
  "confidence": "High | Medium | Low",
  "summary": "one natural sentence explaining the rating",
  "keyPoints": ["short human point with source ref like [1]", "another point"],
  "risks": ["one short risk", "another short risk"],
  "suggestedNote": "compact note with 3 bullets max, include source refs like [1]"
}
`;
}

function normalizeAnalysis(stock, input, sources) {
  const evidence = evaluateEvidence(stock, sources);
  const modelMoat = MOAT_VALUES.has(input?.moat) ? input.moat : "Unknown";
  const moat = conservativeMoat(modelMoat, evidence.recommendedMoat);
  const confidence = ["High", "Medium", "Low"].includes(input?.confidence)
    ? input.confidence
    : evidence.confidence;
  const keyPoints = normalizePointList(input?.keyPoints, 5);
  const fallback = fallbackAnalysis(stock, sources);
  const points = (keyPoints.length > 0 ? keyPoints : fallback.keyPoints)
    .slice(0, moat === "Excellent" ? 5 : 3);
  const risks = normalizePointList(input?.risks, 3);
  const cleanRisks = risks.length > 0 ? risks : fallback.risks;
  const summary = naturalSummary(stock, moat, points, cleanRisks);
  const suggestedNote = cleanText(input?.suggestedNote) && !looksGeneric(input.suggestedNote)
    ? input.suggestedNote
    : buildSuggestedNote(moat, points, cleanRisks, sources);

  return {
    moat,
    confidence,
    summary: clipText(summary, 700),
    keyPoints: points,
    risks: cleanRisks,
    suggestedNote: clipText(suggestedNote, 700),
  };
}

function fallbackAnalysis(stock, sources) {
  const evidence = evaluateEvidence(stock, sources);
  const moat = evidence.recommendedMoat;
  const points = evidence.points.slice(0, moat === "Excellent" ? 5 : 3);
  const risks = evidence.risks.slice(0, 3);

  return {
    moat,
    confidence: evidence.confidence,
    summary: naturalSummary(stock, moat, points, risks),
    keyPoints: points,
    risks,
    suggestedNote: buildSuggestedNote(moat, points, risks, sources),
  };
}

function evaluateEvidence(stock, sources) {
  const sourceText = sources
    .map((source, index) => `[${index + 1}] ${source.title} ${source.excerpt}`)
    .join(" ")
    .toLowerCase();
  const matchedSignals = MOAT_SIGNALS
    .map((signal) => ({
      ...signal,
      matched: signal.patterns.some((pattern) => sourceText.includes(pattern)),
    }))
    .filter((signal) => signal.matched);
  const matchedRisks = RISK_PATTERNS
    .map((risk) => ({
      label: risk.label,
      matched: risk.patterns.some((pattern) => sourceText.includes(pattern)),
    }))
    .filter((risk) => risk.matched);
  const weakMoatHits = WEAK_MOAT_PATTERNS.filter((pattern) =>
    sourceText.includes(pattern)
  );
  const score = matchedSignals.reduce((sum, signal) => sum + signal.weight, 0);
  const highQualitySignals = matchedSignals.filter((signal) => signal.weight >= 3);
  const hasFiling = sources.some((source) => source.type === "filing");
  const hasWeb = sources.some((source) => source.type === "web");
  const hasRecentDatedSource = sources.some((source) => source.date && isWithinDays(source.date, 365));
  const riskPenalty = Math.min(1, Math.floor(matchedRisks.length / 3));
  const adjustedScore = Math.max(0, score - riskPenalty);

  let recommendedMoat = "Unknown";
  if (
    adjustedScore >= 11 &&
    highQualitySignals.length >= 2 &&
    hasFiling &&
    hasRecentDatedSource &&
    matchedRisks.length <= 2
  ) {
    recommendedMoat = "Excellent";
  } else if (adjustedScore >= 9 && highQualitySignals.length >= 2) {
    recommendedMoat = "Very Good";
  } else if (adjustedScore >= 6 && highQualitySignals.length >= 1) {
    recommendedMoat = "Good";
  } else if (adjustedScore >= 2) {
    recommendedMoat = "Average";
  } else if (weakMoatHits.length >= 2) {
    recommendedMoat = "Very Bad";
  } else if (weakMoatHits.length > 0) {
    recommendedMoat = "Bad";
  }

  const confidence = hasFiling && hasWeb && adjustedScore >= 6
    ? "High"
    : hasFiling && adjustedScore >= 2
      ? "Medium"
      : "Low";
  const signalPoints = matchedSignals.map((signal) =>
    `${signal.point} ${sourceRefsForSignal(signal, sources)}`
  );
  const points = signalPoints.length > 0
    ? signalPoints
    : [`Evidence is thin, so ${stock.ticker} should stay conservative until better sources are reviewed.`];
  const risks = matchedRisks.length > 0
    ? matchedRisks.map((risk) => titleCase(risk.label))
    : ["Competition could pressure returns"];

  return {
    recommendedMoat,
    confidence,
    points: dedupeStrings(points).slice(0, 5),
    risks: dedupeStrings(risks).slice(0, 3),
  };
}

function sourceRefsForSignal(signal, sources) {
  const refs = sources
    .map((source, index) => {
      const haystack = `${source.title} ${source.excerpt}`.toLowerCase();
      return signal.patterns.some((pattern) => haystack.includes(pattern))
        ? `[${index + 1}]`
        : null;
    })
    .filter(Boolean)
    .slice(0, 2);

  return refs.length > 0 ? refs.join(" ") : "";
}

function conservativeMoat(modelMoat, evidenceMoat) {
  const modelRank = MOAT_RANK[modelMoat] ?? MOAT_RANK.Unknown;
  const evidenceRank = MOAT_RANK[evidenceMoat] ?? MOAT_RANK.Unknown;
  const cappedRank = Math.min(modelRank, evidenceRank);
  return Object.entries(MOAT_RANK)
    .find(([, rank]) => rank === cappedRank)?.[0] ?? "Unknown";
}

function normalizePointList(value, maxItems) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeStrings(
    value
      .map(cleanText)
      .filter((point) => point.length > 0 && !looksGeneric(point))
      .map((point) => point.replace(/^[-*]\s*/, "")),
  ).slice(0, maxItems);
}

function naturalSummary(stock, moat, points, risks) {
  const companyLabel = stock.company ?? stock.ticker;
  const firstPoint = points[0]
    ? points[0].replace(/\s+\[\d+\](?:\s+\[\d+\])?/g, "")
    : "the evidence is not strong enough for a high rating";
  const riskText = risks[0]
    ? ` Main thing to watch: ${risks[0].toLowerCase()}.`
    : "";

  return `${companyLabel} looks like a ${moat.toLowerCase()} moat: ${firstPoint}${riskText}`;
}

function buildSuggestedNote(moat, points, risks, sources) {
  const pointLines = points.slice(0, 3).map((point) => `- ${point}`);
  const sourceLines = sources
    .slice(0, 2)
    .map((source, index) => `${index + 1}. ${shortSourceLabel(source)}: ${source.url}`);
  const riskLine = risks.length > 0 ? `Watch: ${risks.slice(0, 2).join("; ")}.` : "";

  return [
    `AI moat ${todayIso()}: ${moat}`,
    ...pointLines,
    riskLine,
    sourceLines.length > 0 ? "Sources:" : "",
    ...sourceLines,
  ].filter(Boolean).join("\n");
}

function shortSourceLabel(source) {
  const type = source.type === "filing" ? "SEC filing" : "Web";
  const date = source.date ?? source.dateLabel;
  return date ? `${type} ${date}` : type;
}

function looksGeneric(value) {
  const text = cleanText(value).toLowerCase();
  return text.includes("based on the latest available source set") ||
    text.includes("risks include competition and competitive") ||
    /^.+ shows .+ based on .+$/.test(text);
}

function dedupeStrings(values) {
  const seen = new Set();
  const deduped = [];

  for (const value of values) {
    const normalized = cleanText(value).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(cleanText(value));
  }

  return deduped;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function loadCompanyTickers() {
  if (!companyTickersPromise) {
    companyTickersPromise = fetchJson(
      "https://www.sec.gov/files/company_tickers.json",
      secHeaders("application/json"),
    ).then((payload) => {
      const map = new Map();
      for (const entry of Object.values(payload)) {
        if (!entry || typeof entry !== "object") {
          continue;
        }

        const ticker = normalizeTicker(entry.ticker);
        const cik = Number(entry.cik_str);
        if (ticker && Number.isFinite(cik)) {
          map.set(ticker, {
            ticker,
            cik,
            title: typeof entry.title === "string" ? entry.title : null,
          });
        }
      }
      return map;
    });
  }

  return companyTickersPromise;
}

function normalizeFilings(submissions) {
  const recent = submissions?.filings?.recent;
  if (!recent || typeof recent !== "object") {
    return [];
  }

  const forms = recent.form ?? [];
  const filingDates = recent.filingDate ?? [];
  const reportDates = recent.reportDate ?? [];
  const accessionNumbers = recent.accessionNumber ?? [];
  const primaryDocuments = recent.primaryDocument ?? [];
  const cikPath = String(submissions.cik ?? "").replace(/^0+/, "");
  const filings = [];

  for (let index = 0; index < forms.length; index += 1) {
    const form = forms[index];
    const accessionNumber = accessionNumbers[index];
    const primaryDocument = primaryDocuments[index];
    const filingDate = filingDates[index];

    if (!form || !accessionNumber || !primaryDocument || !filingDate || !cikPath) {
      continue;
    }

    filings.push({
      form,
      filingDate,
      reportDate: reportDates[index] ?? null,
      accessionNumber,
      primaryDocument,
      documentUrl: `https://www.sec.gov/Archives/edgar/data/${cikPath}/${String(accessionNumber).replace(/-/g, "")}/${primaryDocument}`,
    });
  }

  return filings.sort((left, right) => String(right.filingDate).localeCompare(String(left.filingDate)));
}

function latestFiling(filings, formSet) {
  const nonAmended = filings.find((filing) =>
    formSet.has(filing.form) && !String(filing.form).endsWith("/A")
  );

  return nonAmended ?? filings.find((filing) => formSet.has(filing.form)) ?? null;
}

function extractMoatContext(text) {
  const compact = cleanText(text);
  if (!compact) {
    return "";
  }

  const lower = compact.toLowerCase();
  const keywords = [
    "network effect",
    "payment network",
    "acceptance network",
    "merchant acceptance",
    "issuers and acquirers",
    "developer ecosystem",
    "platform ecosystem",
    "cuda",
    "software stack",
    "programming model",
    "proprietary technology",
    "proprietary platform",
    "pricing power",
    "switching",
    "recurring revenue",
    "customer retention",
    "scale advantage",
    "global scale",
    "brand",
    "intellectual property",
    "patent",
    "customer",
    "network",
    "platform",
    "ecosystem",
    "regulatory",
    "competitive",
    "competition",
    "risk",
  ];
  const windows = [];

  for (const keyword of keywords) {
    const index = lower.indexOf(keyword);
    if (index < 0 || windows.some(([start, end]) => index >= start && index <= end)) {
      continue;
    }

    windows.push([
      Math.max(0, index - 650),
      Math.min(compact.length, index + 1050),
    ]);

    if (windows.length >= 5) {
      break;
    }
  }

  if (windows.length === 0) {
    return clipText(compact, 3500);
  }

  return clipText(
    windows.map(([start, end]) => compact.slice(start, end)).join("\n\n"),
    6500,
  );
}

function rankSources(sources) {
  const seen = new Set();
  return sources
    .filter((source) => {
      const key = source.url;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return Boolean(source.excerpt);
    })
    .sort((left, right) => {
      const leftType = left.type === "filing" ? 1 : 0;
      const rightType = right.type === "filing" ? 1 : 0;
      if (leftType !== rightType) {
        return rightType - leftType;
      }
      return String(right.date ?? "").localeCompare(String(left.date ?? ""));
    });
}

function publicSource(source) {
  return {
    type: source.type,
    title: source.title,
    url: source.url,
    date: source.date,
    dateLabel: source.dateLabel,
    excerpt: clipText(source.excerpt, 650),
  };
}

async function checkOllama() {
  if (!USE_OLLAMA) {
    return {
      ok: false,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      disabled: true,
    };
  }

  try {
    const payload = await fetchJson(`${OLLAMA_URL}/api/tags`, {}, undefined, 2500);
    const models = Array.isArray(payload.models)
      ? payload.models.map((model) => model.name).filter(Boolean)
      : [];
    return {
      ok: true,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      modelAvailable: models.includes(OLLAMA_MODEL),
    };
  } catch (error) {
    return {
      ok: false,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchJson(url, headers = {}, body = undefined, timeoutMs = FETCH_TIMEOUT_MS) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function fetchText(url, headers = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function fetchTextLimited(
  url,
  headers = {},
  maxBytes = SOURCE_TEXT_LIMIT,
  timeoutMs = FETCH_TIMEOUT_MS,
) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }

      const remaining = maxBytes - received;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      received += chunk.length;

      if (value.length > remaining) {
        break;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return new TextDecoder().decode(concatChunks(chunks, received));
}

function secHeaders(accept) {
  return {
    "Accept": accept,
    "User-Agent": SEC_USER_AGENT,
  };
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_500_000) {
      throw new Error("Request body too large");
    }
  }

  try {
    return body ? JSON.parse(body) : {};
  } catch (_error) {
    throw new Error("Invalid JSON body");
  }
}

function applyCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function jsonResponse(response, payload, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function normalizeStocks(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set();
  const stocks = [];

  for (const item of input) {
    const ticker = normalizeTicker(typeof item === "string" ? item : item?.ticker);
    if (!ticker || seen.has(ticker)) {
      continue;
    }

    seen.add(ticker);
    stocks.push({
      ticker,
      company: cleanOptionalString(item?.company),
      sector: cleanOptionalString(item?.sector),
      industry: cleanOptionalString(item?.industry),
      currentMoat: MOAT_VALUES.has(item?.currentMoat) ? item.currentMoat : "Unknown",
      currentNotes: cleanOptionalString(item?.currentNotes) ?? "",
    });
  }

  return stocks;
}

function normalizeTicker(input) {
  if (typeof input !== "string") {
    return null;
  }

  const ticker = input.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9.:-]{0,24}$/.test(ticker) ? ticker : null;
}

function cleanOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return htmlToText(value).replace(/\s+/g, " ").trim();
}

function htmlToText(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"');
}

function clipText(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function parseJsonObject(value) {
  if (typeof value !== "string") {
    return {};
  }

  const trimmed = value.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(jsonText);
}

function braveFreshness(days) {
  if (days <= 1) return "pd";
  if (days <= 7) return "pw";
  if (days <= 31) return "pm";
  return "py";
}

function parseBraveAge(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const lower = value.trim().toLowerCase();
  const relative = lower.match(/^(\d+)\s+(hour|day|week|month|year)s?\s+ago$/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const date = new Date();
    const days =
      unit === "hour" ? Math.ceil(amount / 24) :
      unit === "day" ? amount :
      unit === "week" ? amount * 7 :
      unit === "month" ? amount * 31 :
      amount * 365;
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function isWithinDays(isoDate, days) {
  const timestamp = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  return Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker),
  ).then(() => results);
}

function withTimeout(promise, timeoutMs, fallback) {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback()), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function timedOutStockResult(stock, researchedAt, timeoutMs) {
  return {
    ticker: stock.ticker,
    company: stock.company,
    status: "error",
    moat: "Unknown",
    confidence: "Low",
    summary: `Research timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
    keyPoints: [],
    risks: [],
    suggestedNote: "",
    researchedAt,
    sources: [],
    warnings: ["This stock took too long. Try a smaller batch or lower the limit."],
    modelUsed: null,
  };
}

function concatChunks(chunks, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function numberFromEnv(name, fallback) {
  return clampNumber(process.env[name], 1, Number.MAX_SAFE_INTEGER, fallback);
}

function boolFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadEnvFile(fileName, override) {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
