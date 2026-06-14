<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, Save, Trash2, X } from "@lucide/vue";

import { useAuthStore } from "@/stores/useAuthStore";
import { useStocksStore } from "@/stores/useStocksStore";
import { formatDateTime } from "@/utils/formatters";

type DialogMode = "edit" | "new";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const auth = useAuthStore();
const stocks = useStocksStore();
const mode = ref<DialogMode>("edit");
const createName = ref("");
const renameName = ref("");
const confirmingDelete = ref(false);

const activePortfolio = computed(() => stocks.activePortfolio);
const activePortfolioUpdated = computed(() =>
  formatDateTime(
    activePortfolio.value
      ? stocks.getPortfolioLastUpdated(activePortfolio.value.id)
      : null,
  )
);
const activePortfolioStockCount = computed(() =>
  activePortfolio.value
    ? stocks.getPortfolioStockCount(activePortfolio.value.id) ?? 0
    : 0
);
const canDelete = computed(() =>
  auth.isAuthenticated && stocks.portfolios.length > 1 && activePortfolio.value !== null
);

watch(
  [() => props.open, activePortfolio],
  () => {
    renameName.value = activePortfolio.value?.name ?? "";
    confirmingDelete.value = false;
    if (props.open) {
      mode.value = "edit";
    }
  },
  { immediate: true },
);

function close(): void {
  emit("close");
}

async function selectPortfolio(event: Event): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  await stocks.selectPortfolio(target.value);
}

async function createPortfolio(): Promise<void> {
  const name = createName.value.trim();
  if (!name) {
    return;
  }

  await stocks.createPortfolio(name);
  if (!stocks.error) {
    createName.value = "";
    mode.value = "edit";
  }
}

async function renamePortfolio(): Promise<void> {
  const portfolio = activePortfolio.value;
  if (!portfolio) {
    return;
  }

  await stocks.renamePortfolio(portfolio.id, renameName.value);
}

async function deletePortfolio(): Promise<void> {
  const portfolio = activePortfolio.value;
  if (!portfolio) {
    return;
  }

  if (!confirmingDelete.value) {
    confirmingDelete.value = true;
    return;
  }

  await stocks.deletePortfolio(portfolio.id);
  confirmingDelete.value = false;
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[220] flex items-center justify-center bg-zinc-950/45 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="portfolio-manage-dialog-title"
    @click.self="close"
  >
    <div class="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-dashboard dark:border-zinc-800 dark:bg-zinc-950">
      <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2
          id="portfolio-manage-dialog-title"
          class="text-sm font-bold text-zinc-900 dark:text-zinc-100"
        >
          Portfolio
        </h2>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
          aria-label="Close portfolio manager"
          @click="close"
        >
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div class="grid gap-4 p-4">
        <div class="grid grid-cols-2 gap-2 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">
          <button
            type="button"
            class="h-8 rounded-md text-sm font-semibold transition"
            :class="mode === 'edit'
              ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-100'
              : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'"
            @click="mode = 'edit'"
          >
            Edit
          </button>
          <button
            type="button"
            class="h-8 rounded-md text-sm font-semibold transition"
            :class="mode === 'new'
              ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-100'
              : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'"
            @click="mode = 'new'"
          >
            New
          </button>
        </div>

        <div v-if="mode === 'edit'" class="grid gap-4">
          <select
            class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm focus:border-cyan-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Portfolio"
            :value="stocks.activePortfolioId ?? ''"
            :disabled="!auth.isAuthenticated || stocks.portfolioLoading"
            @change="selectPortfolio"
          >
            <option
              v-for="portfolio in stocks.portfolios"
              :key="portfolio.id"
              :value="portfolio.id"
            >
              {{ portfolio.name }}
            </option>
          </select>

          <div class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div class="font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Stocks
              </div>
              <div class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                {{ activePortfolioStockCount }}
              </div>
            </div>
            <div>
              <div class="font-semibold uppercase text-zinc-500 dark:text-zinc-400">
                Data Updated
              </div>
              <div class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                {{ activePortfolioUpdated }}
              </div>
            </div>
          </div>

          <form class="grid grid-cols-[minmax(0,1fr)_auto] gap-2" @submit.prevent="renamePortfolio">
            <input
              v-model="renameName"
              class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:border-cyan-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              type="text"
              placeholder="Portfolio name"
              aria-label="Portfolio name"
              :disabled="!auth.isAuthenticated || stocks.portfolioLoading || !activePortfolio"
            />
            <button
              type="submit"
              class="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
              :disabled="!auth.isAuthenticated || stocks.portfolioLoading || !activePortfolio || !renameName.trim()"
            >
              <Save class="h-4 w-4" aria-hidden="true" />
              Rename
            </button>
          </form>

          <div class="flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p
              v-if="stocks.error"
              class="min-w-0 truncate text-xs font-semibold text-rose-600 dark:text-rose-300"
            >
              {{ stocks.error }}
            </p>
            <span v-else class="min-w-0" />

            <button
              type="button"
              class="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-950"
              :disabled="!canDelete || stocks.portfolioLoading"
              @click="deletePortfolio"
            >
              <Trash2 class="h-4 w-4" aria-hidden="true" />
              {{ confirmingDelete ? "Confirm" : "Remove" }}
            </button>
          </div>
        </div>

        <form v-else class="grid gap-3" @submit.prevent="createPortfolio">
          <input
            v-model="createName"
            class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:border-cyan-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            type="text"
            placeholder="Portfolio name"
            aria-label="Portfolio name"
            :disabled="!auth.isAuthenticated || stocks.portfolioLoading"
          />
          <p
            v-if="stocks.error"
            class="text-xs font-semibold text-rose-600 dark:text-rose-300"
          >
            {{ stocks.error }}
          </p>
          <button
            type="submit"
            class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
            :disabled="!auth.isAuthenticated || stocks.portfolioLoading || !createName.trim()"
          >
            <Plus class="h-4 w-4" aria-hidden="true" />
            Create
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
