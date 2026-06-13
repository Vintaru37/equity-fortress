import { computed, ref } from "vue";
import { defineStore } from "pinia";

import {
  latestTimestamp,
  normalizeTickerInput,
} from "@/utils/formatters";
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
    revenueGrowth: null,
    epsGrowth: null,
    debtToEquity: null,
    beta: null,
    moat,
    score: null,
    lastUpdated: null,
  };
}

function needsFullRefresh(stock: StockRowData | null): boolean {
  if (!stock) {
    return true;
  }

  const hasHistory = stock.oneYearChart.length > 1 ||
    stock.performance1Y !== null ||
    stock.performance3Y !== null ||
    stock.performance5Y !== null;
  const hasFundamentals = [
    stock.grossMargin,
    stock.operatingMargin,
    stock.roce,
    stock.fcfMargin,
    stock.pe,
    stock.forwardPe,
    stock.debtToEquity,
    stock.score,
  ].some((value) => value !== null);

  return stock.currentPrice === null || !hasHistory || !hasFundamentals;
}

export const useStocksStore = defineStore("stocks", () => {
  const persisted = readPersistedState();

  const stocks = ref<StockRowData[]>(
    persisted.tickers.map((ticker) => ({
      ...emptyStock(ticker, persisted.moats[ticker] ?? "Unknown"),
      notes: persisted.notes[ticker] ?? "",
      isRefreshing: false,
      rowError: null,
    })),
  );
  const filter = ref("");
  const loading = ref(false);
  const refreshingAll = ref(false);
  const fullSyncing = ref(false);
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
    const next: StockRowData = {
      ...stock,
      moat: persisted.moats[stock.ticker] ?? existing?.moat ?? stock.moat,
      notes: existing?.notes ?? persisted.notes[stock.ticker] ?? "",
      isRefreshing: false,
      rowError,
    };

    if (index >= 0) {
      stocks.value = stocks.value.map((item, itemIndex) =>
        itemIndex === index ? next : item
      );
    } else {
      stocks.value = [...stocks.value, next];
    }
  }

  function updateLastUpdated(): void {
    lastUpdated.value = latestTimestamp(stocks.value.map((stock) => stock.lastUpdated));
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
        refreshScope: null,
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
    const existingStock = index >= 0 ? stocks.value[index] : null;
    const resolvedRefreshScope: RefreshScope = refreshScope === "auto"
      ? needsFullRefresh(existingStock)
        ? "full"
        : "quote"
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
    refreshingAll.value = true;
    error.value = null;
    stocks.value = stocks.value.map((stock) => ({
      ...stock,
      isRefreshing: true,
      rowError: null,
    }));

    try {
      const data = await callEdgeFunction<StockData[]>("get-stocks-batch", {
        tickers: stocks.value.map((stock) => stock.ticker),
        refreshScope: "quote",
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

    refreshingAll.value = false;
    updateLastUpdated();
  }

  async function fullSyncAll(): Promise<void> {
    fullSyncing.value = true;
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
        : "Failed to sync stocks";
      stocks.value = stocks.value.map((stock) => ({
        ...stock,
        isRefreshing: false,
      }));
    }

    fullSyncing.value = false;
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
    persistState();
    updateLastUpdated();
  }

  function updateMoat(ticker: string, moat: Moat): void {
    const stock = stocks.value.find((item) => item.ticker === ticker);
    if (!stock) {
      return;
    }

    stocks.value = stocks.value.map((item) =>
      item.ticker === ticker ? { ...item, moat } : item
    );
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
    refreshingAll,
    fullSyncing,
    initialized,
    error,
    lastUpdated,
    averageScore,
    positiveOneYearCount,
    loadInitialStocks,
    refreshStock,
    refreshAll,
    fullSyncAll,
    addTicker,
    removeTicker,
    updateMoat,
    updateNotes,
  };
});
