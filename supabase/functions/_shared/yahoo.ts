import YahooFinance from "jsr:@gadicc/yahoo-finance2@3.15.2";
import type { CachedStockPayload, JsonRecord } from "./types.ts";

type YahooFinanceClient = InstanceType<typeof YahooFinance>;

const QUOTE_SUMMARY_MODULES = [
  "price",
  "summaryDetail",
  "summaryProfile",
  "assetProfile",
  "financialData",
  "defaultKeyStatistics",
  "earningsTrend",
  "recommendationTrend",
];

let yahooFinance: YahooFinanceClient | null = null;

export class YahooFinanceError extends Error {
  endpoint: string;

  constructor(endpoint: string, message: string) {
    super(message);
    this.name = "YahooFinanceError";
    this.endpoint = endpoint;
  }
}

export async function fetchYahooQuoteRecord(ticker: string): Promise<JsonRecord> {
  const quote = await getYahooFinance().quote(ticker);
  if (!isRecord(quote)) {
    throw new YahooFinanceError("quote", `Yahoo returned no quote for ${ticker}`);
  }

  return normalizeQuoteRecord(quote);
}

export async function fetchYahooQuoteRecords(tickers: string[]): Promise<JsonRecord[]> {
  if (tickers.length === 0) {
    return [];
  }

  const quotes = await getYahooFinance().quote(tickers, {
    return: "array",
  } as Record<string, unknown>);
  const records = recordArray(quotes).map(normalizeQuoteRecord);

  if (records.length === 0) {
    throw new YahooFinanceError(
      "quote",
      `Yahoo returned no quotes for ${tickers.join(",")}`,
    );
  }

  return records;
}

