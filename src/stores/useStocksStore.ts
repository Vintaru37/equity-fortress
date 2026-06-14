import { computed, ref } from "vue";
import { defineStore } from "pinia";

import {
  latestTimestamp,
  normalizeTickerInput,
} from "@/utils/formatters";
import { calculateScore } from "@/utils/score";
import { MOAT_OPTIONS } from "@/types/stock";
import type {
  Moat,
  PersistedStocksState,
  StockData,
  StockRowData,
} from "@/types/stock";

const STARTING_TICKERS = [
  "MSFT",
  "META",
  "GOOGL",
  "AMZN",
  "AVGO",
  "CEG",
  "RKLB",
  "ASTS",
  "NVDA",
  "MU",
];

const STORAGE_KEY = "equity-fortress:stocks";

type RefreshScope = "quote" | "full";
type RefreshRequest = RefreshScope | "auto";

interface EdgeErrorResponse {
  error?: string;
}

function normalizeMoat(value: unknown): Moat {
  if (typeof value !== "string") {
    return "Unknown";
  }

  if ((MOAT_OPTIONS as string[]).includes(value)) {
    return value as Moat;
  }

  if (value === "Very Wide") return "Excellent";
  if (value === "Wide") return "Good";
  if (value === "Narrow") return "Average";
  if (value === "None") return "Bad";
  return "Unknown";
}

function edgeFunctionUrl(name: string): string {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL");
  }

  return `${baseUrl.replace(/\/+$/, "")}/functions/v1/${name}`;
}

function edgeHeaders(): HeadersInit {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY");
  }

  return {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
}

