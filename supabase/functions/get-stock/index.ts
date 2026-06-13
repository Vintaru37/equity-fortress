import {
  emptyOptionsResponse,
  jsonResponse,
} from "../_shared/cors.ts";
import {
  loadStockData,
  normalizeTicker,
} from "../_shared/stock-service.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return emptyOptionsResponse();
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { ticker?: unknown; forceRefresh?: unknown; refreshScope?: unknown };
  try {
    body = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const ticker = normalizeTicker(body.ticker);
  if (!ticker) {
    return jsonResponse({ error: "ticker is required" }, 400);
  }

  try {
    const refreshScope = body.refreshScope === "quote" || body.refreshScope === "full"
      ? body.refreshScope
      : null;
    const stock = await loadStockData(ticker, {
      forceRefresh: body.forceRefresh === true,
      refreshScope,
      authorizationHeader: request.headers.get("Authorization"),
    });

    return jsonResponse(stock);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("get-stock failed", { ticker, message });
    return jsonResponse({ error: "Failed to load stock data" }, 500);
  }
});
