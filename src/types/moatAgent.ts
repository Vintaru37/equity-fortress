import type { Moat } from "@/types/stock";

export interface MoatAgentStockInput {
  ticker: string;
  company: string | null;
  sector: string | null;
  industry: string | null;
  currentMoat: Moat;
  currentNotes: string;
}

export interface MoatAgentSource {
  type: "filing" | "web";
  title: string;
  url: string;
  date: string | null;
  dateLabel?: string | null;
  excerpt: string;
}

export interface MoatAgentResult {
  ticker: string;
  company: string | null;
  status: "ok" | "warning" | "error";
  moat: Moat;
  confidence: "High" | "Medium" | "Low";
  summary: string;
  keyPoints: string[];
  risks: string[];
  suggestedNote: string;
  researchedAt: string;
  sources: MoatAgentSource[];
  warnings: string[];
  modelUsed: string | null;
}

export interface MoatAgentRequest {
  tickers: MoatAgentStockInput[];
  recencyDays: number;
  concurrency?: number;
}

export interface MoatAgentResponse {
  researchedAt: string;
  results: MoatAgentResult[];
}

export interface MoatAgentHealth {
  ok: boolean;
  ollama?: {
    ok: boolean;
    url: string;
    model: string;
    modelAvailable?: boolean;
    error?: string;
  };
  search?: {
    braveConfigured: boolean;
  };
}
