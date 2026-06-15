<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import type { ChartPoint } from "@/types/stock";

use([
  LineChart,
  BarChart,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type ChartRange = "1D" | "7D" | "1M" | "6M" | "1Y" | "5Y" | "MAX";

interface EnrichedPoint extends ChartPoint {
  sma50: number | null;
  sma150: number | null;
}

interface TooltipParam {
  dataIndex?: number;
  marker?: string;
  seriesName?: string;
}

interface ChartMeasure {
  startIndex: number;
  endIndex: number;
  active: boolean;
}

const props = defineProps<{
  points: ChartPoint[];
  range: ChartRange;
  showSma50: boolean;
  showSma150: boolean;
}>();

const chartWrapEl = ref<HTMLDivElement | null>(null);
const chartEl = ref<HTMLDivElement | null>(null);
const isDark = ref(document.documentElement.classList.contains("dark"));
const measure = ref<ChartMeasure | null>(null);
let chart: EChartsType | null = null;
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let activePointerId: number | null = null;

const sortedPoints = computed(() =>
  [...props.points]
    .filter((point) => Number.isFinite(point.close) && dateFromIso(point.date) !== null)
    .sort((left, right) => left.date.localeCompare(right.date)),
);

const enrichedPoints = computed<EnrichedPoint[]>(() => {
  const sma50 = movingAverage(sortedPoints.value, 50);
  const sma150 = movingAverage(sortedPoints.value, 150);

  return sortedPoints.value.map((point, index) => ({
    ...point,
    sma50: sma50[index],
    sma150: sma150[index],
  }));
});

const visiblePoints = computed(() => {
  const points = enrichedPoints.value;
  const end = points.at(-1);
  if (!end || props.range === "MAX") {
    return points;
  }

  const endDate = dateFromIso(end.date);
  if (!endDate) {
    return points;
  }

  const targetIso = toIsoDate(addDays(endDate, -rangeDays(props.range)));
  const firstInsideIndex = points.findIndex((point) => point.date >= targetIso);
  if (firstInsideIndex < 0) {
    return points.slice(-1);
  }

  return points.slice(Math.max(0, firstInsideIndex - 1));
});

const hasData = computed(() => visiblePoints.value.length > 0);
const hasVolume = computed(() =>
  visiblePoints.value.some((point) =>
    typeof point.volume === "number" && Number.isFinite(point.volume) && point.volume > 0
  )
);

const priceColor = computed(() => {
  const points = visiblePoints.value;
  const first = points[0]?.close;
  const last = points.at(-1)?.close;
  return first !== undefined && last !== undefined && last >= first
    ? "#059669"
    : "#dc2626";
});
const measureSummary = computed(() => {
  const current = measure.value;
  if (!current) {
    return null;
  }

  const points = visiblePoints.value;
  const startIndex = Math.min(current.startIndex, current.endIndex);
  const endIndex = Math.max(current.startIndex, current.endIndex);
  const start = points[startIndex];
  const end = points[endIndex];
  if (!start || !end || startIndex === endIndex || start.close === 0) {
    return null;
  }

  const change = ((end.close - start.close) / start.close) * 100;
  return {
    from: formatCompactDate(start.date),
    to: formatCompactDate(end.date),
    days: Math.max(1, calendarDays(start.date, end.date)),
    change,
  };
});

function renderChart(): void {
  if (!chart || !hasData.value) {
    return;
  }

  const points = visiblePoints.value;
  const dates = points.map((point) => point.date);
  const textColor = isDark.value ? "#e4e4e7" : "#3f3f46";
  const mutedColor = isDark.value ? "#a1a1aa" : "#71717a";
  const gridColor = isDark.value ? "rgba(63, 63, 70, 0.65)" : "rgba(212, 212, 216, 0.9)";
  const tooltipBackground = isDark.value ? "#18181b" : "#ffffff";
  const tooltipBorder = isDark.value ? "#3f3f46" : "#d4d4d8";
  const priceGrid = hasVolume.value
    ? {
      top: 34,
      right: 18,
      bottom: 124,
      left: 58,
    }
    : {
      top: 34,
      right: 18,
      bottom: 34,
      left: 58,
    };
  const selection = measureSelection();
  const series = [
    {
      name: "Close",
      type: "line",
      data: points.map((point) => point.close),
      symbol: points.length === 1 ? "circle" : "none",
      xAxisIndex: 0,
      yAxisIndex: 0,
      lineStyle: {
        color: priceColor.value,
        width: 2,
      },
      itemStyle: {
        color: priceColor.value,
      },
      areaStyle: {
        color: `${priceColor.value}18`,
      },
      ...(selection
        ? {
          markArea: {
            silent: true,
            itemStyle: {
              color: isDark.value
                ? "rgba(34, 211, 238, 0.10)"
                : "rgba(8, 145, 178, 0.12)",
            },
            data: [[
              { xAxis: selection.startDate },
              { xAxis: selection.endDate },
            ]],
          },
        }
        : {}),
    },
    ...(props.showSma50
      ? [{
        name: "SMA 50",
        type: "line",
        data: points.map((point) => point.sma50),
        symbol: "none",
        xAxisIndex: 0,
        yAxisIndex: 0,
        connectNulls: false,
        lineStyle: {
          color: "#0ea5e9",
          width: 1.6,
        },
      }]
      : []),
    ...(props.showSma150
      ? [{
        name: "SMA 150",
        type: "line",
        data: points.map((point) => point.sma150),
        symbol: "none",
        xAxisIndex: 0,
        yAxisIndex: 0,
        connectNulls: false,
        lineStyle: {
          color: "#f59e0b",
          width: 1.6,
        },
      }]
      : []),
    ...(hasVolume.value
      ? [{
        name: "Volume",
        type: "bar",
        data: points.map((point) => point.volume ?? 0),
        xAxisIndex: 1,
        yAxisIndex: 1,
        itemStyle: {
          color: isDark.value ? "rgba(14, 165, 233, 0.36)" : "rgba(14, 165, 233, 0.28)",
        },
      }]
      : []),
  ];

  chart.setOption({
    animation: false,
    backgroundColor: "transparent",
    legend: {
      top: 0,
      right: 4,
      textStyle: {
        color: mutedColor,
        fontSize: 11,
        fontWeight: 600,
      },
      itemHeight: 8,
      itemWidth: 18,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross",
      },
      backgroundColor: tooltipBackground,
      borderColor: tooltipBorder,
      borderWidth: 1,
      padding: 10,
      textStyle: {
        color: textColor,
        fontSize: 12,
      },
      formatter: formatTooltip,
    },
    grid: [
      priceGrid,
      ...(hasVolume.value
        ? [{
        right: 18,
        bottom: 30,
        left: 58,
        height: 52,
      }]
        : []),
    ],
    xAxis: [
      {
        type: "category",
        data: dates,
        boundaryGap: false,
        axisLabel: {
          color: mutedColor,
          fontSize: 12,
          hideOverlap: false,
          interval: (index: number, value: string) =>
            !hasVolume.value && shouldShowAxisLabel(index, value, dates, props.range),
          formatter: (value: string) => hasVolume.value
            ? ""
            : formatAxisDate(value, props.range),
        },
        axisLine: {
          lineStyle: {
            color: gridColor,
          },
        },
        axisTick: {
          show: false,
        },
      },
      ...(hasVolume.value
        ? [{
        type: "category",
        data: dates,
        gridIndex: 1,
        boundaryGap: true,
        axisLabel: {
          color: mutedColor,
          fontSize: 12,
          hideOverlap: false,
          margin: 12,
          interval: (index: number, value: string) =>
            shouldShowAxisLabel(index, value, dates, props.range),
          formatter: (value: string) =>
            formatAxisDate(value, props.range),
        },
        axisLine: {
          lineStyle: {
            color: gridColor,
          },
        },
        axisTick: {
          show: false,
        },
      }]
        : []),
    ],
    yAxis: [
      {
        type: "value",
        scale: true,
        axisLabel: {
          color: mutedColor,
          formatter: formatAxisPrice,
        },
        splitLine: {
          lineStyle: {
            color: gridColor,
          },
        },
      },
      ...(hasVolume.value
        ? [{
        type: "value",
        gridIndex: 1,
        axisLabel: {
          color: mutedColor,
          formatter: formatAxisVolume,
        },
        splitLine: {
          show: false,
        },
      }]
        : []),
    ],
    series,
  }, true);
}

async function ensureChart(): Promise<void> {
  await nextTick();

  if (!hasData.value) {
    resizeObserver?.disconnect();
    resizeObserver = null;
    chart?.dispose();
    chart = null;
    return;
  }

  if (!chart && chartEl.value) {
    chart = init(chartEl.value, undefined, { renderer: "canvas" });
  }

  if (!resizeObserver && chartEl.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartEl.value);
  }

  renderChart();
}

