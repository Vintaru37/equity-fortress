import type { Moat } from "@/types/stock";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function normalizeTickerInput(value: string): string | null {
  const ticker = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9.:-]{0,24}$/.test(ticker) ? ticker : null;
}

export function formatNumber(
  value: number | null,
  decimals = 2,
  suffix = "",
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })}${suffix}`;
}

export function formatPercent(value: number | null, decimals = 1): string {
  return formatNumber(value, decimals, "%");
}

export function formatScore(value: number | null): string {
  return value === null ? "N/A" : `${Math.round(value)}`;
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "N/A";
  }

  return dateFormatter.format(date);
}

export function moatTone(moat: Moat): string {
  switch (moat) {
    case "Excellent":
      return "border-emerald-200/75 bg-emerald-50/75 text-emerald-600 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200/90";
    case "Very Good":
      return "border-teal-200/75 bg-teal-50/75 text-teal-600 dark:border-teal-700/50 dark:bg-teal-900/30 dark:text-teal-200/90";
    case "Good":
      return "border-cyan-200/75 bg-cyan-50/75 text-cyan-600 dark:border-cyan-700/50 dark:bg-cyan-900/30 dark:text-cyan-200/90";
    case "Average":
      return "border-amber-200/75 bg-amber-50/75 text-amber-600 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200/90";
    case "Bad":
      return "border-rose-200/75 bg-rose-50/75 text-rose-600 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-200/90";
    case "Very Bad":
      return "border-red-300/75 bg-red-50/75 text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200";
    case "Unknown":
      return "border-zinc-200/80 bg-zinc-50/80 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300";
  }
}

export function analystTone(value: string | null): string {
  if (!value) {
    return "text-zinc-500 dark:text-zinc-500";
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("buy") && !normalized.includes("sell")) {
    return "text-emerald-700 dark:text-emerald-400/85";
  }
  if (normalized.includes("sell")) {
    return "text-rose-700 dark:text-rose-300";
  }
  if (normalized.includes("hold") || normalized.includes("neutral")) {
    return "text-amber-700 dark:text-amber-300";
  }

  return "text-zinc-700 dark:text-zinc-200";
}

export function latestTimestamp(values: Array<string | null>): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .sort();

  return timestamps.at(-1) ?? null;
}
