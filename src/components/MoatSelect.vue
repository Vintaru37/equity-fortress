<script setup lang="ts">
import { computed } from "vue";

import { MOAT_OPTIONS, type Moat } from "@/types/stock";
import { moatTone } from "@/utils/formatters";

const props = defineProps<{
  modelValue: Moat;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: Moat];
}>();

const tone = computed(() => moatTone(props.modelValue));

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as Moat;
  emit("update:modelValue", value);
}
</script>

<template>
  <select
    class="h-9 w-32 rounded-md border px-2 text-xs font-semibold"
    :class="tone"
    :value="modelValue"
    @change="onChange"
  >
    <option
      v-for="option in MOAT_OPTIONS"
      :key="option"
      class="bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      :value="option"
    >
      {{ option }}
    </option>
  </select>
</template>
