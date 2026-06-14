<script setup lang="ts">
import {
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
} from "@tanstack/vue-table";
import type {
  Column,
  ColumnDef,
  ColumnOrderState,
  SortingState,
  Updater,
  VisibilityState,
} from "@tanstack/vue-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  GripVertical,
  SlidersHorizontal,
  X,
} from "@lucide/vue";
import { computed, ref } from "vue";

import AppTooltip from "@/components/AppTooltip.vue";
import StockRow from "@/components/StockRow.vue";
import { useStocksStore } from "@/stores/useStocksStore";
import type { StockRowData } from "@/types/stock";

const store = useStocksStore();
const sorting = ref<SortingState>([{ id: "score", desc: true }]);
const showColumnDialog = ref(false);
const draggedColumnId = ref<string | null>(null);
const dragOrderChanged = ref(false);
const COLUMN_PREFS_KEY = "equity-fortress:table-columns";

const defaultColumnOrder = [
  "ticker",
  "actions",
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
  "netDebtToEbitda",
  "revenueGrowth",
  "epsGrowth",
  "debtToEquity",
  "beta",
  "moat",
  "score",
  "notes",
] as const;

type ColumnId = (typeof defaultColumnOrder)[number];

interface ColumnPrefs {
  order: ColumnOrderState;
  visibility: VisibilityState;
}

const defaultColumnIdSet = new Set<string>(defaultColumnOrder);

const columnDescriptions: Record<ColumnId, string> = {
  ticker: "Stock symbol and latest market price.",
  actions: "Refresh or remove this stock.",
  company: "Company name and last successful data update.",
  oneYearChart: "Daily close-price sparkline for the last year.",
  performance1W: "Price return over roughly the last 7 calendar days.",
  performance1Y: "Price return over roughly the last 365 days.",
  performance3Y: "Price return over roughly the last 3 years.",
  performance5Y: "Price return over roughly the last 5 years.",
  analystConsensus: "Yahoo analyst recommendation: buy, hold, or sell.",
  grossMargin:
    "How much revenue remains after direct production costs. Higher margins usually mean more room to absorb cost shocks or pricing pressure.\n\nGross margin = Gross profit / Revenue",
  operatingMargin:
    "How much revenue remains after normal operating costs. It shows how efficiently the core business turns sales into operating profit.\n\nOperating margin = Operating income / Revenue",
  roce: "How effectively the company uses the capital tied up in the business. High ROCE suggests management can turn invested capital into operating profit.\n\nROCE = EBIT / (Total assets - Current liabilities)",
  fcfMargin:
    "How much revenue becomes free cash flow after operating needs and capital spending. It points to cash generation quality, not just accounting profit.\n\nFCF margin = Free cash flow / Revenue",
  pe: "How much investors pay for each dollar of trailing earnings. Lower can mean cheaper, but only if earnings are durable.\n\nP/E = Share price / Trailing EPS",
  forwardPe:
    "How much investors pay for each expected dollar of next-year earnings. It is more forward-looking, but depends on analyst estimates.\n\nForward P/E = Share price / Estimated next-year EPS",
  peg: "Valuation adjusted for earnings growth. It asks whether the P/E is justified by expected or observed EPS growth.\n\nPEG = P/E / EPS growth rate",
  netDebtToEbitda:
    "How many years of EBITDA would be needed to repay net debt. Lower values usually mean safer debt management.\n\nNet Debt/EBITDA = (Total debt - Cash) / EBITDA",
  revenueGrowth:
    "How quickly sales are expanding versus the prior year. It shows demand and business scale before margin effects.\n\nRevenue growth = (Current revenue - Prior revenue) / Prior revenue",
  epsGrowth:
    "How quickly earnings per share are growing versus the prior year. It captures profit growth after costs, taxes, and share-count effects.\n\nEPS growth = (Current EPS - Prior EPS) / Prior EPS",
  debtToEquity:
    "How much debt financing the company uses compared with shareholder capital. Higher values usually mean more leverage and balance-sheet risk.\n\nDebt/Equity = Total debt / Shareholders' equity",
  beta: "How volatile the stock has been compared with the market. A beta above 1 tends to move more than the market; below 1 tends to move less.\n\nBeta = Covariance(stock returns, market returns) / Variance(market returns)",
  moat: "Your qualitative competitive-advantage rating.",
  score: "0-100 weighted quality score calculated by Equity Fortress.",
  notes:
    "Your own qualitative notes and reminders for the position.\n\nStored locally with the dashboard watchlist.",
};

