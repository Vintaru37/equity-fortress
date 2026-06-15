export type Moat =
  | "Excellent"
  | "Very Good"
  | "Good"
  | "Average"
  | "Bad"
  | "Very Bad"
  | "Unknown";

export interface StockData {
  ticker: string;
  company: string | null;
  currentPrice: number | null;
  oneYearChart: Array<{ date: string; close: number; volume?: number }>;
  historicalChart: Array<{ date: string; close: number; volume?: number }>;
  performance1W: number | null;
  performance1Y: number | null;
  performance3Y: number | null;
  performance5Y: number | null;
  analystConsensus: string | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  roce: number | null;
  fcfMargin: number | null;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  netDebtToEbitda: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  debtToEquity: number | null;
  beta: number | null;
  sector: string | null;
  industry: string | null;
  moat: Moat;
  redFlags: string[];
  scorePenalty: number;
  score: number | null;
  lastUpdated: string | null;
}

export interface StockHistoryData {
  ticker: string;
  historicalChart: Array<{ date: string; close: number; volume?: number }>;
}

export type JsonRecord = Record<string, unknown>;

export interface CachedStockPayload {
  _meta?: {
    provider?: string;
    refreshedAt?: string;
    schemaVersion?: number;
  };
  profile?: JsonRecord | null;
  quote?: JsonRecord | null;
  quotes?: JsonRecord[] | null;
  historical?: JsonRecord[] | null;
  incomeStatements?: JsonRecord[] | null;
  incomeStatementGrowth?: JsonRecord[] | null;
  incomeStatementTtm?: JsonRecord | null;
  balanceSheets?: JsonRecord[] | null;
  cashFlows?: JsonRecord[] | null;
  cashFlowTtm?: JsonRecord | null;
  ratiosTtm?: JsonRecord | null;
  keyMetricsTtm?: JsonRecord | null;
  estimates?: JsonRecord[] | null;
  gradesConsensus?: JsonRecord | null;
  endpointErrors?: string[];
}

export interface CacheRow {
  ticker: string;
  data_json: CachedStockPayload | null;
  quote_updated_at: string | null;
  fundamentals_updated_at: string | null;
  historical_updated_at: string | null;
  created_at: string;
  updated_at: string;
}