export async function fetchYahooHistoricalRecords(
  ticker: string,
  from: string,
  to: string,
): Promise<JsonRecord[]> {
  const history = await getYahooFinance().historical(ticker, {
    period1: from,
    period2: to,
    interval: "1d",
    events: "history",
    includeAdjustedClose: true,
  });

  return recordArray(history)
    .map((record) =>
      compactRecord({
        date: isoDate(record.date),
        close: firstNumber(record, ["adjClose", "close"]),
      })
    )
    .filter((record) => typeof record.date === "string" && record.close !== undefined)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export async function fetchYahooFundamentalsPayload(
  ticker: string,
  from: string,
): Promise<Partial<CachedStockPayload>> {
  const [annualResult, trailingResult] = await Promise.allSettled([
    getYahooFinance().fundamentalsTimeSeries(ticker, {
      period1: from,
      type: "annual",
      module: "all",
    }),
    getYahooFinance().fundamentalsTimeSeries(ticker, {
      period1: from,
      type: "trailing",
      module: "all",
    }),
  ]);

  const patch: Partial<CachedStockPayload> = {};
  const errors: string[] = [];

  if (annualResult.status === "fulfilled") {
    const annualRows = sortDescendingByDate(recordArray(annualResult.value));
    const incomeStatements = annualRows
      .map((record) => normalizeIncomeStatement(record, "annual"))
      .filter(hasMeaningfulData);
    const balanceSheets = annualRows
      .map((record) => normalizeBalanceSheet(record, "annual"))
      .filter(hasMeaningfulData);
    const cashFlows = annualRows
      .map((record) => normalizeCashFlow(record, "annual"))
      .filter(hasMeaningfulData);

    if (incomeStatements.length > 0) {
      patch.incomeStatements = incomeStatements;
    }
    if (balanceSheets.length > 0) {
      patch.balanceSheets = balanceSheets;
    }
    if (cashFlows.length > 0) {
      patch.cashFlows = cashFlows;
    }
  } else {
    errors.push(errorMessage(annualResult.reason));
  }

  if (trailingResult.status === "fulfilled") {
    const trailingRows = sortDescendingByDate(recordArray(trailingResult.value));
    const trailing = trailingRows[0] ?? null;

    if (trailing) {
      const incomeStatementTtm = normalizeIncomeStatement(trailing, "trailing");
      const cashFlowTtm = normalizeCashFlow(trailing, "trailing");

      if (hasMeaningfulData(incomeStatementTtm)) {
        patch.incomeStatementTtm = incomeStatementTtm;
      }
      if (hasMeaningfulData(cashFlowTtm)) {
        patch.cashFlowTtm = cashFlowTtm;
      }
    }
  } else {
    errors.push(errorMessage(trailingResult.reason));
  }

  if (Object.keys(patch).length === 0) {
    throw new YahooFinanceError(
      "fundamentalsTimeSeries",
      errors.join(" | ") || `Yahoo returned no fundamentals for ${ticker}`,
    );
  }

  return patch;
}

export async function fetchYahooSummaryPayload(
  ticker: string,
): Promise<Partial<CachedStockPayload>> {
  const summary = await getYahooFinance().quoteSummary(ticker, {
    modules: QUOTE_SUMMARY_MODULES,
  } as Record<string, unknown>);

  if (!isRecord(summary)) {
    throw new YahooFinanceError(
      "quoteSummary",
      `Yahoo returned no summary for ${ticker}`,
    );
  }

  const price = childRecord(summary, "price");
  const summaryDetail = childRecord(summary, "summaryDetail");
  const summaryProfile = childRecord(summary, "summaryProfile");
  const assetProfile = childRecord(summary, "assetProfile");
  const financialData = childRecord(summary, "financialData");
  const defaultKeyStatistics = childRecord(summary, "defaultKeyStatistics");
  const earningsTrend = childRecord(summary, "earningsTrend");
  const recommendationTrend = childRecord(summary, "recommendationTrend");

  const totalRevenue = firstNumber(financialData, ["totalRevenue"]);
  const freeCashflow = firstNumber(financialData, ["freeCashflow"]);
  const debtToEquity = yahooDebtToEquityRatio(
    firstNumber(financialData, ["debtToEquity"]),
  );
  const recommendation = recommendationFromKey(
    firstString(financialData, ["recommendationKey"]) ??
      firstString(price, ["averageAnalystRating"]),
  );

  return stripEmptyPayload({
    profile: compactRecord({
      companyName: firstString(price, ["longName", "shortName"]) ??
        firstString(summaryProfile, ["name"]) ??
        firstString(assetProfile, ["name"]),
      company: firstString(price, ["longName", "shortName"]),
      name: firstString(price, ["longName", "shortName"]),
      price: firstNumber(financialData, ["currentPrice"]) ??
        firstNumber(price, ["regularMarketPrice", "postMarketPrice", "preMarketPrice"]),
      beta: firstNumber(defaultKeyStatistics, ["beta"]) ??
        firstNumber(summaryDetail, ["beta"]),
      sector: firstString(assetProfile, ["sector"]) ??
        firstString(summaryProfile, ["sector"]),
      industry: firstString(assetProfile, ["industry"]) ??
        firstString(summaryProfile, ["industry"]),
    }),
    ratiosTtm: compactRecord({
      grossProfitMarginTTM: firstNumber(financialData, ["grossMargins"]),
      operatingProfitMarginTTM: firstNumber(financialData, ["operatingMargins"]),
      freeCashFlowMarginTTM: ratio(freeCashflow, totalRevenue),
      priceEarningsRatioTTM: firstNumber(summaryDetail, ["trailingPE"]) ??
        firstNumber(price, ["trailingPE"]),
      revenueGrowthTTM: firstNumber(financialData, ["revenueGrowth"]),
      epsGrowthTTM: firstNumber(financialData, ["earningsGrowth"]),
      debtEquityRatioTTM: debtToEquity,
    }),
    keyMetricsTtm: compactRecord({
      pegRatioTTM: firstNumber(defaultKeyStatistics, ["pegRatio"]),
      forwardPE: firstNumber(defaultKeyStatistics, ["forwardPE"]) ??
        firstNumber(summaryDetail, ["forwardPE"]),
      forwardEps: firstNumber(defaultKeyStatistics, ["forwardEps"]),
      epsTTM: firstNumber(defaultKeyStatistics, ["trailingEps"]),
      ebitdaTTM: firstNumber(financialData, ["ebitda"]),
      netDebt: subtractNullable(
        firstNumber(financialData, ["totalDebt"]),
        firstNumber(financialData, ["totalCash"]),
      ),
    }),
    estimates: normalizeEarningsEstimates(earningsTrend),
    gradesConsensus: compactRecord({
      recommendation,
      recommendationKey: firstString(financialData, ["recommendationKey"]),
      ...normalizeRecommendationBuckets(recommendationTrend),
    }),
  });
}

function getYahooFinance(): YahooFinanceClient {
  if (!yahooFinance) {
    yahooFinance = new YahooFinance();
  }

  return yahooFinance;
}

function normalizeQuoteRecord(record: JsonRecord): JsonRecord {
  const normalized = toJsonRecord(record);
  const price = firstNumber(normalized, [
    "regularMarketPrice",
    "postMarketPrice",
    "preMarketPrice",
  ]);
  const companyName = firstString(normalized, ["longName", "shortName", "displayName"]);

  return {
    ...normalized,
    companyName,
    name: companyName,
    price,
    currentPrice: price,
    pe: firstNumber(normalized, ["trailingPE"]),
    peRatio: firstNumber(normalized, ["trailingPE"]),
    eps: firstNumber(normalized, ["epsTrailingTwelveMonths"]),
    forwardPe: firstNumber(normalized, ["forwardPE"]),
    beta: firstNumber(normalized, ["beta"]),
  };
}

function normalizeIncomeStatement(record: JsonRecord, prefix: string): JsonRecord {
  const netIncome = seriesNumber(record, prefix, [
    "netIncome",
    "netIncomeCommonStockholders",
    "netIncomeFromContinuingOperations",
  ]);
  const dilutedShares = seriesNumber(record, prefix, [
    "dilutedAverageShares",
    "basicAverageShares",
    "ordinarySharesNumber",
    "shareIssued",
  ]);
  const eps = seriesNumber(record, prefix, [
    "dilutedEPS",
    "basicEPS",
    "normalizedDilutedEPS",
    "normalizedBasicEPS",
  ]) ?? ratio(netIncome, dilutedShares);

  return compactRecord({
    date: isoDate(record.date ?? record.asOfDate),
    revenue: seriesNumber(record, prefix, ["totalRevenue", "operatingRevenue"]),
    grossProfit: seriesNumber(record, prefix, ["grossProfit"]),
    operatingIncome: seriesNumber(record, prefix, [
      "operatingIncome",
      "totalOperatingIncomeAsReported",
    ]),
    ebit: seriesNumber(record, prefix, ["EBIT", "ebit"]),
    ebitda: seriesNumber(record, prefix, ["EBITDA", "ebitda"]),
    netIncome,
    eps,
    epsDiluted: eps,
    weightedAverageShsOutDil: dilutedShares,
  });
}

function normalizeBalanceSheet(record: JsonRecord, prefix: string): JsonRecord {
  const currentDebt = seriesNumber(record, prefix, [
    "currentDebtAndCapitalLeaseObligation",
    "currentDebt",
  ]);
  const longTermDebt = seriesNumber(record, prefix, [
    "longTermDebtAndCapitalLeaseObligation",
    "longTermDebt",
  ]);

  return compactRecord({
    date: isoDate(record.date ?? record.asOfDate),
    totalAssets: seriesNumber(record, prefix, ["totalAssets"]),
    totalCurrentLiabilities: seriesNumber(record, prefix, [
      "currentLiabilities",
      "totalCurrentLiabilities",
    ]),
    totalDebt: seriesNumber(record, prefix, ["totalDebt"]) ??
      sumPresent([currentDebt, longTermDebt]),
    currentDebtAndCapitalLeaseObligation: currentDebt,
    longTermDebtAndCapitalLeaseObligation: longTermDebt,
    totalStockholdersEquity: seriesNumber(record, prefix, [
      "stockholdersEquity",
      "commonStockEquity",
      "totalEquityGrossMinorityInterest",
    ]),
    cashAndCashEquivalents: seriesNumber(record, prefix, [
      "cashAndCashEquivalents",
      "cashCashEquivalentsAndShortTermInvestments",
      "cashAndShortTermInvestments",
    ]),
    netDebt: seriesNumber(record, prefix, ["netDebt"]),
  });
}

function normalizeCashFlow(record: JsonRecord, prefix: string): JsonRecord {
  return compactRecord({
    date: isoDate(record.date ?? record.asOfDate),
    operatingCashFlow: seriesNumber(record, prefix, [
      "operatingCashFlow",
      "cashFlowFromContinuingOperatingActivities",
    ]),
    capitalExpenditure: seriesNumber(record, prefix, [
      "capitalExpenditure",
      "capitalExpenditureReported",
    ]),
    freeCashFlow: seriesNumber(record, prefix, ["freeCashFlow"]),
  });
}

function normalizeEarningsEstimates(record: JsonRecord | null): JsonRecord[] | null {
  const trend = recordArray(record?.trend);
  const estimates = trend
    .map((item) => {
      const earningsEstimate = childRecord(item, "earningsEstimate");
      const revenueEstimate = childRecord(item, "revenueEstimate");

      return compactRecord({
        date: isoDate(item.endDate) ?? fiscalDateFromPeriod(firstString(item, ["period"])),
        period: firstString(item, ["period"]),
        estimatedEpsAvg: firstNumber(earningsEstimate, ["avg"]),
        estimatedEpsLow: firstNumber(earningsEstimate, ["low"]),
        estimatedEpsHigh: firstNumber(earningsEstimate, ["high"]),
        epsGrowth: firstNumber(earningsEstimate, ["growth"]),
        estimatedRevenueAvg: firstNumber(revenueEstimate, ["avg"]),
      });
    })
    .filter((item) => item.estimatedEpsAvg !== undefined);

  return estimates.length > 0 ? estimates : null;
}

function normalizeRecommendationBuckets(record: JsonRecord | null): JsonRecord {
  const latest = recordArray(record?.trend)[0] ?? null;
  if (!latest) {
    return {};
  }

  return compactRecord({
    strongBuy: firstNumber(latest, ["strongBuy"]),
    buy: firstNumber(latest, ["buy"]),
    hold: firstNumber(latest, ["hold"]),
    sell: firstNumber(latest, ["sell"]),
    strongSell: firstNumber(latest, ["strongSell"]),
  });
}

function recommendationFromKey(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("strong buy") || normalized === "strong_buy") {
    return "Strong Buy";
  }
  if (normalized.includes("buy")) {
    return "Buy";
  }
  if (normalized.includes("hold")) {
    return "Hold";
  }
  if (normalized.includes("strong sell") || normalized === "strong_sell") {
    return "Strong Sell";
  }
  if (normalized.includes("sell")) {
    return "Sell";
  }

  return value;
}

