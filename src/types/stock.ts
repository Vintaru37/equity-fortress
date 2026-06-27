export type Moat =
  | "Excellent"
  | "Very Good"
  | "Good"
  | "Average"
  | "Bad"
  | "Very Bad"
  | "Unknown";

export interface ManualScores {
  customerDependenceScore: number | null;
  smartMoneyScore: number | null;
  backlogScore: number | null;
  buybacksScore: number | null;
}

export const MANUAL_SCORE_LIMITS = {
  customerDependenceScore: 5,
  smartMoneyScore: 15,
  backlogScore: 10,
  buybacksScore: 5,
} as const;

export type ManualScoreKey = keyof typeof MANUAL_SCORE_LIMITS;

export interface ChartPoint {
  date: string;
  close: number;
  volume?: number;
}

export interface StockData extends ManualScores {
  ticker: string;
  company: string | null;
  currentPrice: number | null;
  oneYearChart: ChartPoint[];
  historicalChart: ChartPoint[];
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
  historicalChart: ChartPoint[];
}

export interface StockRowData extends StockData {
  watchlistId: string | null;
  notes: string;
  isRefreshing: boolean;
  rowError: string | null;
  sectorScoreDelta: number | null;
  sectorPeerCount: number;
}

export interface Portfolio {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedStocksState {
  tickers: string[];
  notes: Record<string, string>;
  moats: Record<string, Moat>;
  manualScores: Record<string, Partial<ManualScores>>;
}

export const MOAT_OPTIONS: Moat[] = [
  "Excellent",
  "Very Good",
  "Good",
  "Average",
  "Bad",
  "Very Bad",
  "Unknown",
];
