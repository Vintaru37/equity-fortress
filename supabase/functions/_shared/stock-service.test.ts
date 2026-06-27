import {
  calculateScore,
  composeStockData,
  createRefreshPayload,
} from "./stock-service.ts";
import type {
  CachedStockPayload,
  CacheRow,
  StockData,
} from "./types.ts";

const cacheRow: CacheRow = {
  ticker: "TEST",
  data_json: null,
  quote_updated_at: "2026-06-13T10:00:00.000Z",
  fundamentals_updated_at: "2026-06-13T10:00:00.000Z",
  historical_updated_at: "2026-06-13T10:00:00.000Z",
  created_at: "2026-06-13T10:00:00.000Z",
  updated_at: "2026-06-13T10:00:00.000Z",
};

Deno.test("composeStockData derives profitability, valuation, leverage, and growth metrics", () => {
  const payload: CachedStockPayload = {
    profile: {
      companyName: "Test Compounder",
      beta: 1.15,
      sector: "Technology",
      industry: "Software",
    },
    quote: {
      price: 100,
    },
    incomeStatementTtm: {
      revenue: 1000,
      grossProfit: 600,
      operatingIncome: 250,
      ebit: 220,
      ebitda: 300,
      eps: 5,
    },
    incomeStatements: [
      {
        revenue: 1000,
        netIncome: 500,
        weightedAverageShsOutDil: 100,
      },
      {
        revenue: 800,
        netIncome: 320,
        weightedAverageShsOutDil: 80,
      },
    ],
    balanceSheets: [
      {
        totalAssets: 2000,
        totalCurrentLiabilities: 500,
        totalDebt: 300,
        totalStockholdersEquity: 1000,
        cashAndCashEquivalents: 50,
      },
    ],
    cashFlowTtm: {
      freeCashFlow: 180,
    },
    estimates: [
      {
        date: "2027-12-31",
        estimatedEpsAvg: 6,
      },
    ],
  };

  const stock = composeStockData("TEST", payload, "Good", cacheRow);

  assertEquals(stock.company, "Test Compounder");
  assertEquals(stock.currentPrice, 100);
  assertEquals(stock.grossMargin, 60);
  assertEquals(stock.operatingMargin, 25);
  assertEquals(stock.roce, 14.67);
  assertEquals(stock.fcfMargin, 18);
  assertEquals(stock.pe, 20);
  assertEquals(stock.forwardPe, 16.67);
  assertEquals(stock.netDebtToEbitda, 0.83);
  assertEquals(stock.revenueGrowth, 25);
  assertEquals(stock.epsGrowth, 25);
  assertEquals(stock.debtToEquity, 0.3);
  assertEquals(stock.beta, 1.15);
  assertEquals(stock.sector, "Technology");
  assertEquals(stock.industry, "Software");
  assertEquals(stock.moat, "Good");
  assertEquals(stock.redFlags, []);
  assertEquals(stock.scorePenalty, 0);
});

Deno.test("composeStockData applies debt red flag only when both leverage thresholds are high", () => {
  const payload: CachedStockPayload = {
    quote: { price: 100 },
    incomeStatementTtm: {
      revenue: 1000,
      grossProfit: 600,
      operatingIncome: 250,
      ebit: 220,
      ebitda: 100,
      eps: 5,
    },
    balanceSheets: [
      {
        totalAssets: 2000,
        totalCurrentLiabilities: 500,
        totalDebt: 900,
        totalStockholdersEquity: 300,
        cashAndCashEquivalents: 500,
      },
    ],
    cashFlowTtm: {
      freeCashFlow: 120,
    },
  };

  const stock = composeStockData("TEST", payload, "Good", cacheRow);

  assertEquals(stock.debtToEquity, 3);
  assertEquals(stock.netDebtToEbitda, 4);
  assertEquals(stock.redFlags, ["Debt/Equity > 2 and Net Debt/EBITDA > 3"]);
  assertEquals(stock.scorePenalty, 10);
});

Deno.test("composeStockData calculates performance windows from historical closes", () => {
  const payload: CachedStockPayload = {
    quote: {
      price: 100,
    },
    historical: [
      { date: "2020-06-01", close: 50 },
      { date: "2022-06-01", close: 60 },
      { date: "2024-06-01", close: 80 },
      { date: "2025-05-25", close: 90 },
      { date: "2025-06-01", close: 100 },
    ],
  };

  const stock = composeStockData("TEST", payload, "Unknown", cacheRow);

  assertEquals(stock.performance1W, 11.11);
  assertEquals(stock.performance1Y, 25);
  assertEquals(stock.performance3Y, 66.67);
  assertEquals(stock.performance5Y, 100);
  assertEquals(stock.oneYearChart, [
    { date: "2024-06-01", close: 80 },
    { date: "2025-05-25", close: 90 },
    { date: "2025-06-01", close: 100 },
  ]);
  assertEquals(stock.historicalChart, [
    { date: "2020-06-01", close: 50 },
    { date: "2022-06-01", close: 60 },
    { date: "2024-06-01", close: 80 },
    { date: "2025-05-25", close: 90 },
    { date: "2025-06-01", close: 100 },
  ]);
});

