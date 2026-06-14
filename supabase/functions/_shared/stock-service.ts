import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import type {
  CachedStockPayload,
  CacheRow,
  JsonRecord,
  Moat,
  StockData,
} from "./types.ts";
import {
  fetchYahooFundamentalsPayload,
  fetchYahooHistoricalRecords,
  fetchYahooQuoteRecord,
  fetchYahooQuoteRecords,
  fetchYahooSummaryPayload,
} from "./yahoo.ts";

const QUOTE_CACHE_MS = 6 * 60 * 60 * 1000;
const FUNDAMENTALS_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORICAL_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PROVIDER = "yahoo-finance2";
const CACHE_SCHEMA_VERSION = 2;

const MOAT_VALUES: Moat[] = [
  "Excellent",
  "Very Good",
  "Good",
  "Average",
  "Bad",
  "Very Bad",
  "Unknown",
];

type RefreshScope = "quote" | "full";

interface StockDataOptions {
  forceRefresh?: boolean;
  preferCache?: boolean;
  cacheOnly?: boolean;
  refreshScope?: RefreshScope | null;
  authorizationHeader?: string | null;
}

interface EndpointResult {
  patch?: Partial<CachedStockPayload>;
  error?: string;
}

interface GroupResult {
  patch: Partial<CachedStockPayload>;
  errors: string[];
  hasSuccess: boolean;
}

let supabaseAdmin: SupabaseClient | null = null;

export function normalizeTicker(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const ticker = input.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.:-]{0,24}$/.test(ticker)) {
    return null;
  }

  return ticker;
}

export function normalizeTickerList(input: unknown, limit = 25): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const tickers: string[] = [];

  for (const item of input) {
    const ticker = normalizeTicker(item);
    if (ticker && !seen.has(ticker)) {
      seen.add(ticker);
      tickers.push(ticker);
    }

    if (tickers.length >= limit) {
      break;
    }
  }

  return tickers;
}

export async function loadStockData(
  ticker: string,
  options: StockDataOptions = {},
): Promise<StockData> {
  const supabase = getSupabaseAdmin();
  const userId = await getUserIdFromAuthHeader(
    supabase,
    options.authorizationHeader,
  );

  const [cacheRow, moat] = await Promise.all([
    readCacheRow(supabase, ticker),
    readMoat(supabase, ticker, userId),
  ]);

  const now = new Date();
  const rawCachedPayload = normalizePayload(cacheRow?.data_json);
  const cacheProviderMismatch =
    cacheRow !== null && !isCurrentProviderPayload(rawCachedPayload);
  const cachedPayload = cacheProviderMismatch ? {} : rawCachedPayload;
  const forceRefresh = options.forceRefresh === true;
  const refreshScope = forceRefresh ? "full" : options.refreshScope;
  const hasAnyCache =
    cacheRow !== null &&
    (hasQuotePayload(cachedPayload) ||
      hasFundamentalsPayload(cachedPayload) ||
      hasHistoricalPayload(cachedPayload));

  if (options.preferCache && hasAnyCache && !refreshScope) {
    return composeStockData(ticker, cachedPayload, moat, cacheRow);
  }

  if (
    options.cacheOnly &&
    !hasAnyCache &&
    !refreshScope &&
    !cacheProviderMismatch
  ) {
    return emptyStockData(ticker, moat, latestTimestamp(cacheRow));
  }

  const quoteFresh =
    !forceRefresh &&
    hasQuotePayload(cachedPayload) &&
    isFresh(cacheRow?.quote_updated_at, QUOTE_CACHE_MS, now);
  const fundamentalsFresh =
    !forceRefresh &&
    hasFundamentalsPayload(cachedPayload) &&
    isFresh(cacheRow?.fundamentals_updated_at, FUNDAMENTALS_CACHE_MS, now);
  const historicalFresh =
    !forceRefresh &&
    hasHistoricalPayload(cachedPayload) &&
    isFresh(cacheRow?.historical_updated_at, HISTORICAL_CACHE_MS, now);

  if (quoteFresh && fundamentalsFresh && historicalFresh) {
    return composeStockData(ticker, cachedPayload, moat, cacheRow);
  }

  const nextPayload: CachedStockPayload = forceRefresh
    ? {}
    : { ...cachedPayload };
  const timestampPatch: Partial<CacheRow> = {};
  const allErrors: string[] = [];

  const refreshQuote = refreshScope === "quote" || !quoteFresh;
  const refreshFundamentals =
    refreshScope === "quote" ? false : !fundamentalsFresh;
  const refreshHistorical = refreshScope === "quote" ? false : !historicalFresh;

  if (refreshQuote) {
    const result =
      refreshScope === "quote" && hasAnyCache
        ? await fetchSingleQuoteRefreshGroup(ticker)
        : await fetchQuoteGroup(ticker);
    Object.assign(nextPayload, result.patch);
    allErrors.push(...result.errors);
    if (result.hasSuccess) {
      timestampPatch.quote_updated_at = now.toISOString();
    }
  }

  if (refreshFundamentals) {
    const result = await fetchFundamentalsGroup(ticker);
    Object.assign(nextPayload, result.patch);
    allErrors.push(...result.errors);
    if (result.hasSuccess) {
      timestampPatch.fundamentals_updated_at = now.toISOString();
    }
  }

  if (refreshHistorical) {
    const result = await fetchHistoricalGroup(ticker);
    Object.assign(nextPayload, result.patch);
    allErrors.push(...result.errors);
    if (result.hasSuccess) {
      timestampPatch.historical_updated_at = now.toISOString();
    }
  }

  if (allErrors.length > 0) {
    nextPayload.endpointErrors = allErrors.slice(0, 20);
    await logRefresh(
      supabase,
      ticker,
      "partial_error",
      allErrors.join(" | ").slice(0, 1000),
    );
  } else {
    delete nextPayload.endpointErrors;
  }
  stampCachePayload(nextPayload, now);

  const updatedRow = await upsertCacheRow(
    supabase,
    ticker,
    nextPayload,
    cacheRow,
    timestampPatch,
  );

  if (Object.keys(timestampPatch).length > 0 && allErrors.length === 0) {
    await logRefresh(supabase, ticker, "success", "Yahoo cache refreshed");
  }

  return composeStockData(ticker, nextPayload, moat, updatedRow ?? cacheRow);
}