const columns: ColumnDef<StockRowData>[] = [
  { accessorKey: "ticker", header: "Ticker", enableHiding: false },
  {
    id: "actions",
    header: "Actions",
    enableSorting: false,
  },
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
  { accessorKey: "netDebtToEbitda", header: "ND/EBITDA" },
  { accessorKey: "revenueGrowth", header: "Rev Growth" },
  { accessorKey: "epsGrowth", header: "EPS Growth" },
  { accessorKey: "debtToEquity", header: "D/E" },
  { accessorKey: "beta", header: "Beta" },
  { accessorKey: "moat", header: "MOAT" },
  { accessorKey: "score", header: "Score" },
  { accessorKey: "notes", header: "Notes" },
];

const columnWidthClasses: Record<string, string> = {
  ticker: "w-20 min-w-20",
  actions: "w-24 min-w-24",
  company: "w-72 min-w-72",
  oneYearChart: "w-48 min-w-48",
  analystConsensus: "w-28 min-w-28",
  moat: "w-36 min-w-36",
  score: "w-28 min-w-28",
  notes: "w-72 min-w-72",
};

const initialColumnPrefs = readColumnPrefs();
const columnVisibility = ref<VisibilityState>(initialColumnPrefs.visibility);
const columnOrder = ref<ColumnOrderState>(initialColumnPrefs.order);

function readColumnPrefs(): ColumnPrefs {
  try {
    const raw = window.localStorage.getItem(COLUMN_PREFS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ColumnPrefs>) : {};
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

  const saved = value.filter(
    (columnId): columnId is ColumnId =>
      typeof columnId === "string" && defaultColumnIdSet.has(columnId),
  );
  const missing = defaultColumnOrder.filter(
    (columnId) => !saved.includes(columnId),
  );
  return pinTickerFirst([...saved, ...missing]);
}

function normalizeColumnVisibility(value: unknown): VisibilityState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([columnId, visible]) =>
        defaultColumnIdSet.has(columnId) && typeof visible === "boolean",
    ),
  );
}

function persistColumnPrefs(): void {
  window.localStorage.setItem(
    COLUMN_PREFS_KEY,
    JSON.stringify({
      order: columnOrder.value,
      visibility: columnVisibility.value,
    }),
  );
}

function setSorting(updater: Updater<SortingState>): void {
  sorting.value =
    typeof updater === "function" ? updater(sorting.value) : updater;
}

function setColumnVisibility(updater: Updater<VisibilityState>): void {
  columnVisibility.value =
    typeof updater === "function" ? updater(columnVisibility.value) : updater;
  persistColumnPrefs();
}

function setColumnOrder(updater: Updater<ColumnOrderState>): void {
  const nextOrder =
    typeof updater === "function" ? updater(columnOrder.value) : updater;
  columnOrder.value = pinTickerFirst(nextOrder);
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

const configurableColumns = computed(() =>
  table.getAllLeafColumns(),
);
const orderedConfigurableColumns = computed(() => {
  const columnsById = new Map(
    configurableColumns.value.map((column) => [column.id, column]),
  );

  return columnOrder.value
    .map((columnId) => columnsById.get(columnId))
    .filter((column): column is Column<StockRowData, unknown> =>
      Boolean(column),
    );
});
const visibleColumnIds = computed(() =>
  table.getVisibleLeafColumns().map((column) => column.id),
);

function openColumnDialog(): void {
  showColumnDialog.value = true;
}

function closeColumnDialog(): void {
  showColumnDialog.value = false;
}

defineExpose({
  openColumnDialog,
});

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

function columnDescription(columnId: string): string | null {
  return defaultColumnIdSet.has(columnId)
    ? columnDescriptions[columnId as ColumnId]
    : null;
}

function toggleColumn(columnId: string, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  table.getColumn(columnId)?.toggleVisibility(target.checked);
}

function moveColumnTo(columnId: string, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  const toIndex = Number(target.value);
  if (!Number.isInteger(toIndex)) {
    return;
  }

  const currentOrder = [...columnOrder.value];
  const fromIndex = currentOrder.indexOf(columnId);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= currentOrder.length) {
    return;
  }

  const [movedColumn] = currentOrder.splice(fromIndex, 1);
  currentOrder.splice(toIndex, 0, movedColumn);
  columnOrder.value = pinTickerFirst(currentOrder);
  persistColumnPrefs();
}

