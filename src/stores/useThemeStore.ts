import { computed, ref } from "vue";
import { defineStore } from "pinia";

type Theme = "light" | "dark";

const STORAGE_KEY = "equity-fortress:theme";

function initialTheme(): Theme {
  const persisted = window.localStorage.getItem(STORAGE_KEY);
  if (persisted === "light" || persisted === "dark") {
    return persisted;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.documentElement.dataset.theme = theme;
}

export const useThemeStore = defineStore("theme", () => {
  const theme = ref<Theme>(initialTheme());
  applyTheme(theme.value);

  const isDark = computed(() => theme.value === "dark");

  function setTheme(nextTheme: Theme): void {
    theme.value = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  function toggleTheme(): void {
    setTheme(theme.value === "dark" ? "light" : "dark");
  }

  return {
    theme,
    isDark,
    toggleTheme,
    setTheme,
  };
});
