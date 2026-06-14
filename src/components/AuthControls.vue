<script setup lang="ts">
import { ref } from "vue";
import { LogIn, LogOut, UserPlus } from "@lucide/vue";

import LoginDialog from "@/components/LoginDialog.vue";
import RegisterDialog from "@/components/RegisterDialog.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import { useStocksStore } from "@/stores/useStocksStore";

const auth = useAuthStore();
const stocks = useStocksStore();
const showLogin = ref(false);
const showRegister = ref(false);

function openLogin(): void {
  showRegister.value = false;
  showLogin.value = true;
}

function openRegister(): void {
  showLogin.value = false;
  showRegister.value = true;
}

async function signOut(): Promise<void> {
  await auth.signOut();
  stocks.loadLocalPortfolio();
  await stocks.loadInitialStocks();
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-2">
    <div
      v-if="auth.isAuthenticated"
      class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <span class="max-w-56 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200">
        {{ auth.userEmail }}
      </span>
      <button
        type="button"
        class="inline-flex h-8 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
        :disabled="auth.loading"
        @click="signOut"
      >
        <LogOut class="h-4 w-4" aria-hidden="true" />
        Logout
      </button>
    </div>

    <template v-else>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 dark:bg-cyan-500 dark:text-zinc-950 dark:hover:bg-cyan-400"
        @click="openLogin"
      >
        <LogIn class="h-4 w-4" aria-hidden="true" />
        Login
      </button>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
        @click="openRegister"
      >
        <UserPlus class="h-4 w-4" aria-hidden="true" />
        Register
      </button>
    </template>

    <LoginDialog
      :open="showLogin"
      @close="showLogin = false"
    />
    <RegisterDialog
      :open="showRegister"
      @close="showRegister = false"
    />
  </div>
</template>
