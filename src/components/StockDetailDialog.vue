<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LoaderCircle, RefreshCw, X } from "@lucide/vue";

import MetricBadge from "@/components/MetricBadge.vue";
import StockDetailChart from "@/components/StockDetailChart.vue";
import { useStocksStore } from "@/stores/useStocksStore";
import type { ChartPoint, StockRowData } from "@/types/stock";
import {
  analystTone,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/utils/formatters";

type ChartRange = "1D" | "7D" | "1M" | "6M" | "1Y" | "5Y" | "MAX";

const props = defineProps<{
  stock: StockRowData;
}>();

const emit = defineEmits<{
  close: [];
}>();

const store = useStocksStore();
const rangeOptions: ChartRange[] = ["1D", "7D", "1M", "6M", "1Y", "5Y", "MAX"];
const selectedRange = ref<ChartRange>("1Y");
const showSma50 = ref(false);
const showSma150 = ref(false);
const loadingHistory = ref(false);
const historyError = ref<string | null>(null);
const loadedHistoryTicker = ref<string | null>(null);
const refreshingStock = ref(false);

const chartPoints = computed(() => {
  const historical = props.stock.historicalChart ?? [];
  return historical.length > 0 ? historical : props.stock.oneYearChart;
});

const averageVolume30 = computed(() => {
  const volumes = sortedChartPoints(chartPoints.value)
    .slice(-30)
    .map((point) => point.volume)
    .filter((volume): volume is number =>
      typeof volume === "number" && Number.isFinite(volume) && volume > 0
    );

  if (volumes.length === 0) {
    return null;
  }

  return volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length;
});
const rangeReturn = computed(() =>
  calculateRangeReturn(chartPoints.value, selectedRange.value)
);
const availableDays = computed(() => {
  const points = sortedChartPoints(chartPoints.value);
  const first = points[0];
  const latest = points.at(-1);
  const firstDate = first ? dateFromIso(first.date) : null;
  const latestDate = latest ? dateFromIso(latest.date) : null;

  if (!firstDate || !latestDate) {
    return 0;
  }

  return Math.max(0, Math.round((latestDate.getTime() - firstDate.getTime()) / 86_400_000));
});
const historyStatusLabel = computed(() => {
  if (loadingHistory.value) {
    return "History";
  }

  return historyError.value && availableDays.value < 4 * 365
    ? "Limited history"
    : null;
});
const updatedAt = computed(() => formatDateTime(props.stock.lastUpdated));

function close(): void {
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    close();
  }
}

async function loadDeepHistory(ticker: string): Promise<void> {
  if (loadedHistoryTicker.value === ticker || loadingHistory.value) {
    return;
  }

  loadingHistory.value = true;
  historyError.value = null;

  try {
    await store.loadStockHistory(ticker);
    loadedHistoryTicker.value = ticker;
  } catch (error) {
    historyError.value = error instanceof Error
      ? error.message
      : "History unavailable";
  } finally {
    loadingHistory.value = false;
  }
}

async function refreshCurrentStock(): Promise<void> {
  if (refreshingStock.value || props.stock.isRefreshing) {
    return;
  }

  refreshingStock.value = true;
  try {
    await store.refreshStock(props.stock.ticker, "full");
    loadedHistoryTicker.value = null;
    void loadDeepHistory(props.stock.ticker);
  } finally {
    refreshingStock.value = false;
  }
}

