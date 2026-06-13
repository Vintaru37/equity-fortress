<script setup lang="ts">
import {
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type Column,
  type ColumnOrderState,
  type ColumnDef,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/vue-table";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  SlidersHorizontal,
} from "@lucide/vue";
import { computed, ref } from "vue";

import StockRow from "@/components/StockRow.vue";
import { useStocksStore } from "@/stores/useStocksStore";
import type { StockRowData } from "@/types/stock";

const store = useStocksStore();
const sorting = ref<SortingState>([
  { id: "score", desc: true },
]);
const COLUMN_PREFS_KEY = "equity-fortress:table-columns";

const defaultColumnOrder = [
  "ticker",
  "company",
  "oneYearChart",
  "performance1W",
  "performance1Y",
  "performance3Y",
  "performance5Y",
  "analystConsensus",
  "grossMargin",
  "operatingMargin",
  "roce",
  "fcfMargin",
  "pe",
  "forwardPe",
  "peg",
  "revenueGrowth",
  "epsGrowth",
  "debtToEquity",
  "beta",
  "moat",
  "score",
  "notes",
] as const;

type ColumnId = typeof defaultColumnOrder[number];

interface ColumnPrefs {
  order: ColumnOrderState;
  visibility: VisibilityState;
}

const defaultColumnIdSet = new Set<string>(defaultColumnOrder);

const columns: ColumnDef<StockRowData>[] = [
  { accessorKey: "ticker", header: "Ticker", enableHiding: false },
  { accessorKey: "company", header: "Company", enableHiding: false },
  {
    id: "oneYearChart",
    header: "1Y Chart",
    accessorFn: (row) => row.oneYearChart.at(-1)?.close ?? null,
  },
  { accessorKey: "performance1W", header: "1W Perf" },
  { accessorKey: "performance1Y", header: "1Y Perf" },
  { accessorKey: "performance3Y", header: "3Y Perf" },
  { accessorKey: "performance5Y", header: "5Y Perf" },
  { accessorKey: "analystConsensus", header: "Analyst" },
  { accessorKey: "grossMargin", header: "Gross %" },
  { accessorKey: "operatingMargin", header: "Op %" },
  { accessorKey: "roce", header: "ROCE" },
  { accessorKey: "fcfMargin", header: "FCF %" },
  { accessorKey: "pe", header: "P/E" },
  { accessorKey: "forwardPe", header: "Fwd P/E" },
  { accessorKey: "peg", header: "PEG" },
  { accessorKey: "revenueGrowth", header: "Rev Growth" },
  { accessorKey: "epsGrowth", header: "EPS Growth" },
  { accessorKey: "debtToEquity", header: "D/E" },
  { accessorKey: "beta", header: "Beta" },
  { accessorKey: "moat", header: "MOAT" },
  { accessorKey: "score", header: "Score" },
  { accessorKey: "notes", header: "Notes" },
];

const rightAlignedColumnIds = new Set([
  "performance1W",
  "performance1Y",
  "performance3Y",
  "performance5Y",
  "grossMargin",
  "operatingMargin",
  "roce",
  "fcfMargin",
  "pe",
  "forwardPe",
  "peg",
  "revenueGrowth",
  "epsGrowth",
  "debtToEquity",
  "beta",
  "score",
]);

const columnWidthClasses: Record<string, string> = {
  ticker: "w-44 min-w-44",
  company: "w-72 min-w-72",
  oneYearChart: "w-48 min-w-48",
  analystConsensus: "w-28 min-w-28",
  moat: "w-36 min-w-36",
  score: "w-24 min-w-24",
  notes: "w-56 min-w-56",
};

const initialColumnPrefs = readColumnPrefs();
const columnVisibility = ref<VisibilityState>(initialColumnPrefs.visibility);
const columnOrder = ref<ColumnOrderState>(initialColumnPrefs.order);

function readColumnPrefs(): ColumnPrefs {
  try {
    const raw = window.localStorage.getItem(COLUMN_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<ColumnPrefs> : {};
    return {
      order: normalizeColumnOrder(parsed.order),
      visibility: normalizeColumnVisibility(parsed.visibility),
    };
  } catch (_error) {
    return {
      order: [...defaultColumnOrder],
      visibility: {},
    };
  }
}

function normalizeColumnOrder(value: unknown): ColumnOrderState {
  if (!Array.isArray(value)) {
    return [...defaultColumnOrder];
  }

  const saved = value
    .filter((columnId): columnId is ColumnId =>
      typeof columnId === "string" && defaultColumnIdSet.has(columnId)
    );
  const missing = defaultColumnOrder.filter((columnId) => !saved.includes(columnId));
  return [...saved, ...missing];
}

function normalizeColumnVisibility(value: unknown): VisibilityState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([columnId, visible]) =>
        defaultColumnIdSet.has(columnId) && typeof visible === "boolean"
      ),
  );
}

function persistColumnPrefs(): void {
  window.localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify({
    order: columnOrder.value,
    visibility: columnVisibility.value,
  }));
}

function setSorting(updater: Updater<SortingState>): void {
  sorting.value = typeof updater === "function"
    ? updater(sorting.value)
    : updater;
}

function setColumnVisibility(updater: Updater<VisibilityState>): void {
  columnVisibility.value = typeof updater === "function"
    ? updater(columnVisibility.value)
    : updater;
  persistColumnPrefs();
}

