<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { init, use, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import type { ChartPoint } from "@/types/stock";

use([LineChart, GridComponent, CanvasRenderer]);

const props = defineProps<{
  points: ChartPoint[];
}>();

const chartEl = ref<HTMLDivElement | null>(null);
let chart: EChartsType | null = null;
let resizeObserver: ResizeObserver | null = null;

const hasData = computed(() => props.points.length > 1);

const strokeColor = computed(() => {
  if (!hasData.value) {
    return "#a1a1aa";
  }

  const first = props.points[0].close;
  const last = props.points[props.points.length - 1].close;
  return last >= first ? "#059669" : "#dc2626";
});

function renderChart(): void {
  if (!chart || !hasData.value) {
    return;
  }

  chart.setOption({
    animation: false,
    grid: {
      top: 4,
      right: 2,
      bottom: 4,
      left: 2,
    },
    xAxis: {
      type: "category",
      data: props.points.map((point) => point.date),
      show: false,
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      show: false,
      scale: true,
    },
    series: [
      {
        type: "line",
        data: props.points.map((point) => point.close),
        symbol: "none",
        lineStyle: {
          color: strokeColor.value,
          width: 2,
        },
        areaStyle: {
          color: `${strokeColor.value}1A`,
        },
      },
    ],
    tooltip: {
      show: false,
    },
  });
}

onMounted(async () => {
  await nextTick();
  if (!chartEl.value || !hasData.value) {
    return;
  }

  chart = init(chartEl.value, undefined, { renderer: "canvas" });
  renderChart();

  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(chartEl.value);
});

watch(
  () => props.points,
  async () => {
    await nextTick();
    if (!hasData.value) {
      chart?.dispose();
      chart = null;
      return;
    }

    if (!chart && chartEl.value) {
      chart = init(chartEl.value, undefined, { renderer: "canvas" });
    }

    renderChart();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <div class="h-12 w-36">
    <div v-if="hasData" ref="chartEl" class="h-full w-full" />
    <div
      v-else
      class="flex h-full w-full items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
    >
      N/A
    </div>
  </div>
</template>
