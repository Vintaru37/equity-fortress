<script setup lang="ts">
import { computed, ref } from "vue";
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  ExternalLink,
  FileText,
  LoaderCircle,
  Sparkles,
  X,
} from "@lucide/vue";

import AppTooltip from "@/components/AppTooltip.vue";
import { useStocksStore } from "@/stores/useStocksStore";
import { MOAT_OPTIONS, type Moat, type StockRowData } from "@/types/stock";
import type {
  MoatAgentHealth,
  MoatAgentResult,
  MoatAgentSource,
  MoatAgentStockInput,
} from "@/types/moatAgent";
import {
  cleanAgentUrl,
  DEFAULT_MOAT_AGENT_URL,
  getMoatAgentHealth,
  researchMoats,
} from "@/utils/moatAgentApi";
import { formatDateTime, moatTone } from "@/utils/formatters";

type ResearchScope = "portfolio" | "filtered";

const AGENT_URL_KEY = "equity-fortress:moat-agent-url";
const MAX_NOTE_LENGTH = 1600;

const store = useStocksStore();
const isOpen = ref(false);
const scope = ref<ResearchScope>("portfolio");
const recencyDays = ref(365);
const maxTickers = ref(10);
const agentUrl = ref(
  window.localStorage.getItem(AGENT_URL_KEY) ?? DEFAULT_MOAT_AGENT_URL,
);
const loading = ref(false);
const saving = ref(false);
const healthLoading = ref(false);
const error = ref<string | null>(null);
const health = ref<MoatAgentHealth | null>(null);
const researchedAt = ref<string | null>(null);
const results = ref<MoatAgentResult[]>([]);
const appliedTickers = ref<string[]>([]);
const promptCopied = ref(false);

const candidateStocks = computed(() =>
  scope.value === "filtered" ? store.filteredStocks : store.stocks,
);
const researchStocks = computed(() =>
  candidateStocks.value.slice(0, maxTickers.value),
);
const successfulResults = computed(() =>
  results.value.filter((result) => result.status !== "error"),
);
const canResearch = computed(
  () => !loading.value && researchStocks.value.length > 0,
);

function openPanel(): void {
  isOpen.value = true;
  error.value = null;
  void refreshHealth();
}

function closePanel(): void {
  isOpen.value = false;
}

async function refreshHealth(): Promise<void> {
  healthLoading.value = true;

  try {
    health.value = await getMoatAgentHealth(agentUrl.value);
  } catch (_healthError) {
    health.value = null;
  } finally {
    healthLoading.value = false;
  }
}

function persistAgentUrl(): void {
  agentUrl.value = cleanAgentUrl(agentUrl.value || DEFAULT_MOAT_AGENT_URL);
  window.localStorage.setItem(AGENT_URL_KEY, agentUrl.value);
}

async function runResearch(): Promise<void> {
  if (!canResearch.value) {
    return;
  }

  persistAgentUrl();
  loading.value = true;
  error.value = null;
  appliedTickers.value = [];

  try {
    const response = await researchMoats(agentUrl.value, {
      tickers: researchStocks.value.map(stockToAgentInput),
      recencyDays: recencyDays.value,
      concurrency: 2,
    });

    results.value = response.results;
    researchedAt.value = response.researchedAt;
    void refreshHealth();
  } catch (requestError) {
    error.value =
      requestError instanceof DOMException && requestError.name === "AbortError"
        ? "Moat research timed out. Try a smaller limit or restart the local agent."
        : requestError instanceof Error
          ? requestError.message
          : "Moat research failed";
  } finally {
    loading.value = false;
  }
}

async function copyPortfolioPrompt(): Promise<void> {
  const prompt = buildPortfolioMoatPrompt();

  try {
    await navigator.clipboard.writeText(prompt);
    promptCopied.value = true;
    window.setTimeout(() => {
      promptCopied.value = false;
    }, 1800);
  } catch (_error) {
    error.value = "Could not copy prompt to clipboard";
  }
}