async function callEdgeFunction<TResponse>(
  name: string,
  payload: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetch(edgeFunctionUrl(name), {
    method: "POST",
    headers: edgeHeaders(),
    body: JSON.stringify(payload),
  });

  const body = await response.json() as TResponse & EdgeErrorResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Edge Function ${name} failed`);
  }

  return body;
}

function readPersistedState(): PersistedStocksState {
  const fallback: PersistedStocksState = {
    tickers: STARTING_TICKERS,
    notes: {},
    moats: {},
  };

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedStocksState>;
    const tickers = Array.isArray(parsed.tickers)
      ? parsed.tickers
        .map((ticker) => normalizeTickerInput(String(ticker)))
        .filter((ticker): ticker is string => Boolean(ticker))
      : STARTING_TICKERS;

    const rawMoats = parsed.moats && typeof parsed.moats === "object"
      ? parsed.moats
      : {};
    const moats = Object.fromEntries(
      Object.entries(rawMoats).map(([ticker, moat]) => [
        ticker,
        normalizeMoat(moat),
      ]),
    );

    return {
      tickers: tickers.length > 0 ? Array.from(new Set(tickers)) : STARTING_TICKERS,
      notes: parsed.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      moats,
    };
  } catch (_error) {
    return fallback;
  }
}

function emptyStock(ticker: string, moat: Moat = "Unknown"): StockData {
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
    netDebtToEbitda: null,
    revenueGrowth: null,
    epsGrowth: null,
    debtToEquity: null,
    beta: null,
    sector: null,
    industry: null,
    moat,
    redFlags: [],
    scorePenalty: 0,
    score: null,
    lastUpdated: null,
  };
}

export const useStocksStore = defineStore("stocks", () => {
  const persisted = readPersistedState();

  const stocks = ref<StockRowData[]>(
    persisted.tickers.map((ticker) => ({
      ...emptyStock(ticker, persisted.moats[ticker] ?? "Unknown"),
      notes: persisted.notes[ticker] ?? "",
      isRefreshing: false,
      rowError: null,
      sectorScoreDelta: null,
      sectorPeerCount: 0,
    })),
  );
  const filter = ref("");
  const loading = ref(false);
  const refreshing = ref(false);
  const initialized = ref(false);
  const error = ref<string | null>(null);
  const lastUpdated = ref<string | null>(
    latestTimestamp(stocks.value.map((stock) => stock.lastUpdated)),
  );

  const filteredStocks = computed(() => {
    const query = filter.value.trim().toLowerCase();
    if (!query) {
      return stocks.value;
    }

    return stocks.value.filter((stock) =>
      stock.ticker.toLowerCase().includes(query) ||
      (stock.company ?? "").toLowerCase().includes(query)
    );
  });

  const averageScore = computed(() => {
    const scores = stocks.value
      .map((stock) => stock.score)
      .filter((score): score is number => score !== null);

    if (scores.length === 0) {
      return null;
    }

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  });

  const positiveOneYearCount = computed(() =>
    stocks.value.filter((stock) => (stock.performance1Y ?? 0) > 0).length
  );

  function persistState(): void {
    const payload: PersistedStocksState = {
      tickers: stocks.value.map((stock) => stock.ticker),
      notes: Object.fromEntries(
        stocks.value.map((stock) => [stock.ticker, stock.notes]),
      ),
      moats: Object.fromEntries(
        stocks.value.map((stock) => [stock.ticker, stock.moat]),
      ),
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function mergeStock(stock: StockData, rowError: string | null = null): void {
    const index = stocks.value.findIndex((item) => item.ticker === stock.ticker);
    const existing = index >= 0 ? stocks.value[index] : null;
    const moat = persisted.moats[stock.ticker] ?? existing?.moat ?? stock.moat;
    const scoreInput: StockData = {
      ...stock,
      moat,
      redFlags: stock.redFlags ?? [],
      scorePenalty: stock.scorePenalty ?? 0,
    };
    const next: StockRowData = {
      ...scoreInput,
      moat,
      score: calculateScore(scoreInput),
      notes: existing?.notes ?? persisted.notes[stock.ticker] ?? "",
      isRefreshing: false,
      rowError,
      sectorScoreDelta: existing?.sectorScoreDelta ?? null,
      sectorPeerCount: existing?.sectorPeerCount ?? 0,
    };

    if (index >= 0) {
      stocks.value = stocks.value.map((item, itemIndex) =>
        itemIndex === index ? next : item
      );
    } else {
      stocks.value = [...stocks.value, next];
    }
    recomputeSectorComparisons();
  }

  function updateLastUpdated(): void {
    lastUpdated.value = latestTimestamp(stocks.value.map((stock) => stock.lastUpdated));
  }

  function recomputeSectorComparisons(): void {
    const groups = new Map<string, StockRowData[]>();

    for (const stock of stocks.value) {
      const sector = stock.sector?.trim();
      if (!sector || stock.score === null) {
        continue;
      }

      const sectorKey = sector.toLowerCase();
      groups.set(sectorKey, [...(groups.get(sectorKey) ?? []), stock]);
    }

    const sectorStats = new Map<string, { average: number; count: number }>();
    for (const [sectorKey, group] of groups) {
      if (group.length < 2) {
        continue;
      }

      const average = group.reduce((sum, stock) => sum + (stock.score ?? 0), 0) /
        group.length;
      sectorStats.set(sectorKey, { average, count: group.length });
    }

    stocks.value = stocks.value.map((stock) => {
      const sectorKey = stock.sector?.trim().toLowerCase();
      const stats = sectorKey ? sectorStats.get(sectorKey) : undefined;
      if (!stats || stock.score === null) {
        return { ...stock, sectorScoreDelta: null, sectorPeerCount: 0 };
      }

      return {
        ...stock,
        sectorScoreDelta: Math.round((stock.score - stats.average) * 10) / 10,
        sectorPeerCount: stats.count,
      };
    });
  }

  async function loadInitialStocks(): Promise<void> {
    if (initialized.value) {
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const tickers = stocks.value.map((stock) => stock.ticker);
      const data = await callEdgeFunction<StockData[]>("get-stocks-batch", {
        tickers,
        refreshScope: "full",
      });

      data.forEach((stock) => mergeStock(stock));
      initialized.value = true;
      updateLastUpdated();
      persistState();
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to load stocks";
    } finally {
      loading.value = false;
    }
  }

  async function refreshStock(
    ticker: string,
    refreshScope: RefreshRequest = "auto",
  ): Promise<void> {
    const normalizedTicker = normalizeTickerInput(ticker);
    if (!normalizedTicker) {
      error.value = "Invalid ticker";
      return;
    }

    const index = stocks.value.findIndex((stock) => stock.ticker === normalizedTicker);
    const resolvedRefreshScope: RefreshScope = refreshScope === "auto"
      ? "full"
      : refreshScope;

    if (index >= 0) {
      stocks.value = stocks.value.map((stock, itemIndex) =>
        itemIndex === index
          ? { ...stock, isRefreshing: true, rowError: null }
          : stock
      );
    }

    try {
      const stock = await callEdgeFunction<StockData>("get-stock", {
        ticker: normalizedTicker,
        forceRefresh: resolvedRefreshScope === "full",
        refreshScope: resolvedRefreshScope,
      });
      mergeStock(stock);
      updateLastUpdated();
      persistState();
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "Failed to refresh stock";
      const fallbackIndex = stocks.value.findIndex(
        (stock) => stock.ticker === normalizedTicker,
      );

      if (fallbackIndex >= 0) {
        stocks.value = stocks.value.map((stock, itemIndex) =>
          itemIndex === fallbackIndex
            ? { ...stock, isRefreshing: false, rowError: message }
            : stock
        );
      } else {
        mergeStock(emptyStock(normalizedTicker), message);
      }
    }
  }

  async function refreshAll(): Promise<void> {
    refreshing.value = true;
    error.value = null;
    stocks.value = stocks.value.map((stock) => ({
      ...stock,
      isRefreshing: true,
      rowError: null,
    }));

    try {
      const data = await callEdgeFunction<StockData[]>("get-stocks-batch", {
        tickers: stocks.value.map((stock) => stock.ticker),
        refreshScope: "full",
      });

      data.forEach((stock) => mergeStock(stock));
      persistState();
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to refresh stocks";
      stocks.value = stocks.value.map((stock) => ({
        ...stock,
        isRefreshing: false,
      }));
    }

    refreshing.value = false;
    updateLastUpdated();
  }

  async function addTicker(value: string): Promise<void> {
    const ticker = normalizeTickerInput(value);
    if (!ticker) {
      error.value = "Invalid ticker";
      return;
    }

    if (stocks.value.some((stock) => stock.ticker === ticker)) {
      error.value = `${ticker} is already on the dashboard`;
      return;
    }

    error.value = null;
    mergeStock(emptyStock(ticker));
    persistState();
    await refreshStock(ticker, "full");
  }

  function removeTicker(ticker: string): void {
    stocks.value = stocks.value.filter((stock) => stock.ticker !== ticker);
    recomputeSectorComparisons();
    persistState();
    updateLastUpdated();
  }

  function updateMoat(ticker: string, moat: Moat): void {
    const stock = stocks.value.find((item) => item.ticker === ticker);
    if (!stock) {
      return;
    }

    stocks.value = stocks.value.map((item) => {
      if (item.ticker !== ticker) {
        return item;
      }

      const next = { ...item, moat };
      return { ...next, score: calculateScore(next) };
    });
    recomputeSectorComparisons();
    persisted.moats[ticker] = moat;
    persistState();
  }

  function updateNotes(ticker: string, notes: string): void {
    const stock = stocks.value.find((item) => item.ticker === ticker);
    if (!stock) {
      return;
    }

    stocks.value = stocks.value.map((item) =>
      item.ticker === ticker ? { ...item, notes } : item
    );
    persisted.notes[ticker] = notes;
    persistState();
  }

  return {
    stocks,
    filteredStocks,
    filter,
    loading,
    refreshing,
    initialized,
    error,
    lastUpdated,
    averageScore,
    positiveOneYearCount,
    loadInitialStocks,
    refreshStock,
    refreshAll,
    addTicker,
    removeTicker,
    updateMoat,
    updateNotes,
  };
});