function onMeasurePointerDown(event: PointerEvent): void {
  const index = pointIndexFromPointer(event);
  if (index === null) {
    return;
  }

  activePointerId = event.pointerId;
  window.addEventListener("pointermove", onMeasurePointerMove);
  window.addEventListener("pointerup", onMeasurePointerUp);
  window.addEventListener("pointercancel", onMeasurePointerUp);
  measure.value = {
    startIndex: index,
    endIndex: index,
    active: true,
  };
  renderChart();
}

function onMeasurePointerMove(event: PointerEvent): void {
  if (activePointerId !== event.pointerId) {
    return;
  }

  const current = measure.value;
  if (!current?.active) {
    return;
  }

  const index = pointIndexFromPointer(event);
  if (index === null || index === current.endIndex) {
    return;
  }

  measure.value = {
    ...current,
    endIndex: index,
  };
  renderChart();
}

function onMeasurePointerUp(event: PointerEvent): void {
  if (activePointerId !== event.pointerId) {
    return;
  }

  window.removeEventListener("pointermove", onMeasurePointerMove);
  window.removeEventListener("pointerup", onMeasurePointerUp);
  window.removeEventListener("pointercancel", onMeasurePointerUp);
  activePointerId = null;

  const current = measure.value;
  if (!current?.active) {
    return;
  }

  measure.value = null;
  renderChart();
}

