<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { AlertTriangle, LoaderCircle, Search, Settings } from "@lucide/vue";

import AddTickerForm from "@/components/AddTickerForm.vue";
import AppTooltip from "@/components/AppTooltip.vue";
import AuthControls from "@/components/AuthControls.vue";
import MoatAgentPanel from "@/components/MoatAgentPanel.vue";
import PortfolioControls from "@/components/PortfolioControls.vue";
import RefreshButton from "@/components/RefreshButton.vue";
import StockTable from "@/components/StockTable.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
import logoUrl from "@/assets/images/logo.png";
import { useStocksStore } from "@/stores/useStocksStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { formatDateTime } from "@/utils/formatters";

const store = useStocksStore();
useThemeStore();

const stockTableRef = ref<InstanceType<typeof StockTable> | null>(null);
const lastUpdated = computed(() => formatDateTime(store.lastUpdated));

onMounted(() => {
  void store.initializeDashboard();
});

function openColumns(): void {
  stockTableRef.value?.openColumnDialog();
}
</script>

<template>
  <main class="min-h-screen bg-zinc-100 p-3 text-zinc-950 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
    <header class="mb-4 flex items-center justify-between gap-6">
      <div class="flex items-center gap-3">
        <img
          :src="logoUrl"
          alt="Equity Fortress"
          class="h-14"
        />
      </div>

      <div class="flex items-center gap-3">
        <PortfolioControls />
        <AuthControls />

        <div class="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">
            Portfolio Updated
          </div>
          <div class="text-sm font-bold text-zinc-950 dark:text-white">
            {{ lastUpdated }}
          </div>
        </div>

        <ThemeToggle />
      </div>
    </header>

    <section
      class="mb-4 flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div class="flex flex-wrap items-start gap-3">
        <div class="relative">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            v-model="store.filter"
            class="h-10 w-72 rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm font-medium text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            type="search"
            placeholder="Search ticker or company"
            aria-label="Search ticker or company"
          />
        </div>

        <AddTickerForm @add="store.addTicker" />
      </div>

      <div class="ml-auto flex items-center gap-3">
        <RefreshButton
          label="Refresh"
          tooltip="Refresh: updates prices, fundamentals, estimates, consensus and historical prices"
          :loading="store.refreshing"
          @click="store.refreshAll"
        />
        <MoatAgentPanel />
        <AppTooltip text="Customize columns">
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
            aria-label="Customize columns"
            @click="openColumns"
          >
            <Settings class="h-4 w-4" aria-hidden="true" />
          </button>
        </AppTooltip>
      </div>
    </section>

    <div
      v-if="store.error"
      class="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
    >
      <AlertTriangle class="h-4 w-4" aria-hidden="true" />
      {{ store.error }}
    </div>

    <div
      v-if="store.loading"
      class="mb-4 flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-200"
      role="status"
    >
      <LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" />
      Loading stocks data...
    </div>

    <StockTable ref="stockTableRef" />
  </main>
</template>