function yahooDebtToEquityRatio(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return value > 10 ? value / 100 : value;
}

function seriesNumber(
  record: JsonRecord,
  prefix: string,
  keys: string[],
): number | null {
  const candidates = keys.flatMap((key) => {
    const capitalized = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    return [
      `${prefix}${capitalized}`,
      `${prefix}${key}`,
      key,
      capitalized,
    ];
  });

  return firstNumber(record, candidates);
}

function stripEmptyPayload(
  payload: Partial<CachedStockPayload>,
): Partial<CachedStockPayload> {
  const next: Partial<CachedStockPayload> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      if (value.length > 0) {
        (next as Record<string, unknown>)[key] = value;
      }
      continue;
    }

    if (isRecord(value) && Object.keys(value).length > 0) {
      (next as Record<string, unknown>)[key] = value;
    }
  }

  return next;
}

function sortDescendingByDate(records: JsonRecord[]): JsonRecord[] {
  return records
    .map(toJsonRecord)
    .filter((record) => isoDate(record.date ?? record.asOfDate) !== null)
    .sort((a, b) =>
      String(isoDate(b.date ?? b.asOfDate)).localeCompare(
        String(isoDate(a.date ?? a.asOfDate)),
      )
    );
}

function hasMeaningfulData(record: JsonRecord): boolean {
  return Object.entries(record).some(([key, value]) =>
    key !== "date" && value !== undefined && value !== null
  );
}

