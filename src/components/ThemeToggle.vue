<script setup lang="ts">
import { Moon, Sun } from "@lucide/vue";

import { useThemeStore } from "@/stores/useThemeStore";

const themeStore = useThemeStore();
</script>

<template>
  <button
    type="button"
    class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
    :title="themeStore.isDark ? 'Light theme' : 'Dark theme'"
    @click="themeStore.toggleTheme"
  >
    <Sun v-if="themeStore.isDark" class="h-4 w-4" aria-hidden="true" />
    <Moon v-else class="h-4 w-4" aria-hidden="true" />
  </button>
</template>