function buildPortfolioMoatPrompt(): string {
  const stockNames = store.filteredStocks
    .map((stock) =>
      stock.company ? `${stock.company} (${stock.ticker})` : stock.ticker,
    )
    .join(", ");

  return [
    `Przeprowadź analizę punktową dla spółek: ${stockNames || "brak spółek"}, ściśle według poniższego systemu oceny (1-100 pkt) dla danych z obecnego roku.`,
    "1. Fundamentals (0-40 pkt):",
    "•\tROCE (Cel: >15-20%): 0-20 pkt.",
    "•\tMarża Brutto (Cel: >40%): 0-10 pkt.",
    "•\tWzrost Przychodów & FCF: 0-10 pkt.",
    "2. Risks (0-25 pkt):",
    "•\tZadłużenie & Niezależność (Net Debt/EBITDA, brak koncentracji klientów): 0-15 pkt.",
    "•\tKonkurencyjność (Moat): 0-10 pkt.",
    "3. Catalysts & Valuation (0-35 pkt):",
    "•\tWycena (Forward P/E vs P/E): 0-5 pkt.",
    "•\tSmart Money & Insiders (politycy, rządy, instytucje, wall street): 0-15 pkt.",
    "•\tNowe Kontrakty/AI/Backlog: 0-10 pkt.",
    "•\tBuybacks: 0-5 pkt.",
    "WYMAGANIA DOTYCZĄCE ODPOWIEDZI:",
    "1.\tPrzedstaw wyniki w formie tabeli, gdzie wiersze to spółki, a kolumny to poszczególne kryteria z przypisaną punktacją.",
    "2.\tPod tabelą dodaj sekcję 'Werdykt i Strategia', w której dla każdej spółki:",
    "o\tPodasz łączną sumę punktów.",
    "o\tPrzypiszesz kategorię (90-100: Unicorn/Silne Kupuj (Okazja dekady) | 75-89: Smart Money Play/Kupuj | 60-74: Trzymaj/Akumuluj | <60: Unikaj).",
    "o\tOkreślisz konkretną metodę wejścia: Jednorazowo (Lump Sum) czy DCA (Akumulacja), uzasadniając wybór w jednym zdaniu (np. wejście pod szybki katalizator vs budowanie pozycji na korektach).",
    "3.\tDodaj drugą tabelę 'Wartości do aplikacji', gdzie wiersze to spółki, a kolumny to: Independence/Niezależność (0-5), Moat/Konkurencyjność (0-10), Smart Money (0-15), Kontrakty/AI/Backlog (0-10), Buybacks (0-5), Czy długoterminowa? (Tak/Nie: 5-10 lat+ vs spekulacja pod katalizator) oraz krótkie uzasadnienie.",
    "4.\tDodaj sekcję, w której jednoznacznie ocenisz czy spółka jest bezpieczną inwestycją długoterminową (5-10 lat+), czy jedynie spekulacyjnym zagraniem pod katalizator.",
    "5.\tUwzględnij najświeższe dane z obecnego roku, w tym aktywność Smart Money (np. Pelosi, fundusze rządowe, instytucje, Wall Street).",
  ].join("\n");
}

function stockToAgentInput(stock: StockRowData): MoatAgentStockInput {
  return {
    ticker: stock.ticker,
    company: stock.company,
    sector: stock.sector,
    industry: stock.industry,
    currentMoat: stock.moat,
    currentNotes: stock.notes,
  };
}

async function applyResult(result: MoatAgentResult): Promise<void> {
  const current = store.stocks.find((stock) => stock.ticker === result.ticker);
  if (!current || result.status === "error") {
    return;
  }

  const note = mergeNotes(current.notes, composeResearchNote(result));
  saving.value = true;

  try {
    await store.applyResearchUpdates([
      {
        ticker: result.ticker,
        notes: note,
        moat:
          isMoat(result.moat) && result.moat !== "Unknown"
            ? result.moat
            : current.moat,
      },
    ]);

    if (!appliedTickers.value.includes(result.ticker)) {
      appliedTickers.value = [...appliedTickers.value, result.ticker];
    }
  } finally {
    saving.value = false;
  }
}

