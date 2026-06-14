<script setup lang="ts">
import { RefreshCw } from "@lucide/vue";

import AppTooltip from "@/components/AppTooltip.vue";

withDefaults(defineProps<{
  loading?: boolean;
  label?: string;
  tooltip?: string;
  compact?: boolean;
}>(), {
  loading: false,
  label: "Refresh",
  tooltip: undefined,
  compact: false,
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

function onClick(event: MouseEvent): void {
  emit("click", event);
}
</script>

<template>
  <AppTooltip :text="tooltip ?? label">
    <button
      type="button"
      class="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white font-semibold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
      :class="compact ? 'h-8 w-8 p-0' : 'h-10 px-4 text-sm'"
      :disabled="loading"
      :aria-label="label"
      @click="onClick"
    >
      <RefreshCw
        class="h-4 w-4"
        :class="{ 'animate-spin': loading }"
        aria-hidden="true"
      />
      <span v-if="!compact">{{ label }}</span>
    </button>
  </AppTooltip>
</template>