function columnPosition(columnId: string): number {
  const index = columnOrder.value.indexOf(columnId);
  return index >= 0 ? index : 0;
}

function resetColumns(): void {
  columnOrder.value = pinTickerFirst([...defaultColumnOrder]);
  columnVisibility.value = {};
  persistColumnPrefs();
}

function startColumnDrag(columnId: string, event: DragEvent): void {
  draggedColumnId.value = columnId;
  dragOrderChanged.value = false;
  event.dataTransfer?.setData("text/plain", columnId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    setColumnDragImage(event);
  }
}

function setColumnDragImage(event: DragEvent): void {
  if (!event.dataTransfer || !(event.currentTarget instanceof HTMLElement)) {
    return;
  }

  const dragImage = event.currentTarget.cloneNode(true) as HTMLElement;
  const { width, height } = event.currentTarget.getBoundingClientRect();
  dragImage.classList.add("column-drag-image");
  dragImage.style.width = `${width}px`;
  dragImage.style.height = `${height}px`;
  document.body.appendChild(dragImage);
  event.dataTransfer.setDragImage(dragImage, 18, height / 2);

  window.setTimeout(() => {
    dragImage.remove();
  }, 0);
}

function previewColumnDrop(targetColumnId: string, event: DragEvent): void {
  event.preventDefault();
  const sourceColumnId =
    draggedColumnId.value ?? event.dataTransfer?.getData("text/plain") ?? null;

  if (!sourceColumnId || sourceColumnId === targetColumnId) {
    return;
  }

  const currentOrder = [...columnOrder.value];
  const fromIndex = currentOrder.indexOf(sourceColumnId);
  const toIndex = currentOrder.indexOf(targetColumnId);
  if (fromIndex < 0 || toIndex < 0) {
    return;
  }

  if (sourceColumnId === "ticker" || targetColumnId === "ticker") {
    return;
  }

  const [movedColumn] = currentOrder.splice(fromIndex, 1);
  currentOrder.splice(toIndex, 0, movedColumn);
  columnOrder.value = pinTickerFirst(currentOrder);
  dragOrderChanged.value = true;
}

function dropColumn(event: DragEvent): void {
  event.preventDefault();
  if (dragOrderChanged.value) {
    persistColumnPrefs();
  }
  draggedColumnId.value = null;
  dragOrderChanged.value = false;
}

function endColumnDrag(): void {
  if (dragOrderChanged.value) {
    persistColumnPrefs();
  }
  draggedColumnId.value = null;
  dragOrderChanged.value = false;
}

function columnWidthClass(columnId: string): string {
  return columnWidthClasses[columnId] ?? "w-28 min-w-28";
}

function pinTickerFirst(order: ColumnOrderState): ColumnOrderState {
  return [
    "ticker",
    ...order.filter((columnId) => columnId !== "ticker"),
  ];
}
</script>