async function applyAll(): Promise<void> {
  const updates = successfulResults.value
    .filter((result) => !isApplied(result.ticker))
    .map((result) => {
      const current = store.stocks.find(
        (stock) => stock.ticker === result.ticker,
      );
      if (!current) {
        return null;
      }

      return {
        ticker: result.ticker,
        notes: mergeNotes(current.notes, composeResearchNote(result)),
        moat:
          isMoat(result.moat) && result.moat !== "Unknown"
            ? result.moat
            : current.moat,
      };
    })
    .filter(
      (
        update,
      ): update is {
        ticker: string;
        notes: string;
        moat: Moat;
      } => update !== null,
    );

  if (updates.length === 0) {
    return;
  }

  saving.value = true;

  try {
    await store.applyResearchUpdates(updates);
    appliedTickers.value = Array.from(
      new Set([
        ...appliedTickers.value,
        ...updates.map((update) => update.ticker),
      ]),
    );
  } finally {
    saving.value = false;
  }
}

function isApplied(ticker: string): boolean {
  return appliedTickers.value.includes(ticker);
}

function composeResearchNote(result: MoatAgentResult): string {
  const noteDate = result.researchedAt.slice(0, 10);
  const points = keyPointsForResult(result)
    .slice(0, 3)
    .map((point) => `- ${stripSourceRefs(point)}`);
  const sourceLines = result.sources
    .slice(0, 2)
    .map(
      (source, index) =>
        `${index + 1}. ${sourceIconLabel(source)} ${sourceLabel(source)}: ${source.url}`,
    );
  const riskLine =
    result.risks.length > 0
      ? `Watch: ${result.risks.slice(0, 2).join("; ")}.`
      : "";

  return clipNote(
    [
      `AI moat ${noteDate}: ${result.moat}`,
      ...points,
      riskLine,
      sourceLines.length > 0 ? `Sources:\n${sourceLines.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function mergeNotes(existingNotes: string, nextNote: string): string {
  const existing = existingNotes.trim();
  if (!existing) {
    return clipNote(nextNote);
  }

  return clipNote(`${existing}\n\n${nextNote}`);
}

function clipNote(note: string): string {
  const cleaned = note.replace(/\s+\n/g, "\n").trim();
  if (cleaned.length <= MAX_NOTE_LENGTH) {
    return cleaned;
  }

  return `${cleaned.slice(0, MAX_NOTE_LENGTH - 3).trim()}...`;
}

function isMoat(value: string): value is Moat {
  return (MOAT_OPTIONS as string[]).includes(value);
}

function sourceLabel(source: MoatAgentSource): string {
  return source.date ?? source.dateLabel ?? "freshness-filtered";
}

function sourceIconLabel(source: MoatAgentSource): string {
  return source.type === "filing" ? "SEC" : "Web";
}

function keyPointsForResult(result: MoatAgentResult): string[] {
  return result.keyPoints.length > 0 ? result.keyPoints : [result.summary];
}

function stripSourceRefs(value: string): string {
  return value.replace(/\s+\[\d+\]/g, "").trim();
}

function sourceTitle(source: MoatAgentSource): string {
  try {
    const url = new URL(source.url);
    return `${sourceIconLabel(source)}: ${url.hostname.replace(/^www\./, "")}`;
  } catch (_error) {
    return sourceIconLabel(source);
  }
}

function statusTone(status: MoatAgentResult["status"]): string {
  if (status === "ok") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }

  if (status === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }

  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200";
}
</script>

<template>
  <div class="flex items-center gap-2">
    <AppTooltip text="Copy AI scoring prompt for the currently visible stocks">
      <button
        type="button"
        class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
        :disabled="store.filteredStocks.length === 0"
        @click="copyPortfolioPrompt"
      >
        <Check
          v-if="promptCopied"
          class="h-4 w-4 text-emerald-600 dark:text-emerald-300"
          aria-hidden="true"
        />
        <Copy v-else class="h-4 w-4" aria-hidden="true" />
        {{ promptCopied ? "Copied" : "Prompt" }}
      </button>
    </AppTooltip>

    <AppTooltip text="Research moat notes">
      <button
        type="button"
        class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
        aria-label="Research moat notes"
        @click="openPanel"
      >
        <Bot class="h-4 w-4" aria-hidden="true" />
      </button>
    </AppTooltip>
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[220] flex items-center justify-center bg-zinc-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moat-agent-title"
      @click.self="closePanel"
    >
      <section
        class="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-dashboard dark:border-zinc-800 dark:bg-zinc-950"
      >
        <header
          class="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800"
        >
          <div class="flex min-w-0 items-center gap-2">
            <Bot
              class="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300"
              aria-hidden="true"
            />
            <h2
              id="moat-agent-title"
              class="truncate text-sm font-bold text-zinc-950 dark:text-zinc-100"
            >
              Moat Agent
            </h2>
            <span
              class="text-xs font-semibold text-zinc-500 dark:text-zinc-400"
            >
              {{ researchStocks.length }} selected
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span
              v-if="healthLoading"
              class="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400"
            >
              <LoaderCircle
                class="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
              Checking
            </span>
            <span
              v-else-if="health"
              class="rounded-md border px-2 py-1 text-xs font-semibold"
              :class="
                health.ollama?.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
              "
            >
              {{ health.ollama?.ok ? "Ollama ready" : "Fallback mode" }}
            </span>
            <AppTooltip text="Close">
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
                aria-label="Close moat agent"
                @click="closePanel"
              >
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </AppTooltip>
          </div>
        </header>

        <div
          class="grid gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 lg:grid-cols-[minmax(280px,1fr)_auto_auto_auto_auto]"
        >
          <label class="grid gap-1">
            <span
              class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400"
            >
              Agent URL
            </span>
            <AppTooltip
              text="Local server address. Keep this as 127.0.0.1:8788 unless you changed MOAT_AGENT_PORT."
              trigger-class="w-full"
            >
              <input
                v-model="agentUrl"
                class="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 shadow-sm focus:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                type="url"
                @blur="persistAgentUrl"
              />
            </AppTooltip>
          </label>

          <div class="grid gap-1">
            <span
              class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400"
            >
              Scope
            </span>
            <AppTooltip
              text="Portfolio researches the active portfolio. Filtered researches only rows matching the search box."
            >
              <div
                class="inline-grid h-10 grid-cols-2 rounded-md border border-zinc-300 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <button
                  type="button"
                  class="rounded px-3 text-xs font-bold transition"
                  :class="
                    scope === 'portfolio'
                      ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-white'
                      : 'text-zinc-500 dark:text-zinc-400'
                  "
                  @click="scope = 'portfolio'"
                >
                  Portfolio
                </button>
                <button
                  type="button"
                  class="rounded px-3 text-xs font-bold transition"
                  :class="
                    scope === 'filtered'
                      ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-white'
                      : 'text-zinc-500 dark:text-zinc-400'
                  "
                  @click="scope = 'filtered'"
                >
                  Filtered
                </button>
              </div>
            </AppTooltip>
          </div>

          <label class="grid gap-1">
            <span
              class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400"
            >
              News Freshness
            </span>
            <AppTooltip
              text="Limits optional Brave web/news results. SEC filings still use the latest annual and quarterly filing."
            >
              <select
                v-model.number="recencyDays"
                class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option :value="31">31 days</option>
                <option :value="180">180 days</option>
                <option :value="365">1 year</option>
              </select>
            </AppTooltip>
          </label>

          <label class="grid gap-1">
            <span
              class="text-[10px] font-semibold uppercase text-zinc-500 dark:text-zinc-400"
            >
              Limit
            </span>
            <AppTooltip
              text="Maximum number of stocks to research in this batch. Lower is faster and gentler on SEC/search APIs."
            >
              <select
                v-model.number="maxTickers"
                class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option :value="5">5</option>
                <option :value="10">10</option>
                <option :value="25">25</option>
                <option :value="50">50</option>
              </select>
            </AppTooltip>
          </label>

          <div class="flex items-end">
            <div class="flex items-center gap-2">
              <AppTooltip
                text="Starts a local research batch. Nothing is saved until you click Add note or Add all."
              >
                <button
                  type="button"
                  class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-300 bg-cyan-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-700 dark:bg-cyan-700 dark:hover:bg-cyan-600"
                  :disabled="!canResearch"
                  @click="runResearch"
                >
                  <LoaderCircle
                    v-if="loading"
                    class="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  <Sparkles v-else class="h-4 w-4" aria-hidden="true" />
                  Research
                </button>
              </AppTooltip>
            </div>
          </div>
        </div>

        <div
          class="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            AI moat research can be incomplete or wrong. Treat ratings and notes
            as a starting point, check the sources, and do not use them as
            investment advice.
          </span>
        </div>

        <div
          v-if="error"
          class="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          <AlertTriangle class="h-4 w-4 shrink-0" aria-hidden="true" />
          {{ error }}
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <div
            v-if="results.length === 0"
            class="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 text-sm font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          >
            <span>{{
              loading ? "Research running..." : "No research yet"
            }}</span>
            <span
              v-if="loading"
              class="text-xs font-medium text-zinc-400 dark:text-zinc-500"
            >
              Smaller batches finish faster. The request will stop if the local
              agent stalls.
            </span>
          </div>

          <div v-else class="grid gap-3">
            <article
              v-for="result in results"
              :key="result.ticker"
              class="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3
                      class="text-base font-black text-zinc-950 dark:text-white"
                    >
                      {{ result.ticker }}
                    </h3>
                    <span
                      class="rounded-md border px-2 py-1 text-xs font-bold"
                      :class="moatTone(result.moat)"
                    >
                      {{ result.moat }}
                    </span>
                    <span
                      class="rounded-md border px-2 py-1 text-xs font-bold"
                      :class="statusTone(result.status)"
                    >
                      {{ result.confidence }}
                    </span>
                    <span
                      class="text-xs font-semibold text-zinc-500 dark:text-zinc-400"
                    >
                      {{ formatDateTime(result.researchedAt) }}
                    </span>
                  </div>
                  <p
                    class="mt-2 text-sm font-medium leading-6 text-zinc-700 dark:text-zinc-200"
                  >
                    {{ result.summary }}
                  </p>
                </div>

                <button
                  type="button"
                  class="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
                  :disabled="
                    saving ||
                    result.status === 'error' ||
                    isApplied(result.ticker)
                  "
                  @click="applyResult(result)"
                >
                  <LoaderCircle
                    v-if="saving"
                    class="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  <Check v-else class="h-4 w-4" aria-hidden="true" />
                  {{ isApplied(result.ticker) ? "Added" : "Add note" }}
                </button>
              </div>

              <div
                class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.65fr)]"
              >
                <div>
                  <div
                    class="text-[10px] font-black uppercase text-zinc-500 dark:text-zinc-400"
                  >
                    Key notes
                  </div>
                  <div class="mt-2 grid gap-2 md:grid-cols-2">
                    <div
                      v-for="point in keyPointsForResult(result)"
                      :key="point"
                      class="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                    >
                      {{ point }}
                    </div>
                  </div>
                </div>

                <div class="grid content-start gap-3">
                  <div v-if="result.risks.length > 0">
                    <div
                      class="text-[10px] font-black uppercase text-zinc-500 dark:text-zinc-400"
                    >
                      Watch
                    </div>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <span
                        v-for="risk in result.risks"
                        :key="risk"
                        class="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                      >
                        {{ risk }}
                      </span>
                    </div>
                  </div>

                  <div v-if="result.sources.length > 0">
                    <div
                      class="text-[10px] font-black uppercase text-zinc-500 dark:text-zinc-400"
                    >
                      Sources
                    </div>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <a
                        v-for="source in result.sources.slice(0, 5)"
                        :key="source.url"
                        class="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/40 dark:hover:text-cyan-200"
                        :href="source.url"
                        target="_blank"
                        rel="noreferrer"
                        :title="source.title"
                      >
                        <FileText
                          class="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span class="truncate">{{ sourceTitle(source) }}</span>
                        <span class="shrink-0 text-zinc-400">{{
                          sourceLabel(source)
                        }}</span>
                        <ExternalLink
                          class="h-3.5 w-3.5 shrink-0 text-zinc-400"
                          aria-hidden="true"
                        />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="result.warnings.length > 0"
                class="mt-3 grid gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
              >
                <div
                  v-for="warning in result.warnings"
                  :key="warning"
                  class="flex items-start gap-1.5"
                >
                  <AlertTriangle
                    class="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{{ warning }}</span>
                </div>
              </div>
            </article>
          </div>
        </div>

        <footer
          class="flex items-center justify-between gap-4 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800"
        >
          <div class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {{
              researchedAt ? `Batch ${formatDateTime(researchedAt)}` : "Ready"
            }}
          </div>
          <button
            type="button"
            class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
            :disabled="saving || successfulResults.length === 0"
            @click="applyAll"
          >
            <LoaderCircle
              v-if="saving"
              class="h-4 w-4 animate-spin"
              aria-hidden="true"
            />
            <Check v-else class="h-4 w-4" aria-hidden="true" />
            {{ saving ? "Saving" : "Add all" }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