function setColumnOrder(updater: Updater<ColumnOrderState>): void {
  columnOrder.value = typeof updater === "function"
    ? updater(columnOrder.value)
    : updater;
  persistColumnPrefs();
}

const table = useVueTable({
  get data() {
    return store.filteredStocks;
  },
  columns,
  state: {
    get sorting() {
      return sorting.value;
    },
    get columnVisibility() {
      return columnVisibility.value;
    },
    get columnOrder() {
      return columnOrder.value;
    },
  },
  onSortingChange: setSorting,
  onColumnVisibilityChange: setColumnVisibility,
  onColumnOrderChange: setColumnOrder,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});

const configurableColumns = computed(() => table.getAllLeafColumns());
const visibleColumnIds = computed(() =>
  table.getVisibleLeafColumns().map((column) => column.id)
);

function sortIcon(state: false | "asc" | "desc") {
  if (state === "asc") {
    return ArrowUp;
  }

  if (state === "desc") {
    return ArrowDown;
  }

  return ArrowUpDown;
}

function columnLabel(column: Column<StockRowData, unknown>): string {
  return typeof column.columnDef.header === "string"
    ? column.columnDef.header
    : column.id;
}

function toggleColumn(columnId: string, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  table.getColumn(columnId)?.toggleVisibility(target.checked);
}

function moveColumn(columnId: string, direction: "left" | "right"): void {
  const currentOrder = [...columnOrder.value];
  const fromIndex = currentOrder.indexOf(columnId);
  const toIndex = direction === "left" ? fromIndex - 1 : fromIndex + 1;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= currentOrder.length) {
    return;
  }

  [currentOrder[fromIndex], currentOrder[toIndex]] = [
    currentOrder[toIndex],
    currentOrder[fromIndex],
  ];
  columnOrder.value = currentOrder;
  persistColumnPrefs();
}

function canMove(columnId: string, direction: "left" | "right"): boolean {
  const index = columnOrder.value.indexOf(columnId);
  return direction === "left"
    ? index > 0
    : index >= 0 && index < columnOrder.value.length - 1;
}

function isRightAligned(columnId: string): boolean {
  return rightAlignedColumnIds.has(columnId);
}

function columnWidthClass(columnId: string): string {
  return columnWidthClasses[columnId] ?? "w-28 min-w-28";
}
</script>

<template>
  <section class="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-dashboard dark:border-zinc-800 dark:bg-zinc-950">
    <div class="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
          <SlidersHorizontal class="h-4 w-4" aria-hidden="true" />
          Columns
        </div>
        <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          {{ visibleColumnIds.length }} visible
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <label
          v-for="column in configurableColumns"
          :key="column.id"
          class="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50/80 px-2.5 text-xs font-semibold text-zinc-700 transition hover:border-cyan-200 hover:bg-cyan-50 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/40"
          :class="!column.getCanHide() ? 'cursor-not-allowed opacity-65' : 'cursor-pointer'"
        >
          <input
            class="h-3.5 w-3.5 rounded border-zinc-300 accent-cyan-600 dark:border-zinc-700"
            type="checkbox"
            :checked="column.getIsVisible()"
            :disabled="!column.getCanHide()"
            @change="toggleColumn(column.id, $event)"
          />
          <span>{{ columnLabel(column) }}</span>
          <span class="ml-1 flex items-center gap-1">
            <button
              type="button"
              class="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent text-zinc-500 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-35 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-950 dark:hover:text-zinc-100"
              :disabled="!canMove(column.id, 'left')"
              :title="`Move ${columnLabel(column)} left`"
              @click.prevent="moveColumn(column.id, 'left')"
            >
              <ArrowLeft class="h-3 w-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent text-zinc-500 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-35 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-950 dark:hover:text-zinc-100"
              :disabled="!canMove(column.id, 'right')"
              :title="`Move ${columnLabel(column)} right`"
              @click.prevent="moveColumn(column.id, 'right')"
            >
              <ArrowRight class="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        </label>
      </div>
    </div>

    <div class="table-scroll max-h-[calc(100vh-260px)] min-h-[440px] overflow-x-scroll overflow-y-auto">
      <table class="w-max min-w-[2380px] border-separate border-spacing-0">
        <thead>
          <tr
            v-for="headerGroup in table.getHeaderGroups()"
            :key="headerGroup.id"
          >
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              class="table-header-cell"
              :class="[
                columnWidthClass(header.column.id),
                isRightAligned(header.column.id)
                  ? 'text-right'
                  : '',
                header.column.getCanSort() ? 'cursor-pointer select-none' : '',
              ]"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <div
                class="flex h-11 items-center gap-1 leading-none"
                :class="isRightAligned(header.column.id)
                  ? 'justify-end'
                  : 'justify-start'"
              >
                <FlexRender
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
                <component
                  :is="sortIcon(header.column.getIsSorted())"
                  v-if="header.column.getCanSort()"
                  class="h-3.5 w-3.5 shrink-0 text-zinc-400"
                  aria-hidden="true"
                />
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          <StockRow
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :row="row"
            :visible-column-ids="visibleColumnIds"
            @refresh="store.refreshStock"
            @remove="store.removeTicker"
            @update-moat="store.updateMoat"
            @update-notes="store.updateNotes"
          />
        </tbody>
      </table>

      <div
        v-if="table.getRowModel().rows.length === 0"
        class="flex h-80 items-center justify-center text-sm font-semibold text-zinc-500 dark:text-zinc-400"
      >
        No matching stocks
      </div>
    </div>
  </section>
</template>