export async function loadStocksBatchData(
  tickers: string[],
  options: StockDataOptions = {},
): Promise<StockData[]> {
  if (options.refreshScope !== "quote") {
    return await Promise.all(
      tickers.map(async (ticker) => {
        try {
          return await loadStockData(ticker, {
            ...options,
            preferCache: options.preferCache ?? true,
            cacheOnly: options.cacheOnly ?? options.refreshScope !== "full",
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error("Batch stock load failed", { ticker, message });
          return emptyStockData(ticker);
        }
      }),
    );
  }

  const supabase = getSupabaseAdmin();
  const userId = await getUserIdFromAuthHeader(
    supabase,
    options.authorizationHeader,
  );
  const nowIso = new Date().toISOString();
  const quoteResult = await fetchBatchQuoteGroup(tickers);
  const quoteEntries: Array<[string, JsonRecord]> = [];
  for (const quote of quoteResult.patch.quotes ?? []) {
    if (!isRecord(quote)) {
      continue;
    }

    const ticker = normalizeTicker(
      firstString(quote, ["symbol", "ticker"]) ?? "",
    );
    if (ticker) {
      quoteEntries.push([ticker, quote]);
    }
  }
  const quoteByTicker = new Map<string, JsonRecord>(quoteEntries);

  const stocks = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const [cacheRow, moat] = await Promise.all([
          readCacheRow(supabase, ticker),
          readMoat(supabase, ticker, userId),
        ]);
        const payload = normalizePayload(cacheRow?.data_json);
        const quote = quoteByTicker.get(ticker);

        if (quote) {
          payload.quote = quote;
          const updatedRow = await upsertCacheRow(
            supabase,
            ticker,
            payload,
            cacheRow,
            { quote_updated_at: nowIso },
          );
          return composeStockData(
            ticker,
            payload,
            moat,
            updatedRow ?? cacheRow,
          );
        }

        return cacheRow
          ? composeStockData(ticker, payload, moat, cacheRow)
          : emptyStockData(ticker, moat);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Batch quote merge failed", { ticker, message });
        return emptyStockData(ticker);
      }
    }),
  );

  if (quoteResult.errors.length > 0) {
    await logRefresh(
      supabase,
      null,
      "partial_error",
      quoteResult.errors.join(" | ").slice(0, 1000),
    );
  } else if (quoteResult.hasSuccess) {
    await logRefresh(
      supabase,
      null,
      "success",
      `Batch quote refreshed for ${tickers.length} tickers`,
    );
  }

  return stocks;
}

export function emptyStockData(
  ticker: string,
  moat: Moat = "Unknown",
  lastUpdated: string | null = null,
): StockData {
  return {
    ticker,
    company: null,
    currentPrice: null,
    oneYearChart: [],
    performance1W: null,
    performance1Y: null,
    performance3Y: null,
    performance5Y: null,
    analystConsensus: null,
    grossMargin: null,
    operatingMargin: null,
    roce: null,
    fcfMargin: null,
    pe: null,
    forwardPe: null,
    peg: null,
    revenueGrowth: null,
    epsGrowth: null,
    debtToEquity: null,
    beta: null,
    sector: null,
    industry: null,
    netDebtToEbitda: null,
    moat,
    redFlags: [],
    scorePenalty: 0,
    score: null,
    lastUpdated,
  };
}

export async function logRefresh(
  supabase: SupabaseClient,
  ticker: string | null,
  status: string,
  message: string,
): Promise<void> {
  const { error } = await supabase.from("refresh_logs").insert({
    ticker,
    status,
    message,
  });

  if (error) {
    console.error("Failed to write refresh log", error.message);
  }
}

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Edge Functions",
    );
  }

  supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdmin;
}

async function getUserIdFromAuthHeader(
  supabase: SupabaseClient,
  authorizationHeader?: string | null,
): Promise<string | null> {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    console.warn("Could not resolve Supabase user from Authorization header", {
      message: error.message,
    });
    return null;
  }

  return data.user?.id ?? null;
}