function sortedChartPoints(points: ChartPoint[]): ChartPoint[] {
  return [...points]
    .filter((point) => Number.isFinite(point.close) && dateFromIso(point.date) !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function calculateRangeReturn(points: ChartPoint[], range: ChartRange): number | null {
  const sorted = sortedChartPoints(points);
  const end = sorted.at(-1);
  if (!end) {
    return null;
  }

  const start = range === "MAX"
    ? sorted[0]
    : findAtOrBefore(
      sorted,
      toIsoDate(addDays(dateFromIso(end.date) ?? new Date(), -rangeDays(range))),
    ) ?? sorted[0];

  if (!start || start.close === 0) {
    return null;
  }

  return ((end.close - start.close) / start.close) * 100;
}

function findAtOrBefore(points: ChartPoint[], targetIso: string): ChartPoint | null {
  for (let index = points.length - 1; index >= 0; index--) {
    if (points[index].date <= targetIso) {
      return points[index];
    }
  }

  return null;
}

function isRangeAvailable(range: ChartRange): boolean {
  if (chartPoints.value.length === 0) {
    return false;
  }

  if (range === "MAX") {
    return loadedHistoryTicker.value === props.stock.ticker;
  }

  if (range === "5Y") {
    return availableDays.value >= 4 * 365;
  }

  return availableDays.value >= Math.min(rangeDays(range), 365) * 0.8 ||
    range === "1D";
}

function selectRange(range: ChartRange): void {
  if (isRangeAvailable(range)) {
    selectedRange.value = range;
  }
}

function rangeDays(range: ChartRange): number {
  switch (range) {
    case "1D":
      return 1;
    case "7D":
      return 7;
    case "1M":
      return 31;
    case "6M":
      return 183;
    case "1Y":
      return 365;
    case "5Y":
      return 5 * 365;
    case "MAX":
      return Number.MAX_SAFE_INTEGER;
  }
}

function formatVolume(value: number | null): string {
  if (value === null) {
    return "N/A";
  }

  if (value >= 1_000_000_000) {
    return `${round(value / 1_000_000_000, 1)}b`;
  }
  if (value >= 1_000_000) {
    return `${round(value / 1_000_000, 1)}m`;
  }
  if (value >= 1_000) {
    return `${round(value / 1_000, 1)}k`;
  }

  return `${Math.round(value)}`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

watch(
  () => props.stock.ticker,
  (ticker) => {
    selectedRange.value = "1Y";
    historyError.value = null;
    loadedHistoryTicker.value = null;
    void loadDeepHistory(ticker);
  },
  { immediate: true },
);

watch(
  [chartPoints, availableDays],
  () => {
    if (isRangeAvailable(selectedRange.value)) {
      return;
    }

    selectedRange.value = [...rangeOptions]
      .reverse()
      .find((range) => isRangeAvailable(range)) ?? "1D";
  },
);

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[220] flex items-center justify-center bg-zinc-950/55 p-4"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`stock-detail-${stock.ticker}`"
      @click.self="close"
    >
      <div
        class="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-dashboard dark:border-zinc-800 dark:bg-zinc-950"
      >
        <header
          class="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800"
        >
          <div class="min-w-0">
            <h2
              :id="`stock-detail-${stock.ticker}`"
              class="truncate text-xl font-bold text-zinc-950 dark:text-white"
            >
              {{ stock.ticker }}
              <span class="font-semibold text-zinc-500 dark:text-zinc-400">
                {{ stock.company ?? "N/A" }}
              </span>
            </h2>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              <span>{{ stock.sector ?? "Sector N/A" }}</span>
              <span class="text-zinc-300 dark:text-zinc-700">/</span>
              <span>{{ stock.industry ?? "Industry N/A" }}</span>
            </div>
          </div>

          <button
            type="button"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
            aria-label="Close stock detail"
            @click="close"
          >
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div class="overflow-y-auto px-5 py-4">
          <div
            class="mb-4 grid grid-cols-6 divide-x divide-zinc-200 overflow-hidden border-y border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800"
          >
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Price
              </div>
              <div class="mt-1 text-base font-bold text-zinc-950 dark:text-white">
                {{ formatNumber(stock.currentPrice, 2) }}
              </div>
            </div>
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Range
              </div>
              <div class="mt-1">
                <MetricBadge :value="rangeReturn" kind="performance" percent />
              </div>
            </div>
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Score
              </div>
              <div class="mt-1">
                <MetricBadge :value="stock.score" kind="score" :decimals="0" />
              </div>
            </div>
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Analyst
              </div>
              <div
                class="mt-1 truncate text-sm font-bold"
                :class="analystTone(stock.analystConsensus)"
              >
                {{ stock.analystConsensus ?? "N/A" }}
              </div>
            </div>
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Avg Vol 30D
              </div>
              <div class="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {{ formatVolume(averageVolume30) }}
              </div>
            </div>
            <div class="px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                  Updated
                </div>
                <button
                  type="button"
                  class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-cyan-700 dark:hover:bg-cyan-950 dark:hover:text-cyan-200"
                  :disabled="refreshingStock || stock.isRefreshing"
                  :aria-label="`Refresh ${stock.ticker}`"
                  @click="refreshCurrentStock"
                >
                  <RefreshCw
                    class="h-3.5 w-3.5"
                    :class="refreshingStock || stock.isRefreshing ? 'animate-spin' : ''"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <div class="mt-1 truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {{ updatedAt }}
              </div>
            </div>
          </div>

          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div
              class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <button
                v-for="range in rangeOptions"
                :key="range"
                type="button"
                class="h-8 min-w-12 rounded px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-35"
                :class="selectedRange === range
                  ? 'bg-white text-cyan-700 shadow-sm dark:bg-zinc-950 dark:text-cyan-200'
                  : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-950/70 dark:hover:text-zinc-100'"
                :disabled="!isRangeAvailable(range)"
                @click="selectRange(range)"
              >
                {{ range }}
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="historyStatusLabel"
                class="inline-flex h-9 items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 text-xs font-bold text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-200"
                :class="historyError
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
                  : ''"
              >
                <LoaderCircle
                  v-if="loadingHistory"
                  class="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
                {{ historyStatusLabel }}
              </span>
              <label
                class="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                <input
                  v-model="showSma50"
                  class="h-4 w-4 rounded border-zinc-300 accent-cyan-600 dark:border-zinc-700"
                  type="checkbox"
                />
                SMA 50
              </label>
              <label
                class="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                <input
                  v-model="showSma150"
                  class="h-4 w-4 rounded border-zinc-300 accent-amber-500 dark:border-zinc-700"
                  type="checkbox"
                />
                SMA 150
              </label>
            </div>
          </div>

          <div class="h-[520px] min-h-[420px] w-full">
            <StockDetailChart
              :points="chartPoints"
              :range="selectedRange"
              :show-sma50="showSma50"
              :show-sma150="showSma150"
            />
          </div>

          <div class="mt-4 grid grid-cols-4 divide-x divide-zinc-200 border-y border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                P/E
              </div>
              <div class="mt-1 font-bold text-zinc-900 dark:text-zinc-100">
                {{ formatNumber(stock.pe, 2) }}
              </div>
            </div>
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                1Y Perf
              </div>
              <div class="mt-1 font-bold text-zinc-900 dark:text-zinc-100">
                {{ formatPercent(stock.performance1Y, 1) }}
              </div>
            </div>
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                5Y Perf
              </div>
              <div class="mt-1 font-bold text-zinc-900 dark:text-zinc-100">
                {{ formatPercent(stock.performance5Y, 1) }}
              </div>
            </div>
            <div class="px-3 py-2">
              <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Moat
              </div>
              <div class="mt-1 font-bold text-zinc-900 dark:text-zinc-100">
                {{ stock.moat }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
