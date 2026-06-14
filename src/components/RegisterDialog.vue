<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { UserPlus, X } from "@lucide/vue";

import { useAuthStore } from "@/stores/useAuthStore";
import { useStocksStore } from "@/stores/useStocksStore";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const auth = useAuthStore();
const stocks = useStocksStore();
const email = ref("");
const password = ref("");
const validationError = ref<string | null>(null);

const feedback = computed(() =>
  validationError.value ?? auth.error ?? auth.message
);
const feedbackTone = computed(() =>
  validationError.value || auth.error
    ? "text-rose-600 dark:text-rose-300"
    : "text-emerald-600 dark:text-emerald-300"
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      validationError.value = null;
      auth.clearFeedback();
    }
  },
);

function close(): void {
  emit("close");
}

async function submit(): Promise<void> {
  if (!email.value.trim() || !password.value) {
    validationError.value = "Email and password are required";
    return;
  }

  validationError.value = null;
  const success = await auth.signUp(email.value, password.value);
  if (!success) {
    return;
  }

  if (!auth.isAuthenticated) {
    await auth.signIn(email.value, password.value);
  }

  if (auth.isAuthenticated) {
    password.value = "";
    await stocks.loadPortfolios();
    close();
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[220] flex items-center justify-center bg-zinc-950/45 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="register-dialog-title"
    @click.self="close"
  >
    <form
      class="w-full max-w-sm rounded-lg border border-zinc-200 bg-white shadow-dashboard dark:border-zinc-800 dark:bg-zinc-950"
      @submit.prevent="submit"
    >
      <div class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 id="register-dialog-title" class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          Register
        </h2>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
          aria-label="Close register"
          @click="close"
        >
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div class="grid gap-3 p-4">
        <input
          v-model="email"
          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          type="email"
          autocomplete="email"
          placeholder="Email"
          aria-label="Email"
          :disabled="auth.loading"
        />
        <input
          v-model="password"
          class="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 shadow-sm placeholder:text-zinc-400 focus:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          type="password"
          autocomplete="new-password"
          placeholder="Password"
          aria-label="Password"
          :disabled="auth.loading"
        />
        <p
          v-if="feedback"
          class="text-xs font-semibold"
          :class="feedbackTone"
        >
          {{ feedback }}
        </p>
        <button
          type="submit"
          class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
          :disabled="auth.loading"
        >
          <UserPlus class="h-4 w-4" aria-hidden="true" />
          Register
        </button>
      </div>
    </form>
  </div>
</template>
