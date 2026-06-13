import {
  emptyOptionsResponse,
  jsonResponse,
} from "../_shared/cors.ts";
import {
  loadStocksBatchData,
  normalizeTickerList,
} from "../_shared/stock-service.ts";

const MAX_BATCH_TICKERS = 25;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return emptyOptionsResponse();
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { tickers?: unknown; refreshScope?: unknown };
  try {
    body = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const tickers = normalizeTickerList(body.tickers, MAX_BATCH_TICKERS);
  if (tickers.length === 0) {
    return jsonResponse({ error: "tickers must include at least one valid ticker" }, 400);
  }

  const authorizationHeader = request.headers.get("Authorization");
  const refreshScope = body.refreshScope === "quote" || body.refreshScope === "full"
    ? body.refreshScope
    : null;

  const stocks = await loadStocksBatchData(tickers, {
    authorizationHeader,
    preferCache: refreshScope !== "full",
    cacheOnly: refreshScope !== "full" && refreshScope !== "quote",
    forceRefresh: refreshScope === "full",
    refreshScope,
  });

  return jsonResponse(stocks);
});
