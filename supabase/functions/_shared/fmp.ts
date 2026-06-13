export class FmpError extends Error {
  endpoint: string;
  status?: number;

  constructor(endpoint: string, message: string, status?: number) {
    super(message);
    this.name = "FmpError";
    this.endpoint = endpoint;
    this.status = status;
  }
}

export interface FmpRequest {
  endpoint: string;
  params?: Record<string, string | number | boolean | null | undefined>;
}

export async function fetchFmpJson<T = unknown>(
  request: FmpRequest,
): Promise<T> {
  const apiKey = Deno.env.get("FMP_API_KEY");
  if (!apiKey) {
    throw new FmpError(request.endpoint, "FMP_API_KEY is not configured");
  }

  const baseUrl = (Deno.env.get("FMP_BASE_URL") ??
    "https://financialmodelingprep.com").replace(/\/+$/, "");
  const url = new URL(request.endpoint, `${baseUrl}/`);

  for (const [key, value] of Object.entries(request.params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      apikey: apiKey,
    },
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new FmpError(
      request.endpoint,
      `FMP ${response.status}: ${bodyText.slice(0, 300)}`,
      response.status,
    );
  }

  let json: unknown;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch (_error) {
    throw new FmpError(
      request.endpoint,
      `FMP returned non-JSON response: ${bodyText.slice(0, 300)}`,
      response.status,
    );
  }

  if (
    json &&
    typeof json === "object" &&
    ("Error Message" in json || "error" in json)
  ) {
    const message = String(
      (json as Record<string, unknown>)["Error Message"] ??
        (json as Record<string, unknown>).error,
    );
    throw new FmpError(request.endpoint, message, response.status);
  }

  return json as T;
}