async function readCacheRow(
  supabase: SupabaseClient,
  ticker: string,
): Promise<CacheRow | null> {
  const { data, error } = await supabase
    .from("stock_metrics_cache")
    .select("*")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) {
    await logRefresh(
      supabase,
      ticker,
      "error",
      `Cache read failed: ${error.message}`,
    );
    throw error;
  }

  return data as CacheRow | null;
}

async function readMoat(
  supabase: SupabaseClient,
  ticker: string,
  userId: string | null,
): Promise<Moat> {
  if (userId) {
    const { data, error } = await supabase
      .from("watchlist_stocks")
      .select("moat")
      .eq("user_id", userId)
      .ilike("ticker", ticker)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && isMoat((data as { moat?: unknown } | null)?.moat)) {
      return (data as { moat: Moat }).moat;
    }
  }

  const { data, error } = await supabase
    .from("watchlist_stocks")
    .select("moat")
    .is("user_id", null)
    .ilike("ticker", ticker)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && isMoat((data as { moat?: unknown } | null)?.moat)) {
    return (data as { moat: Moat }).moat;
  }

  return "Unknown";
}

async function upsertCacheRow(
  supabase: SupabaseClient,
  ticker: string,
  payload: CachedStockPayload,
  previousRow: CacheRow | null,
  timestampPatch: Partial<CacheRow>,
): Promise<CacheRow | null> {
  if (Object.keys(timestampPatch).length === 0) {
    return previousRow;
  }

  const row = {
    ticker,
    data_json: payload,
    quote_updated_at:
      timestampPatch.quote_updated_at ?? previousRow?.quote_updated_at ?? null,
    fundamentals_updated_at:
      timestampPatch.fundamentals_updated_at ??
      previousRow?.fundamentals_updated_at ??
      null,
    historical_updated_at:
      timestampPatch.historical_updated_at ??
      previousRow?.historical_updated_at ??
      null,
  };

  const { data, error } = await supabase
    .from("stock_metrics_cache")
    .upsert(row, { onConflict: "ticker" })
    .select("*")
    .maybeSingle();

  if (error) {
    await logRefresh(
      supabase,
      ticker,
      "error",
      `Cache upsert failed: ${error.message}`,
    );
    throw error;
  }

  return data as CacheRow | null;
}

async function fetchQuoteGroup(ticker: string): Promise<GroupResult> {
  const quote = await safePatch("quote", async () => {
    const record = await fetchYahooQuoteRecord(ticker);
    return {
      quote: record,
      profile: compactPayloadRecord({
        companyName: firstString(record, [
          "companyName",
          "name",
          "longName",
          "shortName",
        ]),
        company: firstString(record, [
          "companyName",
          "name",
          "longName",
          "shortName",
        ]),
        name: firstString(record, [
          "companyName",
          "name",
          "longName",
          "shortName",
        ]),
        price: firstNumber(record, [
          "price",
          "currentPrice",
          "regularMarketPrice",
        ]),
        beta: firstNumber(record, ["beta"]),
      }),
    };
  });

  return groupResult([quote]);
}

async function fetchSingleQuoteRefreshGroup(
  ticker: string,
): Promise<GroupResult> {
  const result = await fetchBatchQuoteGroup([ticker]);
  const quote =
    result.patch.quotes?.find(
      (record) =>
        normalizeTicker(firstString(record, ["symbol", "ticker"]) ?? "") ===
        ticker,
    ) ?? null;

  return {
    patch: quote ? { quote } : {},
    errors: result.errors,
    hasSuccess: Boolean(quote),
  };
}

async function fetchBatchQuoteGroup(tickers: string[]): Promise<GroupResult> {
  const quotes = await safePatch("batch-quote", async () => ({
    quotes: await fetchYahooQuoteRecords(tickers),
  }));

  return groupResult([quotes]);
}

async function fetchFundamentalsGroup(ticker: string): Promise<GroupResult> {
  const from = toIsoDate(addDays(new Date(), -(7 * 365 + 21)));
  const [series, summary] = await Promise.all([
    safePatch("fundamentals-time-series", () =>
      fetchYahooFundamentalsPayload(ticker, from),
    ),
    safePatch("quote-summary", () => fetchYahooSummaryPayload(ticker)),
  ]);

  return groupResult([series, summary]);
}

async function fetchHistoricalGroup(ticker: string): Promise<GroupResult> {
  const today = toIsoDate(new Date());
  const from = toIsoDate(addDays(new Date(), -(5 * 365 + 21)));

  const historical = await safePatch("historical", async () => ({
    historical: await fetchYahooHistoricalRecords(ticker, from, today),
  }));

  return groupResult([historical]);
}

