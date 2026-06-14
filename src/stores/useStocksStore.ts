import { computed, ref } from "vue";
import { defineStore } from "pinia";

import { useAuthStore } from "@/stores/useAuthStore";
import {
  getSupabaseConfig,
  supabaseRequest,
  supabaseRestUrl,
} from "@/utils/supabaseApi";
import {
  latestTimestamp,
  normalizeTickerInput,
} from "@/utils/formatters";
import { calculateScore } from "@/utils/score";
import { MOAT_OPTIONS } from "@/types/stock";
import type {
  Moat,
  PersistedStocksState,
  Portfolio,
  StockData,
  StockRowData,
} from "@/types/stock";

const DEFAULT_PORTFOLIO_TICKERS = [
  "MSFT",
  "AAPL",
  "NVDA",
  "GOOGL",
  "AMZN",
  "META",
  "AVGO",
  "TSM",
  "ASML",
  "COST",
  "V",
  "MA",
  "LLY",
  "NVO",
  "UNH",
  "JPM",
  "BRK-B",
  "HD",
  "ORCL",
  "ADBE",
  "NFLX",
  "CRM",
  "AMD",
  "QCOM",
  "TXN",
  "AMAT",
  "INTU",
  "ISRG",
  "LIN",
  "ACN",
  "MCD",
  "PEP",
  "KO",
  "PG",
  "WMT",
  "NKE",
  "SBUX",
  "CAT",
  "DE",
  "GE",
  "AXP",
  "SPGI",
  "MS",
  "GS",
  "BLK",
  "SCHW",
  "COP",
  "XOM",
  "VRTX",
  "REGN",
];

const LOCAL_PORTFOLIO_ID = "local-default";
const DEFAULT_PORTFOLIO_NAME = "Default";
const STORAGE_KEY = "equity-fortress:stocks";
const ACTIVE_PORTFOLIO_KEY_PREFIX = "equity-fortress:active-portfolio";
const EDGE_BATCH_LIMIT = 50;

type RefreshScope = "quote" | "full";
type RefreshRequest = RefreshScope | "auto";

interface EdgeErrorResponse {
  error?: string;
}