function pointIndexFromPointer(event: PointerEvent): number | null {
  const element = chartWrapEl.value;
  const points = visiblePoints.value;
  if (!element || points.length === 0) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const leftPadding = 58;
  const rightPadding = 18;
  const plotWidth = Math.max(1, rect.width - leftPadding - rightPadding);
  const relativeX = Math.max(0, Math.min(plotWidth, event.clientX - rect.left - leftPadding));
  const index = Math.round((relativeX / plotWidth) * (points.length - 1));
  return Math.max(0, Math.min(visiblePoints.value.length - 1, index));
}

function measureSelection(): { startDate: string; endDate: string } | null {
  const current = measure.value;
  if (!current || current.startIndex === current.endIndex) {
    return null;
  }

  const points = visiblePoints.value;
  const start = points[Math.min(current.startIndex, current.endIndex)];
  const end = points[Math.max(current.startIndex, current.endIndex)];
  return start && end
    ? {
      startDate: start.date,
      endDate: end.date,
    }
    : null;
}

function formatTooltip(params: unknown): string {
  const items = (Array.isArray(params) ? params : [params]) as TooltipParam[];
  const dataIndex = items.find((item) => typeof item.dataIndex === "number")
    ?.dataIndex ?? 0;
  const point = visiblePoints.value[dataIndex];
  if (!point) {
    return "";
  }

  const markers = new Map(
    items.map((item) => [item.seriesName ?? "", item.marker ?? ""]),
  );
  const rows = [
    tooltipRow("Close", formatCurrency(point.close), markers.get("Close")),
    props.showSma50
      ? tooltipRow("SMA 50", formatNullableCurrency(point.sma50), markers.get("SMA 50"))
      : "",
    props.showSma150
      ? tooltipRow("SMA 150", formatNullableCurrency(point.sma150), markers.get("SMA 150"))
      : "",
    hasVolume.value
      ? tooltipRow("Volume", formatVolume(point.volume ?? null), markers.get("Volume"))
      : "",
  ].filter(Boolean);

  return [
    `<div style="font-weight:700;margin-bottom:6px">${formatDisplayDate(point.date)}</div>`,
    ...rows,
  ].join("");
}

function tooltipRow(label: string, value: string, marker = ""): string {
  return `<div style="display:flex;gap:16px;justify-content:space-between;line-height:1.7">
    <span>${marker}${label}</span><strong>${value}</strong>
  </div>`;
}