async function safePatch(
  label: string,
  load: () => Promise<Partial<CachedStockPayload>>,
): Promise<EndpointResult> {
  try {
    return { patch: await load() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Yahoo endpoint failed: ${label}`, { message });
    return { error: `${label}: ${message}` };
  }
}

function groupResult(results: EndpointResult[]): GroupResult {
  const patch: Partial<CachedStockPayload> = {};
  const errors: string[] = [];
  let hasSuccess = false;

  for (const result of results) {
    if (result.error) {
      errors.push(result.error);
      continue;
    }

    if (result.patch && Object.keys(result.patch).length > 0) {
      Object.assign(patch, result.patch);
      hasSuccess = true;
    }
  }

  return { patch, errors, hasSuccess };
}

function normalizePayload(
  payload: CachedStockPayload | null | undefined,
): CachedStockPayload {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  return payload;
}

function isCurrentProviderPayload(payload: CachedStockPayload): boolean {
  return (
    payload._meta?.provider === CACHE_PROVIDER &&
    payload._meta?.schemaVersion === CACHE_SCHEMA_VERSION
  );
}

function stampCachePayload(payload: CachedStockPayload, now: Date): void {
  payload._meta = {
    provider: CACHE_PROVIDER,
    refreshedAt: now.toISOString(),
    schemaVersion: CACHE_SCHEMA_VERSION,
  };
}

function compactPayloadRecord(record: Record<string, unknown>): JsonRecord {
  const compact: JsonRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined && value !== "") {
      compact[key] = value;
    }
  }

  return compact;
}

export function composeStockData(
  ticker: string,
  payload: CachedStockPayload,
  moat: Moat,
  cacheRow?: CacheRow | null,
): StockData {
  const profile = payload.profile ?? null;
  const quote = payload.quote ?? null;
  const incomeTtm =
    payload.incomeStatementTtm ?? first(payload.incomeStatements);
  const latestIncomeGrowth = first(payload.incomeStatementGrowth);
  const latestIncome = first(payload.incomeStatements);
  const previousIncome = second(payload.incomeStatements);
  const latestBalance = payload.balanceSheets?.[0] ?? null;
  const cashFlowTtm = payload.cashFlowTtm ?? first(payload.cashFlows);
  const latestCashFlow = first(payload.cashFlows);
  const ratiosTtm = payload.ratiosTtm ?? null;
  const keyMetricsTtm = payload.keyMetricsTtm ?? null;

  const currentPrice =
    firstNumber(quote, ["price", "currentPrice", "regularMarketPrice"]) ??
    firstNumber(profile, ["price", "stockPrice"]);

  const revenue =
    firstNumber(incomeTtm, ["revenue"]) ??
    firstNumber(latestIncome, ["revenue"]);
  const grossProfit =
    firstNumber(incomeTtm, ["grossProfit"]) ??
    firstNumber(latestIncome, ["grossProfit"]);
  const operatingIncome =
    firstNumber(incomeTtm, ["operatingIncome"]) ??
    firstNumber(latestIncome, ["operatingIncome"]);
  const ebit =
    firstNumber(incomeTtm, ["ebit"]) ??
    operatingIncome ??
    firstNumber(latestIncome, ["ebit"]);
  const totalAssets = firstNumber(latestBalance, ["totalAssets"]);
  const totalCurrentLiabilities = firstNumber(latestBalance, [
    "totalCurrentLiabilities",
    "totalCurrentLiability",
  ]);
  const totalDebt =
    firstNumber(latestBalance, ["totalDebt"]) ??
    firstNumber(latestBalance, ["totalDebtAndCapitalLeaseObligations"]) ??
    sumPresent([
      firstNumber(latestBalance, [
        "shortTermDebtAndCapitalLeaseObligation",
        "shortTermDebtAndCapitalLeaseObligations",
        "shortTermDebt",
        "currentDebt",
        "currentDebtAndCapitalLeaseObligation",
      ]),
      firstNumber(latestBalance, [
        "longTermDebtAndCapitalLeaseObligation",
        "longTermDebtAndCapitalLeaseObligations",
        "longTermDebt",
        "nonCurrentDebt",
        "capitalLeaseObligations",
      ]),
    ]) ??
    totalDebtFromNetDebt(
      firstNumber(latestBalance, ["netDebt"]),
      firstNumber(latestBalance, [
        "cashAndCashEquivalents",
        "cashAndShortTermInvestments",
        "cashAndCashEquivalentsAndShortTermInvestments",
      ]),
    );
  const totalEquity = firstNumber(latestBalance, [
    "totalStockholdersEquity",
    "totalShareholdersEquity",
    "stockholdersEquity",
    "totalEquity",
  ]);
  const cashAndEquivalents = firstNumber(latestBalance, [
    "cashAndCashEquivalents",
    "cashAndShortTermInvestments",
    "cashAndCashEquivalentsAndShortTermInvestments",
  ]);
  const netDebt =
    firstNumber(latestBalance, ["netDebt"]) ??
    firstNumber(keyMetricsTtm, ["netDebt"]) ??
    subtractNullable(totalDebt, cashAndEquivalents);
  const freeCashFlow =
    firstNumber(cashFlowTtm, ["freeCashFlow"]) ??
    firstNumber(latestCashFlow, ["freeCashFlow"]) ??
    freeCashFlowFromCfoAndCapex(
      firstNumber(cashFlowTtm, [
        "operatingCashFlow",
        "netCashProvidedByOperatingActivities",
      ]) ??
        firstNumber(latestCashFlow, [
          "operatingCashFlow",
          "netCashProvidedByOperatingActivities",
        ]),
      firstNumber(cashFlowTtm, ["capitalExpenditure", "capitalExpenditures"]) ??
        firstNumber(latestCashFlow, [
          "capitalExpenditure",
          "capitalExpenditures",
        ]),
    );
  const epsTtm =
    firstNumber(incomeTtm, ["eps", "epsDiluted", "epsdiluted"]) ??
    firstNumber(keyMetricsTtm, [
      "netIncomePerShareTTM",
      "epsTTM",
      "trailingEps",
    ]) ??
    firstNumber(quote, ["eps", "epsTrailingTwelveMonths", "trailingEps"]);
  const ebitdaTtm =
    firstNumber(incomeTtm, ["ebitda", "EBITDA"]) ??
    firstNumber(keyMetricsTtm, ["ebitdaTTM", "ebitda"]);
  const latestEps = epsFromIncome(latestIncome);
  const previousEps = epsFromIncome(previousIncome);

  const grossMargin =
    percentageRatio(grossProfit, revenue) ??
    asPercent(
      firstNumber(ratiosTtm, [
        "grossProfitMarginTTM",
        "grossProfitMargin",
        "grossMarginTTM",
      ]),
    );
  const operatingMargin =
    percentageRatio(operatingIncome, revenue) ??
    asPercent(
      firstNumber(ratiosTtm, [
        "operatingProfitMarginTTM",
        "operatingProfitMargin",
        "operatingMarginTTM",
      ]),
    );
  const roce =
    percentageRatioPositiveDenominator(
      ebit,
      subtractNullable(totalAssets, totalCurrentLiabilities),
    ) ??
    asPercent(
      firstNumber(keyMetricsTtm, ["returnOnCapitalEmployedTTM", "roceTTM"]),
    );
  const fcfMargin =
    percentageRatio(freeCashFlow, revenue) ??
    asPercent(
      firstNumber(ratiosTtm, [
        "freeCashFlowMarginTTM",
        "freeCashFlowToSalesTTM",
        "fcfMarginTTM",
      ]),
    );
  const reportedPe =
    positiveNumber(
      firstNumber(ratiosTtm, [
        "priceEarningsRatioTTM",
        "peRatioTTM",
        "priceToEarningsRatioTTM",
      ]),
    ) ?? positiveNumber(firstNumber(quote, ["pe", "peRatio", "trailingPE"]));
  const pe = reportedPe ?? priceEarningsRatio(currentPrice, epsTtm);
  const forwardEps =
    estimatedNextYearEps(payload.estimates ?? []) ??
    firstNumber(keyMetricsTtm, ["forwardEps"]) ??
    firstNumber(quote, ["epsForward"]);
  const reportedForwardPe =
    positiveNumber(firstNumber(keyMetricsTtm, ["forwardPE", "forwardPe"])) ??
    positiveNumber(firstNumber(quote, ["forwardPE", "forwardPe"]));
  const forwardPe =
    priceEarningsRatio(currentPrice, forwardEps) ?? reportedForwardPe;
  const revenueGrowth =
    growthPercent(
      firstNumber(latestIncome, ["revenue"]),
      firstNumber(previousIncome, ["revenue"]),
    ) ??
    asPercent(
      firstNumber(latestIncomeGrowth, [
        "growthRevenue",
        "revenueGrowth",
        "growthRevenueTTM",
      ]),
    ) ??
    asPercent(firstNumber(ratiosTtm, ["revenueGrowthTTM"]));
  const epsGrowth =
    growthPercentPositiveBase(latestEps, previousEps) ??
    asPercent(
      firstNumber(latestIncomeGrowth, [
        "growthEPS",
        "growthEPSDiluted",
        "epsGrowth",
        "epsdilutedGrowth",
      ]),
    ) ??
    asPercent(firstNumber(ratiosTtm, ["epsGrowthTTM"])) ??
    growthPercentPositiveBase(forwardEps, epsTtm);
  const reportedPeg =
    positiveNumber(firstNumber(keyMetricsTtm, ["pegRatioTTM", "pegRatio"])) ??
    positiveNumber(
      firstNumber(ratiosTtm, ["priceEarningsToGrowthRatioTTM", "pegRatioTTM"]),
    );
  const peg = reportedPeg ?? pegFromPeAndGrowth(pe, epsGrowth);
  const debtToEquity =
    dividePositiveDenominator(totalDebt, totalEquity) ??
    nonNegativeNumber(
      firstNumber(ratiosTtm, [
        "debtEquityRatioTTM",
        "debtToEquityRatioTTM",
        "debtToEquity",
      ]),
    );
  const netDebtToEbitda = dividePositiveDenominator(netDebt, ebitdaTtm);

  const historical = normalizeHistoricalPoints(payload.historical ?? []);
  const performance = calculatePerformance(historical);
  const redFlags = calculateRedFlags({
    debtToEquity,
    netDebtToEbitda,
    cashFlows: payload.cashFlows ?? [],
  });

  const stockData: StockData = {
    ticker,
    company:
      firstString(profile, ["companyName", "company", "name"]) ??
      firstString(quote, ["name", "companyName"]),
    currentPrice: roundNumber(currentPrice),
    oneYearChart: performance.oneYearChart,
    performance1W: roundNumber(performance.performance1W),
    performance1Y: roundNumber(performance.performance1Y),
    performance3Y: roundNumber(performance.performance3Y),
    performance5Y: roundNumber(performance.performance5Y),
    analystConsensus: analystConsensus(payload.gradesConsensus ?? null),
    grossMargin: roundNumber(grossMargin),
    operatingMargin: roundNumber(operatingMargin),
    roce: roundNumber(roce),
    fcfMargin: roundNumber(fcfMargin),
    pe: roundNumber(pe),
    forwardPe: roundNumber(forwardPe),
    peg: roundNumber(peg),
    netDebtToEbitda: roundNumber(netDebtToEbitda),
    revenueGrowth: roundNumber(revenueGrowth),
    epsGrowth: roundNumber(epsGrowth),
    debtToEquity: roundNumber(debtToEquity),
    beta: roundNumber(
      firstNumber(profile, ["beta"]) ?? firstNumber(quote, ["beta"]),
    ),
    sector: firstString(profile, ["sector"]),
    industry: firstString(profile, ["industry"]),
    moat,
    redFlags: redFlags.messages,
    scorePenalty: redFlags.penalty,
    score: null,
    lastUpdated: latestTimestamp(cacheRow),
  };

  stockData.score = calculateScore(stockData);
  return stockData;
}

export function calculateScore(data: StockData): number | null {
  const factors: Array<{
    weight: number;
    points: number | null;
    missingCredit?: boolean;
  }> = [
    {
      weight: 20,
      points: scoreThreshold(data.roce, [
        [40, 20],
        [30, 18],
        [20, 16],
        [15, 13],
        [10, 9],
        [0, 5],
      ]),
    },
    {
      weight: 7.5,
      points: scoreThreshold(data.grossMargin, [
        [70, 7.5],
        [60, 6],
        [45, 3.75],
        [0, 1.5],
      ]),
    },
    {
      weight: 7.5,
      points: scoreThreshold(data.operatingMargin, [
        [35, 7.5],
        [25, 6],
        [15, 3.75],
        [0, 2.25],
      ]),
    },
    {
      weight: 10,
      points: scoreThreshold(data.epsGrowth, [
        [20, 10],
        [15, 8],
        [10, 6],
        [5, 4],
        [0, 2],
      ]),
    },
    {
      weight: 10,
      points: scoreThreshold(data.fcfMargin, [
        [25, 10],
        [20, 8],
        [10, 5],
        [0, 3],
      ]),
    },
    {
      weight: 5,
      points: scoreThreshold(data.revenueGrowth, [
        [15, 5],
        [10, 4],
        [5, 3],
        [0, 1],
      ]),
    },
    { weight: 15, points: moatScore(data.moat), missingCredit: false },
    { weight: 10, points: valuationScore(data.peg, data.pe) },
    { weight: 10, points: debtScore(data.netDebtToEbitda, data.debtToEquity) },
    { weight: 5, points: analystScore(data.analystConsensus) },
  ];

  const scoredFactors = factors.filter((factor) => factor.points !== null);
  if (scoredFactors.length === 0) {
    return null;
  }

  const rawScore = factors.reduce((sum, factor) => {
    const fallback = factor.missingCredit === false ? 0 : factor.weight * 0.3;
    return sum + (factor.points ?? fallback);
  }, 0);
  const score = rawScore - (data.scorePenalty ?? 0);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreThreshold(
  value: number | null,
  thresholds: Array<[minimum: number, points: number]>,
): number | null {
  if (value == null) {
    return null;
  }

  for (const [minimum, points] of thresholds) {
    if (value >= minimum) {
      return points;
    }
  }

  return 0;
}

function valuationScore(peg: number | null, pe: number | null): number | null {
  if (peg != null) {
    if (peg < 1) return 10;
    if (peg < 1.5) return 8;
    if (peg < 2) return 5;
    if (peg < 3) return 2;
    return 0;
  }

  if (pe != null) {
    if (pe <= 20) return 7;
    if (pe <= 30) return 5;
    if (pe <= 40) return 3;
    return 1;
  }

  return null;
}

function debtScore(
  netDebtToEbitda: number | null,
  debtToEquity: number | null,
): number | null {
  if (netDebtToEbitda != null) {
    if (netDebtToEbitda < 0) return 10;
    if (netDebtToEbitda <= 1) return 9;
    if (netDebtToEbitda <= 2) return 7;
    if (netDebtToEbitda <= 3) return 5;
    if (netDebtToEbitda <= 4) return 2;
    return 0;
  }

  if (debtToEquity == null) {
    return null;
  }

  if (debtToEquity < 0.3) return 10;
  if (debtToEquity < 0.5) return 8;
  if (debtToEquity < 1) return 6;
  if (debtToEquity < 1.5) return 3;
  return 0;
}

function analystScore(consensus: string | null): number | null {
  if (!consensus) {
    return null;
  }

  const normalized = consensus.toLowerCase();
  if (normalized.includes("strong buy")) return 5;
  if (normalized.includes("buy") && !normalized.includes("sell")) return 4;
  if (normalized.includes("hold") || normalized.includes("neutral")) return 2.5;
  if (normalized.includes("strong sell")) return 0;
  if (normalized.includes("sell")) return 1;
  return null;
}

function moatScore(moat: Moat): number {
  switch (moat) {
    case "Excellent":
      return 15;
    case "Very Good":
      return 12;
    case "Good":
      return 9;
    case "Average":
      return 6;
    case "Bad":
      return 3;
    case "Very Bad":
      return 0;
    case "Unknown":
      return 3;
  }
}

function calculateRedFlags(input: {
  debtToEquity: number | null;
  netDebtToEbitda: number | null;
  cashFlows: JsonRecord[];
}): { messages: string[]; penalty: number } {
  const messages: string[] = [];
  let penalty = 0;

  if (
    input.debtToEquity !== null &&
    input.debtToEquity > 2 &&
    input.netDebtToEbitda !== null &&
    input.netDebtToEbitda > 3
  ) {
    messages.push("Debt/Equity > 2 and Net Debt/EBITDA > 3");
    penalty += 10;
  }

  if (hasTwoLatestNegativeFreeCashFlow(input.cashFlows)) {
    messages.push("FCF negative for 2 latest years");
    penalty += 10;
  }

  return { messages, penalty: Math.min(20, penalty) };
}

function hasTwoLatestNegativeFreeCashFlow(cashFlows: JsonRecord[]): boolean {
  const latestTwo = cashFlows
    .map((record) => firstNumber(record, ["freeCashFlow"]))
    .filter((value): value is number => value !== null)
    .slice(0, 2);

  return latestTwo.length >= 2 && latestTwo.every((value) => value < 0);
}

function analystConsensus(record: JsonRecord | null): string | null {
  const explicit = firstString(record, [
    "consensus",
    "rating",
    "grade",
    "recommendation",
    "analystConsensus",
  ]);
  if (explicit) {
    return explicit;
  }

  const buckets: Array<[string, number | null]> = [
    ["Strong Buy", firstNumber(record, ["strongBuy", "strongBuyRatings"])],
    ["Buy", firstNumber(record, ["buy", "buyRatings"])],
    ["Hold", firstNumber(record, ["hold", "holdRatings"])],
    ["Sell", firstNumber(record, ["sell", "sellRatings"])],
    ["Strong Sell", firstNumber(record, ["strongSell", "strongSellRatings"])],
  ];

  const winner = buckets
    .filter(([, count]) => count !== null)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];

  return winner && (winner[1] ?? 0) > 0 ? winner[0] : null;
}

function estimatedNextYearEps(estimates: JsonRecord[]): number | null {
  const sorted = [...estimates].sort((a, b) =>
    String(a.date ?? a.fiscalDateEnding ?? "").localeCompare(
      String(b.date ?? b.fiscalDateEnding ?? ""),
    ),
  );
  const nextYear = new Date().getUTCFullYear() + 1;
  const next =
    sorted.find((estimate) => {
      const date = String(estimate.date ?? estimate.fiscalDateEnding ?? "");
      return Number(date.slice(0, 4)) >= nextYear;
    }) ??
    sorted[1] ??
    sorted[0];

  const average = firstNumber(next, [
    "estimatedEpsAvg",
    "estimatedEpsAverage",
    "epsAvg",
    "epsEstimated",
    "estimatedEps",
  ]);

  if (average !== null) {
    return average;
  }

  const low = firstNumber(next, ["estimatedEpsLow", "epsLow"]);
  const high = firstNumber(next, ["estimatedEpsHigh", "epsHigh"]);
  return low !== null && high !== null ? (low + high) / 2 : null;
}

function calculatePerformance(points: Array<{ date: string; close: number }>) {
  const oneYearChart: Array<{ date: string; close: number }> = [];
  const result = {
    oneYearChart,
    performance1W: null as number | null,
    performance1Y: null as number | null,
    performance3Y: null as number | null,
    performance5Y: null as number | null,
  };

  if (points.length === 0) {
    return result;
  }

  const end = points[points.length - 1];
  const endDate = dateFromIso(end.date);
  if (!endDate) {
    return result;
  }

  const oneYearAgo = addDays(endDate, -365);
  result.oneYearChart.push(
    ...points.filter((point) => point.date >= toIsoDate(oneYearAgo)),
  );

  result.performance1W = performanceFromStart(
    points,
    end,
    addDays(endDate, -7),
  );
  result.performance1Y = performanceFromStart(
    points,
    end,
    addDays(endDate, -365),
  );
  result.performance3Y = performanceFromStart(
    points,
    end,
    addDays(endDate, -(3 * 365)),
  );
  result.performance5Y = performanceFromStart(
    points,
    end,
    addDays(endDate, -(5 * 365)),
  );

  return result;
}

function performanceFromStart(
  points: Array<{ date: string; close: number }>,
  end: { date: string; close: number },
  targetDate: Date,
): number | null {
  const start = findAtOrBefore(points, toIsoDate(targetDate));
  if (!start || start.close === 0) {
    return null;
  }

  return ((end.close - start.close) / start.close) * 100;
}

function findAtOrBefore(
  points: Array<{ date: string; close: number }>,
  targetIso: string,
): { date: string; close: number } | null {
  for (let index = points.length - 1; index >= 0; index--) {
    if (points[index].date <= targetIso) {
      return points[index];
    }
  }

  return null;
}

function normalizeHistoricalPoints(
  records: JsonRecord[],
): Array<{ date: string; close: number }> {
  return records
    .map((record) => {
      const date = firstString(record, ["date"]);
      const close = firstNumber(record, ["close", "adjClose", "price"]);
      return date && close !== null ? { date, close } : null;
    })
    .filter((point): point is { date: string; close: number } => point !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function first(records: JsonRecord[] | null | undefined): JsonRecord | null {
  return records?.[0] ?? null;
}

function second(records: JsonRecord[] | null | undefined): JsonRecord | null {
  return records?.[1] ?? null;
}

function firstNumber(
  record: JsonRecord | null | undefined,
  keys: string[],
): number | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = numeric(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function epsFromIncome(record: JsonRecord | null | undefined): number | null {
  return (
    firstNumber(record, ["eps", "epsDiluted", "epsdiluted"]) ??
    divideNullable(
      firstNumber(record, ["netIncome"]),
      firstNumber(record, [
        "weightedAverageShsOutDil",
        "weightedAverageShsOutDiluted",
        "weightedAverageShsOut",
      ]),
    )
  );
}

function sumPresent(values: Array<number | null>): number | null {
  const numericValues = values.filter(
    (value): value is number => value !== null,
  );

  return numericValues.length > 0
    ? numericValues.reduce((sum, value) => sum + value, 0)
    : null;
}

function freeCashFlowFromCfoAndCapex(
  operatingCashFlow: number | null,
  capitalExpenditure: number | null,
): number | null {
  if (operatingCashFlow === null || capitalExpenditure === null) {
    return null;
  }

  return capitalExpenditure < 0
    ? operatingCashFlow + capitalExpenditure
    : operatingCashFlow - capitalExpenditure;
}

function totalDebtFromNetDebt(
  netDebt: number | null,
  cashAndEquivalents: number | null,
): number | null {
  if (netDebt === null || cashAndEquivalents === null) {
    return null;
  }

  const totalDebt = netDebt + cashAndEquivalents;
  return totalDebt !== null && totalDebt >= 0 ? totalDebt : null;
}

function firstString(
  record: JsonRecord | null | undefined,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function positiveNumber(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

function nonNegativeNumber(value: number | null): number | null {
  return value !== null && value >= 0 ? value : null;
}

function percentageRatio(
  numerator: number | null,
  denominator: number | null,
): number | null {
  const ratio = divideNullable(numerator, denominator);
  return ratio === null ? null : ratio * 100;
}

function percentageRatioPositiveDenominator(
  numerator: number | null,
  denominator: number | null,
): number | null {
  const ratio = dividePositiveDenominator(numerator, denominator);
  return ratio === null ? null : ratio * 100;
}

function growthPercent(
  latest: number | null,
  previous: number | null,
): number | null {
  if (latest === null || previous === null || previous === 0) {
    return null;
  }

  return ((latest - previous) / Math.abs(previous)) * 100;
}

function growthPercentPositiveBase(
  latest: number | null,
  previous: number | null,
): number | null {
  if (latest === null || previous === null || latest <= 0 || previous <= 0) {
    return null;
  }

  return ((latest - previous) / previous) * 100;
}

function asPercent(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.abs(value) <= 1 ? value * 100 : value;
}

function divideNullable(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function dividePositiveDenominator(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (denominator === null || denominator <= 0) {
    return null;
  }

  return divideNullable(numerator, denominator);
}

function priceEarningsRatio(
  price: number | null,
  eps: number | null,
): number | null {
  if (price === null || price <= 0 || eps === null || eps <= 0) {
    return null;
  }

  return price / eps;
}

function pegFromPeAndGrowth(
  pe: number | null,
  epsGrowthPercent: number | null,
): number | null {
  if (
    pe === null ||
    pe <= 0 ||
    epsGrowthPercent === null ||
    epsGrowthPercent <= 0
  ) {
    return null;
  }

  return pe / epsGrowthPercent;
}

function subtractNullable(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null || right === null) {
    return null;
  }

  return left - right;
}

function roundNumber(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function isFresh(
  timestamp: string | null | undefined,
  ttlMs: number,
  now: Date,
): boolean {
  if (!timestamp) {
    return false;
  }

  const then = new Date(timestamp).getTime();
  return Number.isFinite(then) && now.getTime() - then < ttlMs;
}

function latestTimestamp(cacheRow?: CacheRow | null): string | null {
  const timestamps = [
    cacheRow?.quote_updated_at,
    cacheRow?.fundamentals_updated_at,
    cacheRow?.historical_updated_at,
    cacheRow?.updated_at,
  ]
    .filter((value): value is string => Boolean(value))
    .sort();

  return timestamps.at(-1) ?? null;
}

function hasQuotePayload(payload: CachedStockPayload): boolean {
  return "quote" in payload || "profile" in payload;
}

function hasFundamentalsPayload(payload: CachedStockPayload): boolean {
  return Boolean(
    payload.incomeStatements ||
    payload.incomeStatementGrowth ||
    payload.incomeStatementTtm ||
    payload.balanceSheets ||
    payload.cashFlows ||
    payload.cashFlowTtm ||
    payload.ratiosTtm ||
    payload.keyMetricsTtm ||
    payload.estimates ||
    payload.gradesConsensus,
  );
}

function hasHistoricalPayload(payload: CachedStockPayload): boolean {
  return Array.isArray(payload.historical);
}

function isRecord(input: unknown): input is JsonRecord {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function isMoat(input: unknown): input is Moat {
  return typeof input === "string" && MOAT_VALUES.includes(input as Moat);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
