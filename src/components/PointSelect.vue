<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue: number | null;
  max: number;
  label: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number | null];
}>();

const options = computed(() =>
  Array.from({ length: props.max + 1 }, (_, index) => index)
);

const tone = computed(() => {
  const value = props.modelValue ?? 0;
  const ratio = props.max > 0 ? value / props.max : 0;
  if (ratio >= 0.75) {
    return "border-emerald-200/75 bg-emerald-50/75 text-emerald-600 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200/90";
  }
  if (ratio >= 0.4) {
    return "border-amber-200/75 bg-amber-50/75 text-amber-600 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200/90";
  }
  return "border-rose-200/75 bg-rose-50/75 text-rose-600 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-200/90";
});

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  emit("update:modelValue", Number(value));
}
</script>

<template>
  <select
    class="h-10 w-28 rounded-md border px-3 text-sm font-semibold"
    :aria-label="label"
    :class="tone"
    :value="modelValue ?? 0"
    @change="onChange"
  >
    <option
      v-for="option in options"
      :key="option"
      class="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      :value="option"
    >
      {{ option }}
    </option>
  </select>
</template>
