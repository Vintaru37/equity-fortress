export type Moat = "Excellent" | "Good" | "Average" | "Bad" | "Unknown";

export interface ChartPoint {
  date: string;
  close: number;
}

export interface StockData {
  ticker: string;
  company: string | null;
  currentPrice: number | null;
  oneYearChart: ChartPoint[];
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
  revenueGrowth: number | null;
  epsGrowth: number | null;
  debtToEquity: number | null;
  beta: number | null;
  moat: Moat;
  score: number | null;
  lastUpdated: string | null;
}

export interface StockRowData extends StockData {
  notes: string;
  isRefreshing: boolean;
  rowError: string | null;
}

export interface PersistedStocksState {
  tickers: string[];
  notes: Record<string, string>;
  moats: Record<string, Moat>;
}

export const MOAT_OPTIONS: Moat[] = [
  "Excellent",
  "Good",
  "Average",
  "Bad",
  "Unknown",
];
