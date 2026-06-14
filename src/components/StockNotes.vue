<script setup lang="ts">
import { computed } from "vue";
import { ExternalLink } from "@lucide/vue";

const props = defineProps<{
  modelValue: string;
  ticker: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function onInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
}

const sourceLinks = computed(() => {
  const matches = props.modelValue.match(/https?:\/\/[^\s)]+/g) ?? [];
  return Array.from(new Set(matches))
    .slice(0, 3)
    .map((url) => ({
      url,
      label: sourceLabel(url),
    }));
});

function sourceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (_error) {
    return "Source";
  }
}
</script>

<template>
  <div class="grid gap-1.5">
    <textarea
      class="h-24 w-64 resize-none rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 shadow-inner transition placeholder:text-zinc-400 focus:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
      :value="modelValue"
      :aria-label="`${ticker} notes`"
      placeholder="Notes"
      maxlength="1600"
      @input="onInput"
    />
    <div
      v-if="sourceLinks.length > 0"
      class="flex max-w-64 flex-wrap gap-1"
    >
      <a
        v-for="source in sourceLinks"
        :key="source.url"
        class="inline-flex max-w-full items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-cyan-700 dark:hover:bg-cyan-950 dark:hover:text-cyan-200"
        :href="source.url"
        target="_blank"
        rel="noreferrer"
      >
        <span class="truncate">{{ source.label }}</span>
        <ExternalLink class="h-3 w-3 shrink-0" aria-hidden="true" />
      </a>
    </div>
  </div>
</template>