interface PortfolioRow {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface WatchlistStockRow {
  id: string;
  user_id: string;
  portfolio_id: string | null;
  ticker: string;
  company: string | null;
  moat: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PortfolioCache {
  stocks: StockRowData[];
  initialized: boolean;
  lastUpdated: string | null;
}

interface StockResearchUpdate {
  ticker: string;
  moat?: Moat;
  notes?: string;
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
  const config = getSupabaseConfig();
  return `${config.url}/functions/v1/${name}`;
}

function edgeHeaders(accessToken: string | null): HeadersInit {
  const config = getSupabaseConfig();

  return {
    "Content-Type": "application/json",
    apikey: config.anonKey,
    Authorization: `Bearer ${accessToken ?? config.anonKey}`,
  };
}

function readPersistedState(): PersistedStocksState {
  const fallback: PersistedStocksState = {
    tickers: DEFAULT_PORTFOLIO_TICKERS,
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
      : DEFAULT_PORTFOLIO_TICKERS;

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
      tickers: tickers.length > 0
        ? Array.from(new Set(tickers))
        : DEFAULT_PORTFOLIO_TICKERS,
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

function localPortfolio(): Portfolio {
  const now = new Date().toISOString();

  return {
    id: LOCAL_PORTFOLIO_ID,
    name: DEFAULT_PORTFOLIO_NAME,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}

function mapPortfolio(row: PortfolioRow): Portfolio {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stockFromWatchlistRow(row: WatchlistStockRow): StockRowData {
  const ticker = normalizeTickerInput(row.ticker) ?? row.ticker.trim().toUpperCase();

  return {
    ...emptyStock(ticker, normalizeMoat(row.moat)),
    watchlistId: row.id,
    company: row.company,
    notes: row.notes ?? "",
    isRefreshing: false,
    rowError: null,
    sectorScoreDelta: null,
    sectorPeerCount: 0,
  };
}

function stockFromPersistedState(
  ticker: string,
  persisted: PersistedStocksState,
): StockRowData {
  return {
    ...emptyStock(ticker, persisted.moats[ticker] ?? "Unknown"),
    watchlistId: null,
    notes: persisted.notes[ticker] ?? "",
    isRefreshing: false,
    rowError: null,
    sectorScoreDelta: null,
    sectorPeerCount: 0,
  };
}

function chunk<TValue>(values: TValue[], size: number): TValue[][] {
  const chunks: TValue[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export const useStocksStore = defineStore("stocks", () => {
  const auth = useAuthStore();
  const persisted = readPersistedState();

  const stocks = ref<StockRowData[]>(
    persisted.tickers.map((ticker) => stockFromPersistedState(ticker, persisted)),
  );
  const portfolios = ref<Portfolio[]>([localPortfolio()]);
  const portfolioCache = ref<Record<string, PortfolioCache>>({});
  const cacheUserId = ref<string | null>(auth.userId);
  const activePortfolioId = ref<string | null>(LOCAL_PORTFOLIO_ID);
  const filter = ref("");
  const loading = ref(false);
  const refreshing = ref(false);
  const portfolioLoading = ref(false);
  const initialized = ref(false);
  const error = ref<string | null>(null);
  const lastUpdated = ref<string | null>(
    latestTimestamp(stocks.value.map((stock) => stock.lastUpdated)),
  );

  const activePortfolio = computed(() =>
    portfolios.value.find((portfolio) => portfolio.id === activePortfolioId.value) ??
      null
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

  function ensurePortfolioCacheUser(): void {
    if (cacheUserId.value === auth.userId) {
      return;
    }

    portfolioCache.value = {};
    cacheUserId.value = auth.userId;
  }

  function cachePortfolio(
    portfolioId: string,
    portfolioStocks: StockRowData[],
    portfolioInitialized: boolean,
  ): void {
    portfolioCache.value = {
      ...portfolioCache.value,
      [portfolioId]: {
        stocks: portfolioStocks,
        initialized: portfolioInitialized,
        lastUpdated: latestTimestamp(
          portfolioStocks.map((stock) => stock.lastUpdated),
        ),
      },
    };
  }

  function cacheActivePortfolio(): void {
    if (!activePortfolioId.value) {
      return;
    }

    cachePortfolio(activePortfolioId.value, stocks.value, initialized.value);
  }

  function restorePortfolioFromCache(portfolioId: string): boolean {
    const cached = portfolioCache.value[portfolioId];
    if (!cached) {
      return false;
    }

    stocks.value = cached.stocks;
    initialized.value = cached.initialized;
    lastUpdated.value = cached.lastUpdated;
    return true;
  }

  function removePortfolioFromCache(portfolioId: string): void {
    portfolioCache.value = Object.fromEntries(
      Object.entries(portfolioCache.value).filter(([cachedPortfolioId]) =>
        cachedPortfolioId !== portfolioId
      ),
    );
  }

  function getPortfolioLastUpdated(portfolioId: string): string | null {
    if (portfolioId === activePortfolioId.value) {
      return lastUpdated.value;
    }

    return portfolioCache.value[portfolioId]?.lastUpdated ?? null;
  }

  function getPortfolioStockCount(portfolioId: string): number | null {
    if (portfolioId === activePortfolioId.value) {
      return stocks.value.length;
    }

    return portfolioCache.value[portfolioId]?.stocks.length ?? null;
  }

  function activePortfolioStorageKey(): string {
    return `${ACTIVE_PORTFOLIO_KEY_PREFIX}:${auth.userId ?? "local"}`;
  }

  function persistLocalState(): void {
    if (auth.isAuthenticated || activePortfolioId.value !== LOCAL_PORTFOLIO_ID) {
      return;
    }

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

  function requireUserId(): string {
    if (!auth.userId) {
      throw new Error("Sign in to use portfolios");
    }

    return auth.userId;
  }

  async function requireAccessToken(): Promise<string> {
    const accessToken = await auth.getValidAccessToken();
    if (!accessToken) {
      throw new Error("Sign in to use portfolios");
    }

    return accessToken;
  }

  async function callEdgeFunction<TResponse>(
    name: string,
    payload: Record<string, unknown>,
  ): Promise<TResponse> {
    const accessToken = await auth.getValidAccessToken();
    const response = await fetch(edgeFunctionUrl(name), {
      method: "POST",
      headers: edgeHeaders(accessToken),
      body: JSON.stringify(payload),
    });

    const body = await response.json() as TResponse & EdgeErrorResponse;
    if (!response.ok) {
      throw new Error(body.error ?? `Edge Function ${name} failed`);
    }

    return body;
  }

  async function loadStockBatch(
    tickers: string[],
    refreshScope: RefreshScope,
  ): Promise<StockData[]> {
    const batches = await Promise.all(
      chunk(tickers, EDGE_BATCH_LIMIT).map((tickerBatch) =>
        callEdgeFunction<StockData[]>("get-stocks-batch", {
          tickers: tickerBatch,
          refreshScope,
        })
      ),
    );

    return batches.flat();
  }

  function mergeStock(stock: StockData, rowError: string | null = null): void {
    const index = stocks.value.findIndex((item) => item.ticker === stock.ticker);
    const existing = index >= 0 ? stocks.value[index] : null;
    const moat = existing?.moat ?? stock.moat;
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
      watchlistId: existing?.watchlistId ?? null,
      notes: existing?.notes ?? "",
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
    cacheActivePortfolio();
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

  async function createPortfolioRow(
    name: string,
    isDefault: boolean,
    accessToken: string,
  ): Promise<PortfolioRow> {
    const userId = requireUserId();
    const rows = await supabaseRequest<PortfolioRow[]>(
      supabaseRestUrl("portfolios", { select: "*" }),
      {
        method: "POST",
        accessToken,
        prefer: "return=representation",
        body: {
          user_id: userId,
          name,
          is_default: isDefault,
        },
      },
    );
    const row = rows[0];

    if (!row) {
      throw new Error("Portfolio was not created");
    }

    return row;
  }

  async function seedDefaultPortfolio(
    portfolioId: string,
    accessToken: string,
  ): Promise<void> {
    const userId = requireUserId();
    await supabaseRequest<null>(
      supabaseRestUrl("watchlist_stocks"),
      {
        method: "POST",
        accessToken,
        prefer: "return=minimal",
        body: DEFAULT_PORTFOLIO_TICKERS.map((ticker) => ({
          user_id: userId,
          portfolio_id: portfolioId,
          ticker,
          moat: "Unknown",
          notes: "",
        })),
      },
    );
  }

  async function loadPortfolioStocks(
    portfolioId: string,
    force = false,
  ): Promise<void> {
    if (!force && restorePortfolioFromCache(portfolioId)) {
      if (!initialized.value) {
        await loadInitialStocks();
      }
      return;
    }

    initialized.value = false;
    error.value = null;

    const accessToken = await requireAccessToken();
    const rows = await supabaseRequest<WatchlistStockRow[]>(
      supabaseRestUrl("watchlist_stocks", {
        select: "*",
        portfolio_id: `eq.${portfolioId}`,
        order: "created_at.asc",
      }),
      { accessToken },
    );

    stocks.value = rows.map(stockFromWatchlistRow);
    recomputeSectorComparisons();
    updateLastUpdated();

    await loadInitialStocks();
  }

  function loadLocalPortfolio(): void {
    const localState = readPersistedState();

    portfolioCache.value = {};
    cacheUserId.value = null;
    portfolios.value = [localPortfolio()];
    activePortfolioId.value = LOCAL_PORTFOLIO_ID;
    stocks.value = localState.tickers.map((ticker) =>
      stockFromPersistedState(ticker, localState)
    );
    initialized.value = false;
    error.value = null;
    recomputeSectorComparisons();
    updateLastUpdated();
  }

  async function initializeDashboard(): Promise<void> {
    await auth.refreshSessionIfNeeded();

    if (auth.isAuthenticated) {
      await loadPortfolios();
      return;
    }

    loadLocalPortfolio();
    await loadInitialStocks();
  }

  async function loadPortfolios(): Promise<void> {
    ensurePortfolioCacheUser();
    portfolioLoading.value = true;
    error.value = null;

    try {
      const accessToken = await requireAccessToken();
      let rows = await supabaseRequest<PortfolioRow[]>(
        supabaseRestUrl("portfolios", {
          select: "*",
          order: "created_at.asc",
        }),
        { accessToken },
      );

      let seededDefaultPortfolioId: string | null = null;
      if (!rows.some((portfolio) => portfolio.is_default)) {
        const defaultPortfolio = await createPortfolioRow(
          DEFAULT_PORTFOLIO_NAME,
          true,
          accessToken,
        );
        await seedDefaultPortfolio(defaultPortfolio.id, accessToken);
        rows = [defaultPortfolio, ...rows];
        seededDefaultPortfolioId = defaultPortfolio.id;
      }

      portfolios.value = rows.map(mapPortfolio);

      const savedPortfolioId = window.localStorage.getItem(activePortfolioStorageKey());
      const defaultPortfolio = portfolios.value.find((portfolio) => portfolio.isDefault);
      const nextPortfolioId = portfolios.value.some(
        (portfolio) => portfolio.id === savedPortfolioId,
      )
        ? savedPortfolioId
        : seededDefaultPortfolioId ?? defaultPortfolio?.id ?? portfolios.value[0]?.id ?? null;

      if (nextPortfolioId) {
        await selectPortfolio(nextPortfolioId);
      } else {
        activePortfolioId.value = null;
        stocks.value = [];
        initialized.value = true;
        updateLastUpdated();
      }
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to load portfolios";
    } finally {
      portfolioLoading.value = false;
    }
  }

  async function selectPortfolio(portfolioId: string): Promise<void> {
    if (!auth.isAuthenticated) {
      return;
    }

    if (portfolioId === activePortfolioId.value) {
      if (!initialized.value) {
        await loadInitialStocks();
      }
      return;
    }

    cacheActivePortfolio();
    activePortfolioId.value = portfolioId;
    window.localStorage.setItem(activePortfolioStorageKey(), portfolioId);

    try {
      await loadPortfolioStocks(portfolioId);
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to load portfolio";
    }
  }

  async function createPortfolio(name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      error.value = "Portfolio name is required";
      return;
    }

    portfolioLoading.value = true;
    error.value = null;

    try {
      const accessToken = await requireAccessToken();
      const row = await createPortfolioRow(trimmedName, false, accessToken);
      const portfolio = mapPortfolio(row);
      portfolios.value = [...portfolios.value, portfolio];
      cacheActivePortfolio();
      activePortfolioId.value = portfolio.id;
      window.localStorage.setItem(activePortfolioStorageKey(), portfolio.id);
      stocks.value = [];
      initialized.value = true;
      updateLastUpdated();
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to create portfolio";
    } finally {
      portfolioLoading.value = false;
    }
  }

  async function renamePortfolio(
    portfolioId: string,
    name: string,
  ): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      error.value = "Portfolio name is required";
      return;
    }

    portfolioLoading.value = true;
    error.value = null;

    try {
      const accessToken = await requireAccessToken();
      const rows = await supabaseRequest<PortfolioRow[]>(
        supabaseRestUrl("portfolios", {
          id: `eq.${portfolioId}`,
          select: "*",
        }),
        {
          method: "PATCH",
          accessToken,
          prefer: "return=representation",
          body: {
            name: trimmedName,
          },
        },
      );
      const row = rows[0];
      if (!row) {
        throw new Error("Portfolio was not renamed");
      }

      const nextPortfolio = mapPortfolio(row);
      portfolios.value = portfolios.value.map((portfolio) =>
        portfolio.id === nextPortfolio.id ? nextPortfolio : portfolio
      );
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to rename portfolio";
    } finally {
      portfolioLoading.value = false;
    }
  }

  async function deletePortfolio(portfolioId: string): Promise<void> {
    const portfolio = portfolios.value.find((item) => item.id === portfolioId);
    if (!portfolio) {
      return;
    }

    if (portfolios.value.length <= 1) {
      error.value = "Keep at least one portfolio";
      return;
    }

    portfolioLoading.value = true;
    error.value = null;

    try {
      const accessToken = await requireAccessToken();
      await supabaseRequest<null>(
        supabaseRestUrl("portfolios", { id: `eq.${portfolioId}` }),
        {
          method: "DELETE",
          accessToken,
          prefer: "return=minimal",
        },
      );

      removePortfolioFromCache(portfolioId);
      let remainingPortfolios = portfolios.value.filter(
        (item) => item.id !== portfolioId,
      );

      if (portfolio.isDefault && remainingPortfolios.length > 0) {
        const promoted = remainingPortfolios[0];
        const rows = await supabaseRequest<PortfolioRow[]>(
          supabaseRestUrl("portfolios", {
            id: `eq.${promoted.id}`,
            select: "*",
          }),
          {
            method: "PATCH",
            accessToken,
            prefer: "return=representation",
            body: {
              is_default: true,
            },
          },
        );
        const promotedPortfolio = rows[0] ? mapPortfolio(rows[0]) : promoted;
        remainingPortfolios = remainingPortfolios.map((item) =>
          item.id === promotedPortfolio.id ? promotedPortfolio : item
        );
      }

      portfolios.value = remainingPortfolios;
      const nextPortfolioId = activePortfolioId.value === portfolioId
        ? remainingPortfolios.find((item) => item.isDefault)?.id ??
          remainingPortfolios[0]?.id ??
          null
        : activePortfolioId.value;

      if (nextPortfolioId) {
        if (activePortfolioId.value === portfolioId) {
          activePortfolioId.value = null;
          stocks.value = [];
          initialized.value = false;
          lastUpdated.value = null;
        }
        await selectPortfolio(nextPortfolioId);
      } else {
        activePortfolioId.value = null;
        stocks.value = [];
        initialized.value = true;
        updateLastUpdated();
      }
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to delete portfolio";
      await loadPortfolios();
    } finally {
      portfolioLoading.value = false;
    }
  }

  async function loadInitialStocks(): Promise<void> {
    if (initialized.value) {
      return;
    }

    if (stocks.value.length === 0) {
      initialized.value = true;
      updateLastUpdated();
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const tickers = stocks.value.map((stock) => stock.ticker);
      const data = await loadStockBatch(tickers, "full");

      data.forEach((stock) => mergeStock(stock));
      initialized.value = true;
      updateLastUpdated();
      persistLocalState();
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
      persistLocalState();
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
    if (stocks.value.length === 0) {
      return;
    }

    refreshing.value = true;
    error.value = null;
    stocks.value = stocks.value.map((stock) => ({
      ...stock,
      isRefreshing: true,
      rowError: null,
    }));

    try {
      const data = await loadStockBatch(
        stocks.value.map((stock) => stock.ticker),
        "full",
      );

      data.forEach((stock) => mergeStock(stock));
      persistLocalState();
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

    try {
      if (auth.isAuthenticated) {
        await addTickerToPortfolio(ticker);
      } else {
        mergeStock(emptyStock(ticker));
        persistLocalState();
      }

      await refreshStock(ticker, "full");
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to add ticker";
    }
  }

  async function addTickerToPortfolio(ticker: string): Promise<void> {
    const portfolioId = activePortfolioId.value;
    if (!portfolioId) {
      throw new Error("Select a portfolio first");
    }

    const accessToken = await requireAccessToken();
    const rows = await supabaseRequest<WatchlistStockRow[]>(
      supabaseRestUrl("watchlist_stocks", { select: "*" }),
      {
        method: "POST",
        accessToken,
        prefer: "return=representation",
        body: {
          user_id: requireUserId(),
          portfolio_id: portfolioId,
          ticker,
          moat: "Unknown",
          notes: "",
        },
      },
    );
    const row = rows[0];

    if (!row) {
      throw new Error("Ticker was not added");
    }

    stocks.value = [...stocks.value, stockFromWatchlistRow(row)];
    cacheActivePortfolio();
  }

  async function removeTicker(ticker: string): Promise<void> {
    const stock = stocks.value.find((item) => item.ticker === ticker);
    if (!stock) {
      return;
    }

    const previousStocks = stocks.value;
    stocks.value = stocks.value.filter((item) => item.ticker !== ticker);
    recomputeSectorComparisons();
    persistLocalState();
    updateLastUpdated();

    if (!auth.isAuthenticated || !stock.watchlistId) {
      return;
    }

    try {
      const accessToken = await requireAccessToken();
      await supabaseRequest<null>(
        supabaseRestUrl("watchlist_stocks", { id: `eq.${stock.watchlistId}` }),
        {
          method: "DELETE",
          accessToken,
          prefer: "return=minimal",
        },
      );
    } catch (requestError) {
      stocks.value = previousStocks;
      recomputeSectorComparisons();
      updateLastUpdated();
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to remove ticker";
    }
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
    persistLocalState();
    cacheActivePortfolio();
    void persistWatchlistPatch(ticker, { moat });
  }

  function updateNotes(ticker: string, notes: string): void {
    const stock = stocks.value.find((item) => item.ticker === ticker);
    if (!stock) {
      return;
    }

    stocks.value = stocks.value.map((item) =>
      item.ticker === ticker ? { ...item, notes } : item
    );
    persistLocalState();
    cacheActivePortfolio();
    void persistWatchlistPatch(ticker, { notes });
  }

  async function applyResearchUpdates(
    updates: StockResearchUpdate[],
  ): Promise<void> {
    const patchByTicker = new Map<string, StockResearchUpdate>();

    for (const update of updates) {
      const ticker = normalizeTickerInput(update.ticker);
      if (!ticker || !stocks.value.some((stock) => stock.ticker === ticker)) {
        continue;
      }

      patchByTicker.set(ticker, {
        ticker,
        moat: update.moat,
        notes: update.notes,
      });
    }

    if (patchByTicker.size === 0) {
      return;
    }

    stocks.value = stocks.value.map((stock) => {
      const patch = patchByTicker.get(stock.ticker);
      if (!patch) {
        return stock;
      }

      const next = {
        ...stock,
        moat: patch.moat ?? stock.moat,
        notes: patch.notes ?? stock.notes,
      };

      return { ...next, score: calculateScore(next) };
    });
    recomputeSectorComparisons();
    persistLocalState();
    cacheActivePortfolio();
    await persistWatchlistBulkPatch(Array.from(patchByTicker.values()));
  }

  async function persistWatchlistPatch(
    ticker: string,
    patch: { moat?: Moat; notes?: string },
  ): Promise<void> {
    if (!auth.isAuthenticated) {
      return;
    }

    const stock = stocks.value.find((item) => item.ticker === ticker);
    if (!stock?.watchlistId) {
      return;
    }

    try {
      const accessToken = await requireAccessToken();
      await supabaseRequest<null>(
        supabaseRestUrl("watchlist_stocks", { id: `eq.${stock.watchlistId}` }),
        {
          method: "PATCH",
          accessToken,
          prefer: "return=minimal",
          body: patch,
        },
      );
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to save portfolio changes";
    }
  }

  async function persistWatchlistBulkPatch(
    patches: StockResearchUpdate[],
  ): Promise<void> {
    if (!auth.isAuthenticated) {
      return;
    }

    const userId = requireUserId();
    const rows = patches
      .map((patch) => {
        const stock = stocks.value.find((item) => item.ticker === patch.ticker);
        if (!stock?.watchlistId) {
          return null;
        }

        return {
          id: stock.watchlistId,
          user_id: userId,
          portfolio_id: activePortfolioId.value === LOCAL_PORTFOLIO_ID
            ? null
            : activePortfolioId.value,
          ticker: stock.ticker,
          company: stock.company,
          moat: patch.moat ?? stock.moat,
          notes: patch.notes ?? stock.notes,
        };
      })
      .filter((row): row is {
        id: string;
        user_id: string;
        portfolio_id: string | null;
        ticker: string;
        company: string | null;
        moat: Moat;
        notes: string;
      } => row !== null);

    if (rows.length === 0) {
      return;
    }

    try {
      const accessToken = await requireAccessToken();
      await supabaseRequest<null>(
        supabaseRestUrl("watchlist_stocks", { on_conflict: "id" }),
        {
          method: "POST",
          accessToken,
          prefer: "resolution=merge-duplicates,return=minimal",
          body: rows,
        },
      );
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Failed to save moat research";
    }
  }

  return {
    stocks,
    portfolios,
    activePortfolioId,
    activePortfolio,
    filteredStocks,
    filter,
    loading,
    refreshing,
    portfolioLoading,
    initialized,
    error,
    lastUpdated,
    averageScore,
    positiveOneYearCount,
    getPortfolioLastUpdated,
    getPortfolioStockCount,
    initializeDashboard,
    loadLocalPortfolio,
    loadPortfolios,
    selectPortfolio,
    createPortfolio,
    renamePortfolio,
    deletePortfolio,
    loadInitialStocks,
    refreshStock,
    refreshAll,
    addTicker,
    removeTicker,
    updateMoat,
    updateNotes,
    applyResearchUpdates,
  };
});
