<script setup lang="ts">
import { computed } from "vue";

import {
  formatNumber,
  formatPercent,
  formatScore,
} from "@/utils/formatters";

type MetricKind =
  | "neutral"
  | "performance"
  | "grossMargin"
  | "operatingMargin"
  | "fcfMargin"
  | "roce"
  | "pe"
  | "peg"
  | "debt"
  | "beta"
  | "score";

const tones = {
  neutral: "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  na: "border-zinc-200 bg-zinc-50/80 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-500",
  positive: "border-emerald-200/75 bg-emerald-50/75 text-emerald-600 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200/90",
  warning: "border-amber-200/75 bg-amber-50/75 text-amber-600 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200/90",
  negative: "border-rose-200/75 bg-rose-50/75 text-rose-600 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-200/90",
} as const;

const props = withDefaults(defineProps<{
  value: number | null;
  kind?: MetricKind;
  percent?: boolean;
  decimals?: number;
}>(), {
  kind: "neutral",
  percent: false,
  decimals: 1,
});

const label = computed(() => {
  if (props.kind === "score") {
    return formatScore(props.value);
  }

  return props.percent
    ? formatPercent(props.value, props.decimals)
    : formatNumber(props.value, props.decimals);
});

const tone = computed(() => {
  const value = props.value;
  if (value === null) {
    return tones.na;
  }

  if (props.kind === "performance") {
    if (value > 0) return tones.positive;
    if (value < 0) return tones.negative;
    return tones.warning;
  }

  if (props.kind === "grossMargin") {
    if (value >= 60) return tones.positive;
    if (value >= 45) return tones.warning;
    return tones.negative;
  }

  if (props.kind === "operatingMargin") {
    if (value >= 25) return tones.positive;
    if (value >= 15) return tones.warning;
    return tones.negative;
  }

  if (props.kind === "roce") {
    if (value >= 20) return tones.positive;
    if (value >= 10) return tones.warning;
    return tones.negative;
  }

  if (props.kind === "fcfMargin") {
    if (value >= 20) return tones.positive;
    if (value >= 10) return tones.warning;
    return tones.negative;
  }

  if (props.kind === "pe") {
    if (value <= 0) return tones.negative;
    if (value <= 20) return tones.positive;
    if (value <= 40) return tones.warning;
    return tones.negative;
  }

  if (props.kind === "peg") {
    if (value <= 0) return tones.negative;
    if (value < 1.5) return tones.positive;
    if (value <= 2) return tones.warning;
    return tones.negative;
  }

  if (props.kind === "debt") {
    if (value < 0.5) return tones.positive;
    if (value <= 1.5) return tones.warning;
    return tones.negative;
  }

  if (props.kind === "beta") {
    if (value <= 1) return tones.positive;
    if (value <= 1.3) return tones.warning;
    return tones.negative;
  }

  if (props.kind === "score") {
    if (value >= 75) return tones.positive;
    if (value >= 60) return tones.warning;
    return tones.negative;
  }

  return tones.neutral;
});
</script>

<template>
  <span
    class="inline-flex min-w-16 items-center justify-end rounded-md border px-2 py-1 text-xs font-medium tabular-nums"
    :class="tone"
  >
    {{ label }}
  </span>
</template>
