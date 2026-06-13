<script setup lang="ts">
import { ref } from "vue";
import { Plus } from "@lucide/vue";

import { normalizeTickerInput } from "@/utils/formatters";

const emit = defineEmits<{
  add: [ticker: string];
}>();

const ticker = ref("");
const validationError = ref<string | null>(null);

function submit(): void {
  const normalized = normalizeTickerInput(ticker.value);
  if (!normalized) {
    validationError.value = "Invalid ticker";
    return;
  }

  validationError.value = null;
  emit("add", normalized);
  ticker.value = "";
}
</script>

<template>
  <form class="flex items-start gap-2" @submit.prevent="submit">
    <div>
      <input
        v-model="ticker"
        class="h-10 w-40 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold uppercase text-zinc-800 shadow-sm placeholder:font-medium placeholder:normal-case placeholder:text-zinc-400 focus:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        type="text"
        placeholder="Ticker"
        aria-label="Ticker"
      />
      <p v-if="validationError" class="mt-1 text-xs font-medium text-rose-600">
        {{ validationError }}
      </p>
    </div>

    <button
      type="submit"
      class="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
    >
      <Plus class="h-4 w-4" aria-hidden="true" />
      Add
    </button>
  </form>
</template>