Deno.test("composeStockData accepts chart-module lowercase adjusted closes", () => {
  const payload: CachedStockPayload = {
    quote: {
      price: 100,
    },
    historical: [
      { date: "2024-06-01", adjclose: 80 },
      { date: "2025-05-25", adjclose: 90 },
      { date: "2025-06-01", adjclose: 100 },
    ],
  };

  const stock = composeStockData("TEST", payload, "Unknown", cacheRow);

  assertEquals(stock.performance1W, 11.11);
  assertEquals(stock.performance1Y, 25);
  assertEquals(stock.oneYearChart, [
    { date: "2024-06-01", close: 80 },
    { date: "2025-05-25", close: 90 },
    { date: "2025-06-01", close: 100 },
  ]);
});

Deno.test("createRefreshPayload preserves cached historical data for partial full refreshes", () => {
  const cachedPayload: CachedStockPayload = {
    quote: { price: 100 },
    historical: [
      { date: "2025-05-25", close: 90 },
      { date: "2025-06-01", close: 100 },
    ],
  };

  const nextPayload = createRefreshPayload(cachedPayload);
  nextPayload.quote = { price: 110 };

  const stock = composeStockData("TEST", nextPayload, "Unknown", cacheRow);

  assertEquals(stock.currentPrice, 110);
  assertEquals(stock.oneYearChart, [
    { date: "2025-05-25", close: 90 },
    { date: "2025-06-01", close: 100 },
  ]);
});

Deno.test("calculateScore returns null when no score inputs are available", () => {
  assertEquals(calculateScore(emptyStockData()), null);
});

Deno.test("calculateScore adds moat points while unknown moat remains zero", () => {
  assertEquals(calculateScore({
    ...emptyStockData(),
    moat: "Good",
  }), 6);
});

Deno.test("calculateScore applies the 100-point fundamentals, risks, and catalysts system", () => {
  const score = calculateScore({
    ...emptyStockData(),
    roce: 22,
    operatingMargin: 28,
    fcfMargin: 21,
    grossMargin: 64,
    revenueGrowth: 12,
    epsGrowth: 16,
    pe: 20,
    forwardPe: 14,
    netDebtToEbitda: 1.7,
    debtToEquity: 0.4,
    customerIndependenceScore: 4,
    analystConsensus: "Buy",
    beta: 0.95,
    moat: "Excellent",
    smartMoneyScore: 12,
    backlogScore: 8,
    buybacksScore: 4,
  });

  assertEquals(score, 82);
});

Deno.test("calculateScore gives small moat credit when moat is unknown", () => {
  const score = calculateScore({
    ...emptyStockData(),
    roce: 45,
    operatingMargin: 40,
    grossMargin: 75,
    epsGrowth: 25,
    fcfMargin: 30,
    revenueGrowth: 20,
    netDebtToEbitda: 0.5,
    debtToEquity: 0.2,
    pe: 20,
    forwardPe: 10,
    customerIndependenceScore: 5,
    analystConsensus: "Strong Buy",
    beta: 0.7,
    moat: "Unknown",
    smartMoneyScore: 15,
    backlogScore: 10,
    buybacksScore: 5,
  });

  assertEquals(score, 89);
});

Deno.test("calculateScore ignores legacy red flag penalties because risk is scored directly", () => {
  assertEquals(calculateScore({
    ...emptyStockData(),
    roce: 45,
    operatingMargin: 40,
    grossMargin: 75,
    epsGrowth: 25,
    fcfMargin: 30,
    revenueGrowth: 20,
    netDebtToEbitda: 5,
    pe: 20,
    forwardPe: 10,
    analystConsensus: "Strong Buy",
    moat: "Excellent",
    scorePenalty: 10,
    redFlags: ["Net Debt/EBITDA > 4"],
  }), 55);
});

Deno.test("calculateScore ignores analyst consensus in the current scoring system", () => {
  assertEquals(calculateScore({
    ...emptyStockData(),
    analystConsensus: "Hold",
  }), null);
});

function emptyStockData(): StockData {
  return {
    ticker: "TEST",
    customerIndependenceScore: null,
    smartMoneyScore: null,
    backlogScore: null,
    buybacksScore: null,
    company: null,
    currentPrice: null,
    oneYearChart: [],
    historicalChart: [],
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
    netDebtToEbitda: null,
    revenueGrowth: null,
    epsGrowth: null,
    debtToEquity: null,
    beta: null,
    sector: null,
    industry: null,
    moat: "Unknown",
    redFlags: [],
    scorePenalty: 0,
    score: null,
    lastUpdated: null,
  };
}

function assertEquals<T>(actual: T, expected: T): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}