function compactRecord(record: Record<string, unknown>): JsonRecord {
  const compact: JsonRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined && value !== "") {
      compact[key] = toJsonValue(value);
    }
  }

  return compact;
}

function childRecord(record: JsonRecord | null | undefined, key: string): JsonRecord | null {
  const value = record?.[key];
  return isRecord(value) ? toJsonRecord(value) : null;
}

function recordArray(input: unknown): JsonRecord[] {
  if (Array.isArray(input)) {
    return input.filter(isRecord).map(toJsonRecord);
  }

  if (input instanceof Map) {
    return Array.from(input.values()).filter(isRecord).map(toJsonRecord);
  }

  if (isRecord(input)) {
    if ("symbol" in input || "date" in input || "asOfDate" in input) {
      return [toJsonRecord(input)];
    }

    return Object.values(input).filter(isRecord).map(toJsonRecord);
  }

  return [];
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

  if (isRecord(value)) {
    return numeric(value.raw ?? value.fmt);
  }

  return null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function sumPresent(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => value !== null);
  return numericValues.length > 0
    ? numericValues.reduce((sum, value) => sum + value, 0)
    : null;
}

function subtractNullable(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }

  return left - right;
}

function toJsonRecord(record: JsonRecord): JsonRecord {
  return toJsonValue(record) as JsonRecord;
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue).filter((item) => item !== undefined);
  }

  if (isRecord(value)) {
    const next: JsonRecord = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const jsonValue = toJsonValue(nestedValue);
      if (jsonValue !== undefined) {
        next[key] = jsonValue;
      }
    }
    return next;
  }

  return value === undefined ? undefined : value;
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }

    return value.slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }

  return null;
}

function fiscalDateFromPeriod(period: string | null): string | null {
  if (!period) {
    return null;
  }

  const match = period.match(/^\+?(\d)y$/i);
  if (!match) {
    return null;
  }

  const year = new Date().getUTCFullYear() + Number(match[1]);
  return `${year}-12-31`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(input: unknown): input is JsonRecord {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}
