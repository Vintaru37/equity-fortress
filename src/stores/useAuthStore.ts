import { computed, ref } from "vue";
import { defineStore } from "pinia";

import { supabaseRequest } from "@/utils/supabaseApi";

const STORAGE_KEY = "equity-fortress:auth-session";
const REFRESH_WINDOW_MS = 60_000;

interface SupabaseAuthUser {
  id: string;
  email?: string;
}

interface SupabaseAuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: SupabaseAuthUser | null;
}

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SupabaseAuthUser;
}

function readSession(): AuthSession | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.accessToken === "string" &&
      typeof parsed.refreshToken === "string" &&
      typeof parsed.expiresAt === "number" &&
      parsed.user &&
      typeof parsed.user.id === "string"
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
        user: parsed.user,
      };
    }
  } catch (_error) {
    // Ignore invalid local sessions and start signed out.
  }

  return null;
}

function toSession(response: SupabaseAuthResponse): AuthSession | null {
  if (
    !response.access_token ||
    !response.refresh_token ||
    !response.expires_in ||
    !response.user?.id
  ) {
    return null;
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    user: response.user,
  };
}

export const useAuthStore = defineStore("auth", () => {
  const session = ref<AuthSession | null>(readSession());
  const loading = ref(false);
  const error = ref<string | null>(null);
  const message = ref<string | null>(null);

  const isAuthenticated = computed(() => session.value !== null);
  const userEmail = computed(() => session.value?.user.email ?? null);
  const userId = computed(() => session.value?.user.id ?? null);

  function setSession(nextSession: AuthSession | null): void {
    session.value = nextSession;

    if (nextSession) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    message.value = null;

    try {
      const response = await supabaseRequest<SupabaseAuthResponse>(
        "auth/v1/token?grant_type=password",
        {
          method: "POST",
          body: {
            email: email.trim(),
            password,
          },
        },
      );
      const nextSession = toSession(response);
      if (!nextSession) {
        throw new Error("Supabase did not return a session");
      }

      setSession(nextSession);
      message.value = "Signed in";
      return true;
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Sign in failed";
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function signUp(email: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    message.value = null;

    try {
      const response = await supabaseRequest<SupabaseAuthResponse>(
        "auth/v1/signup",
        {
          method: "POST",
          body: {
            email: email.trim(),
            password,
          },
        },
      );
      const nextSession = toSession(response);

      if (nextSession) {
        setSession(nextSession);
        message.value = "Account created";
      } else {
        message.value = "Check your email to confirm the account";
      }

      return true;
    } catch (requestError) {
      error.value = requestError instanceof Error
        ? requestError.message
        : "Registration failed";
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function refreshSessionIfNeeded(force = false): Promise<string | null> {
    const currentSession = session.value;
    if (!currentSession) {
      return null;
    }

    if (!force && currentSession.expiresAt > Date.now() + REFRESH_WINDOW_MS) {
      return currentSession.accessToken;
    }

    try {
      const response = await supabaseRequest<SupabaseAuthResponse>(
        "auth/v1/token?grant_type=refresh_token",
        {
          method: "POST",
          body: {
            refresh_token: currentSession.refreshToken,
          },
        },
      );
      const nextSession = toSession(response);
      if (!nextSession) {
        throw new Error("Supabase did not refresh the session");
      }

      setSession(nextSession);
      return nextSession.accessToken;
    } catch (_error) {
      setSession(null);
      return null;
    }
  }

  async function getValidAccessToken(): Promise<string | null> {
    return await refreshSessionIfNeeded();
  }

  async function signOut(): Promise<void> {
    const accessToken = session.value?.accessToken ?? null;
    setSession(null);
    error.value = null;
    message.value = null;

    if (!accessToken) {
      return;
    }

    try {
      await supabaseRequest<null>("auth/v1/logout", {
        method: "POST",
        accessToken,
      });
    } catch (_error) {
      // Local sign-out already happened; remote logout failures are harmless here.
    }
  }

  function clearFeedback(): void {
    error.value = null;
    message.value = null;
  }

  return {
    session,
    loading,
    error,
    message,
    isAuthenticated,
    userEmail,
    userId,
    signIn,
    signUp,
    signOut,
    clearFeedback,
    refreshSessionIfNeeded,
    getValidAccessToken,
  };
});
