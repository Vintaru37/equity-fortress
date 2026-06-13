<script setup lang="ts">
import type { Row } from "@tanstack/vue-table";
import { Trash2 } from "@lucide/vue";

import MetricBadge from "@/components/MetricBadge.vue";
import MoatSelect from "@/components/MoatSelect.vue";
import RefreshButton from "@/components/RefreshButton.vue";
import SparklineChart from "@/components/SparklineChart.vue";
import StockNotes from "@/components/StockNotes.vue";
import type { Moat, StockRowData } from "@/types/stock";
import {
  formatDateTime,
  formatNumber,
} from "@/utils/formatters";

const props = defineProps<{
  row: Row<StockRowData>;
  visibleColumnIds: string[];
}>();

const emit = defineEmits<{
  refresh: [ticker: string];
  remove: [ticker: string];
  updateMoat: [ticker: string, moat: Moat];
  updateNotes: [ticker: string, notes: string];
}>();

function refresh(): void {
  emit("refresh", props.row.original.ticker);
}

function remove(): void {
  emit("remove", props.row.original.ticker);
}

function updateMoat(moat: Moat): void {
  emit("updateMoat", props.row.original.ticker, moat);
}

function updateNotes(notes: string): void {
  emit("updateNotes", props.row.original.ticker, notes);
}
</script>

<template>
  <tr
    class="transition hover:bg-cyan-50/50"
    :class="row.original.rowError
      ? 'bg-rose-50/60 dark:bg-rose-950/30'
      : 'bg-white dark:bg-zinc-950 dark:hover:bg-cyan-950/20'"
  >
    <template
      v-for="columnId in visibleColumnIds"
      :key="columnId"
    >
      <td v-if="columnId === 'ticker'" class="table-cell w-44 min-w-44">
        <div class="flex items-center gap-2">
          <div>
            <div class="text-sm font-bold text-zinc-950 dark:text-white">
              {{ row.original.ticker }}
            </div>
            <div class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {{ formatNumber(row.original.currentPrice, 2) }}
            </div>
          </div>

          <div class="ml-auto flex items-center gap-1 opacity-80">
            <RefreshButton
              compact
              label="Refresh stock"
              :loading="row.original.isRefreshing"
              @click="refresh"
            />
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-rose-800 dark:hover:bg-rose-950 dark:hover:text-rose-300"
              :title="`Remove ${row.original.ticker}`"
              @click="remove"
            >
              <Trash2 class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </td>

      <td v-else-if="columnId === 'company'" class="table-cell w-72 min-w-72">
        <div class="font-semibold text-zinc-900 dark:text-zinc-100">
          {{ row.original.company ?? "N/A" }}
        </div>
        <div
          class="mt-1 text-xs font-medium"
          :class="row.original.rowError ? 'text-rose-600 dark:text-rose-300' : 'text-zinc-500 dark:text-zinc-400'"
        >
          {{ row.original.rowError ?? formatDateTime(row.original.lastUpdated) }}
        </div>
      </td>

      <td v-else-if="columnId === 'oneYearChart'" class="table-cell w-48 min-w-48">
        <SparklineChart :points="row.original.oneYearChart" />
      </td>

      <td v-else-if="columnId === 'performance1W'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.performance1W" kind="performance" percent />
      </td>
      <td v-else-if="columnId === 'performance1Y'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.performance1Y" kind="performance" percent />
      </td>
      <td v-else-if="columnId === 'performance3Y'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.performance3Y" kind="performance" percent />
      </td>
      <td v-else-if="columnId === 'performance5Y'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.performance5Y" kind="performance" percent />
      </td>

      <td v-else-if="columnId === 'analystConsensus'" class="table-cell w-28 min-w-28">
        <span class="block truncate font-semibold text-zinc-700 dark:text-zinc-200">
          {{ row.original.analystConsensus ?? "N/A" }}
        </span>
      </td>

      <td v-else-if="columnId === 'grossMargin'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.grossMargin" percent />
      </td>
      <td v-else-if="columnId === 'operatingMargin'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.operatingMargin" percent />
      </td>
      <td v-else-if="columnId === 'roce'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.roce" kind="roce" percent />
      </td>
      <td v-else-if="columnId === 'fcfMargin'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.fcfMargin" percent />
      </td>
      <td v-else-if="columnId === 'pe'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.pe" :decimals="2" />
      </td>
      <td v-else-if="columnId === 'forwardPe'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.forwardPe" :decimals="2" />
      </td>
      <td v-else-if="columnId === 'peg'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.peg" kind="peg" :decimals="2" />
      </td>
      <td v-else-if="columnId === 'revenueGrowth'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.revenueGrowth" kind="performance" percent />
      </td>
      <td v-else-if="columnId === 'epsGrowth'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.epsGrowth" kind="performance" percent />
      </td>
      <td v-else-if="columnId === 'debtToEquity'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.debtToEquity" kind="debt" :decimals="2" />
      </td>
      <td v-else-if="columnId === 'beta'" class="table-cell numeric-cell w-28 min-w-28">
        <MetricBadge :value="row.original.beta" :decimals="2" />
      </td>

      <td v-else-if="columnId === 'moat'" class="table-cell w-36 min-w-36">
        <MoatSelect
          :model-value="row.original.moat"
          @update:model-value="updateMoat"
        />
      </td>

      <td v-else-if="columnId === 'score'" class="table-cell numeric-cell w-24 min-w-24">
        <MetricBadge :value="row.original.score" kind="score" :decimals="0" />
      </td>

      <td v-else-if="columnId === 'notes'" class="table-cell w-56 min-w-56">
        <StockNotes
          :model-value="row.original.notes"
          :ticker="row.original.ticker"
          @update:model-value="updateNotes"
        />
      </td>
    </template>
  </tr>
</template>
