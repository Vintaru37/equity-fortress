interface SupabaseConfig {
  url: string;
  anonKey: string;
}

interface SupabaseRequestOptions {
  method?: string;
  accessToken?: string | null;
  body?: unknown;
  prefer?: string;
  headers?: HeadersInit;
}

interface SupabaseErrorBody {
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
  details?: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL");
  }

  if (!anonKey) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY");
  }

  return {
    url: url.replace(/\/+$/, ""),
    anonKey,
  };
}

export function supabaseRestUrl(
  table: string,
  params: Record<string, string | number | boolean | null | undefined> = {},
): string {
  const config = getSupabaseConfig();
  const url = new URL(`${config.url}/rest/v1/${table}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function supabaseRequest<TResponse>(
  pathOrUrl: string,
  options: SupabaseRequestOptions = {},
): Promise<TResponse> {
  const config = getSupabaseConfig();
  const headers = new Headers(options.headers);
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${config.url}/${pathOrUrl.replace(/^\/+/, "")}`;

  headers.set("apikey", config.anonKey);
  headers.set("Authorization", `Bearer ${options.accessToken ?? config.anonKey}`);

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.prefer) {
    headers.set("Prefer", options.prefer);
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  const responseText = await response.text();
  if (!responseText || response.status === 204) {
    return null as TResponse;
  }

  return JSON.parse(responseText) as TResponse;
}

async function errorMessage(response: Response): Promise<string> {
  const fallback = `Supabase request failed (${response.status})`;

  try {
    const body = await response.json() as SupabaseErrorBody;
    return body.error_description ??
      body.message ??
      body.msg ??
      body.error ??
      body.details ??
      fallback;
  } catch (_error) {
    return fallback;
  }
}