function movingAverage(points: ChartPoint[], windowSize: number): Array<number | null> {
  const result: Array<number | null> = [];
  let sum = 0;

  points.forEach((point, index) => {
    sum += point.close;
    if (index >= windowSize) {
      sum -= points[index - windowSize].close;
    }

    result.push(index >= windowSize - 1 ? round(sum / windowSize, 2) : null);
  });

  return result;
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

function formatAxisPrice(value: number): string {
  return value >= 1000 ? `$${Math.round(value).toLocaleString("en-US")}` : `$${round(value, 2)}`;
}

function formatAxisVolume(value: number): string {
  if (value >= 1_000_000_000) return `${round(value / 1_000_000_000, 1)}b`;
  if (value >= 1_000_000) return `${round(value / 1_000_000, 1)}m`;
  if (value >= 1_000) return `${round(value / 1_000, 1)}k`;
  return `${Math.round(value)}`;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatNullableCurrency(value: number | null): string {
  return value === null ? "N/A" : formatCurrency(value);
}

function formatVolume(value: number | null): string {
  return value === null ? "N/A" : formatAxisVolume(value);
}

function formatDisplayDate(value: string): string {
  const date = dateFromIso(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatAxisDate(value: string, range: ChartRange): string {
  const date = dateFromIso(value);
  if (!date) {
    return value;
  }

  if (range === "1D" || range === "7D" || range === "1M") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }

  if (range === "6M" || range === "1Y") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
  }).format(date);
}

function shouldShowAxisLabel(
  index: number,
  value: string,
  dates: string[],
  range: ChartRange,
): boolean {
  if (index === 0) {
    return true;
  }

  if (range === "5Y" || range === "MAX") {
    return !hasSameYear(dates[index - 1], value);
  }

  if (range === "6M" || range === "1Y") {
    return !hasSameMonth(dates[index - 1], value);
  }

  if (range === "1M") {
    return index % Math.max(1, Math.floor(dates.length / 6)) === 0;
  }

  if (range === "7D") {
    return true;
  }

  return true;
}

function formatCompactDate(value: string): string {
  const date = dateFromIso(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${round(value, 2).toFixed(2)}%`;
}

function calendarDays(start: string, end: string): number {
  const startDate = dateFromIso(start);
  const endDate = dateFromIso(end);
  if (!startDate || !endDate) {
    return 0;
  }

  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

function hasSameMonth(left: string | undefined, right: string): boolean {
  const leftDate = left ? dateFromIso(left) : null;
  const rightDate = dateFromIso(right);
  return Boolean(
    leftDate &&
    rightDate &&
    leftDate.getUTCFullYear() === rightDate.getUTCFullYear() &&
    leftDate.getUTCMonth() === rightDate.getUTCMonth(),
  );
}

function hasSameYear(left: string | undefined, right: string): boolean {
  const leftDate = left ? dateFromIso(left) : null;
  const rightDate = dateFromIso(right);
  return Boolean(
    leftDate &&
    rightDate &&
    leftDate.getUTCFullYear() === rightDate.getUTCFullYear(),
  );
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

onMounted(() => {
  themeObserver = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains("dark");
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  void ensureChart();
});

watch(
  [
    visiblePoints,
    () => props.showSma50,
    () => props.showSma150,
    hasVolume,
    isDark,
  ],
  () => {
    measure.value = null;
    void ensureChart();
  },
);

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  resizeObserver?.disconnect();
  window.removeEventListener("pointermove", onMeasurePointerMove);
  window.removeEventListener("pointerup", onMeasurePointerUp);
  window.removeEventListener("pointercancel", onMeasurePointerUp);
  chart?.dispose();
});
</script>

<template>
  <div
    ref="chartWrapEl"
    class="relative h-full min-h-[360px] w-full"
    @pointerdown.capture="onMeasurePointerDown"
  >
    <div
      v-if="hasData"
      ref="chartEl"
      class="h-full min-h-[360px] w-full cursor-crosshair select-none"
    />
    <div
      v-if="measureSummary"
      class="pointer-events-none absolute left-16 top-10 rounded-md border border-zinc-200 bg-white/95 px-3 py-2 text-xs font-bold shadow-dashboard dark:border-zinc-700 dark:bg-zinc-900/95"
    >
      <div class="text-zinc-500 dark:text-zinc-400">
        {{ measureSummary.from }} - {{ measureSummary.to }}
        <span class="ml-1 font-semibold">({{ measureSummary.days }}d)</span>
      </div>
      <div
        class="mt-1 text-sm"
        :class="measureSummary.change >= 0
          ? 'text-emerald-600 dark:text-emerald-300'
          : 'text-rose-600 dark:text-rose-300'"
      >
        {{ formatSignedPercent(measureSummary.change) }}
      </div>
    </div>
    <div
      v-if="!hasData"
      class="flex h-full min-h-[360px] w-full items-center justify-center text-sm font-semibold text-zinc-500 dark:text-zinc-400"
    >
      Chart unavailable
    </div>
  </div>
</template>
