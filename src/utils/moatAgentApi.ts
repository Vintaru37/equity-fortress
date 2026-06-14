import type {
  MoatAgentHealth,
  MoatAgentRequest,
  MoatAgentResponse,
} from "@/types/moatAgent";

export const DEFAULT_MOAT_AGENT_URL =
  import.meta.env.VITE_MOAT_AGENT_URL || "http://127.0.0.1:8788";
const DEFAULT_RESEARCH_TIMEOUT_MS = 120000;

interface ErrorBody {
  error?: string;
}

export async function getMoatAgentHealth(
  agentUrl: string,
): Promise<MoatAgentHealth> {
  const response = await fetch(`${cleanAgentUrl(agentUrl)}/health`);
  return await parseResponse<MoatAgentHealth>(response);
}

export async function researchMoats(
  agentUrl: string,
  request: MoatAgentRequest,
): Promise<MoatAgentResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    DEFAULT_RESEARCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${cleanAgentUrl(agentUrl)}/research/moats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    return await parseResponse<MoatAgentResponse>(response);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function cleanAgentUrl(agentUrl: string): string {
  return agentUrl.trim().replace(/\/+$/, "");
}

async function parseResponse<TResponse>(response: Response): Promise<TResponse> {
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) as TResponse & ErrorBody : null;

  if (!response.ok) {
    throw new Error(body?.error ?? `Moat agent request failed (${response.status})`);
  }

  if (!body) {
    throw new Error("Moat agent returned an empty response");
  }

  return body;
}