<template>
  <section
    class="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-dashboard dark:border-zinc-800 dark:bg-zinc-950"
  >
    <div
      v-if="showColumnDialog"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="column-dialog-title"
      @click.self="closeColumnDialog"
    >
      <div
        class="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-dashboard dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div
          class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
        >
          <div class="flex items-center gap-2">
            <SlidersHorizontal
              class="h-4 w-4 text-zinc-500 dark:text-zinc-400"
              aria-hidden="true"
            />
            <h2
              id="column-dialog-title"
              class="text-sm font-bold text-zinc-900 dark:text-zinc-100"
            >
              Columns
            </h2>
            <span
              class="text-xs font-semibold text-zinc-500 dark:text-zinc-400"
            >
              {{ visibleColumnIds.length }} visible
            </span>
          </div>

          <div class="flex items-center gap-2">
            <AppTooltip text="Reset columns">
              <button
                type="button"
                class="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
                @click="resetColumns"
              >
                Reset
              </button>
            </AppTooltip>
            <AppTooltip text="Close columns">
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
                aria-label="Close columns"
                @click="closeColumnDialog"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </AppTooltip>
          </div>
        </div>

        <div class="overflow-y-auto p-3">
          <div class="grid gap-2">
            <div
              v-for="column in orderedConfigurableColumns"
              :key="column.id"
              class="grid min-h-11 cursor-grab grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm font-semibold text-zinc-800 transition dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-200"
              :class="
                draggedColumnId === column.id
                  ? 'scale-[0.99] cursor-grabbing border-cyan-300 bg-cyan-50 shadow-dashboard opacity-90 dark:border-cyan-700 dark:bg-cyan-950/50'
                  : column.id === 'ticker'
                    ? 'cursor-default opacity-80'
                    : 'opacity-100 hover:border-cyan-200 hover:bg-cyan-50/50 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/20'
              "
              :draggable="column.id !== 'ticker'"
              @dragstart="startColumnDrag(column.id, $event)"
              @dragover="previewColumnDrop(column.id, $event)"
              @drop="dropColumn"
              @dragend="endColumnDrag"
            >
              <span class="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  class="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-transparent text-zinc-400 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-700 active:cursor-grabbing dark:text-zinc-500 dark:hover:border-zinc-700 dark:hover:bg-zinc-950 dark:hover:text-zinc-200"
                  :class="
                    column.id === 'ticker'
                      ? 'cursor-not-allowed opacity-45'
                      : ''
                  "
                  :aria-label="`Drag ${columnLabel(column)} column`"
                  :disabled="column.id === 'ticker'"
                >
                  <GripVertical class="h-4 w-4" aria-hidden="true" />
                </button>
                <input
                  class="h-4 w-4 rounded border-zinc-300 accent-cyan-600 disabled:opacity-45 dark:border-zinc-700"
                  type="checkbox"
                  :checked="column.getIsVisible()"
                  :disabled="!column.getCanHide()"
                  @change="toggleColumn(column.id, $event)"
                />
                <span class="truncate">{{ columnLabel(column) }}</span>
              </span>

              <span class="flex items-center gap-2">
                <span
                  class="text-xs font-semibold text-zinc-500 dark:text-zinc-400"
                >
                  Position
                </span>
                <select
                  class="h-8 w-20 rounded-md border border-zinc-300 bg-white px-2 text-sm font-semibold text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  :value="columnPosition(column.id)"
                  :aria-label="`Column position for ${columnLabel(column)}`"
                  :disabled="column.id === 'ticker'"
                  @change="moveColumnTo(column.id, $event)"
                >
                  <option
                    v-for="(_, index) in orderedConfigurableColumns"
                    :key="index"
                    :value="index"
                  >
                    {{ index + 1 }}
                  </option>
                </select>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="table-scroll max-h-[calc(100vh-180px)] min-h-[800px] overflow-x-scroll overflow-y-auto"
    >
      <table class="w-max min-w-[2500px] border-separate border-spacing-0">
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
                header.column.id === 'ticker'
                  ? 'ticker-sticky-header'
                  : '',
                header.column.getCanSort() ? 'cursor-pointer select-none' : '',
              ]"
              @click="header.column.getToggleSortingHandler()?.($event)"
            >
              <AppTooltip
                :text="columnDescription(header.column.id) ?? ''"
                :disabled="!columnDescription(header.column.id)"
                trigger-class="flex w-full"
              >
                <span
                  class="flex h-11 w-full items-center gap-1 leading-none"
                  :class="header.column.id === 'ticker' ? 'justify-center text-center' : 'justify-start text-left'"
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
                </span>
              </AppTooltip>
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
        {{ store.stocks.length === 0 ? "No stocks in this portfolio" : "No matching stocks" }}
      </div>
    </div>
  </section>
</template>
