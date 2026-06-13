<script setup lang="ts">
defineProps<{
  modelValue: string;
  ticker: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function onInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <textarea
    class="h-16 w-48 resize-none rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 shadow-inner transition placeholder:text-zinc-400 focus:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
    :value="modelValue"
    :aria-label="`${ticker} notes`"
    placeholder="Notes"
    maxlength="240"
    @input="onInput"
  />
</template>
