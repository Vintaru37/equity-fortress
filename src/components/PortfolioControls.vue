<script setup lang="ts">
import { ref } from "vue";
import { Briefcase, Settings } from "@lucide/vue";

import PortfolioManageDialog from "@/components/PortfolioManageDialog.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import { useStocksStore } from "@/stores/useStocksStore";

const auth = useAuthStore();
const stocks = useStocksStore();
const showManager = ref(false);

async function selectPortfolio(event: Event): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  await stocks.selectPortfolio(target.value);
}
</script>

<template>
  <div v-if="auth.isAuthenticated" class="flex items-center gap-2">
    <div class="relative">
      <Briefcase
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
        aria-hidden="true"
      />
      <select
        class="h-9 w-48 rounded-md border border-zinc-300 bg-white pl-9 pr-8 text-sm font-semibold text-zinc-800 shadow-sm focus:border-cyan-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        aria-label="Portfolio"
        :value="stocks.activePortfolioId ?? ''"
        :disabled="stocks.portfolioLoading"
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
    </div>

    <button
      type="button"
      class="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
      :disabled="stocks.portfolioLoading"
      @click="showManager = true"
    >
      <Settings class="h-4 w-4" aria-hidden="true" />
      Manage
    </button>

    <PortfolioManageDialog
      :open="showManager"
      @close="showManager = false"
    />
  </div>
</template>
