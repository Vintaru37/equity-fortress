# Stock API Schema

Equity Fortress exposes two Supabase Edge Functions to the frontend:

- `get-stock`: returns one `StockData` object.
- `get-stocks-batch`: returns `StockData[]`.

Both functions return the same normalized per-stock schema. The frontend does
not consume raw Yahoo Finance payloads directly.

## Request Shapes

### `get-stock`

```json
{
  "ticker": "MSFT",
  "forceRefresh": false,
  "refreshScope": "quote"
}
```

`refreshScope` can be:

- `quote`: refresh quote/current price only.
- `full`: refresh quote, fundamentals, estimates, consensus, and historical prices.
- `null` or omitted: use cache when fresh.

The frontend uses `full` on initial load and on the main `Refresh` action. A
full refresh rebuilds the payload from fresh Yahoo responses instead of filling
failed sections from old cache.

### `get-stocks-batch`

```json
{
  "tickers": ["MSFT", "META", "GOOGL"],
  "refreshScope": "quote"
}
```

The backend normalizes, deduplicates, and caps the ticker list at 25 symbols.

## Response Shape

```ts
interface StockData {
  ticker: string;
  company: string | null;
  currentPrice: number | null;
  oneYearChart: Array<{ date: string; close: number }>;
  performance1W: number | null;
  performance1Y: number | null;
  performance3Y: number | null;
  performance5Y: number | null;
  analystConsensus: string | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  roce: number | null;
  fcfMargin: number | null;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  netDebtToEbitda: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  debtToEquity: number | null;
  beta: number | null;
  sector: string | null;
  industry: string | null;
  moat: "Excellent" | "Good" | "Average" | "Bad" | "Unknown";
  redFlags: string[];
  scorePenalty: number;
  score: number | null;
  lastUpdated: string | null;
}
```

## Field Sources

| Field | Type | Source | Notes |
| --- | --- | --- | --- |
| `ticker` | `string` | Request | Normalized uppercase ticker. |
| `company` | `string \| null` | Yahoo `quote` / `quoteSummary.price` | Uses long/short company name when available. |
| `currentPrice` | `number \| null` | Yahoo `quote` / `quoteSummary.financialData` | Current, regular, post-market, or pre-market price fallback. |
| `oneYearChart` | `{ date, close }[]` | Calculated from Yahoo `historical` | Last year of daily close points. |
| `performance1W` | `number \| null` | Calculated | Percent change from close at or before 7 days before latest historical close. |
| `performance1Y` | `number \| null` | Calculated | Percent change from close at or before 365 days before latest historical close. |
| `performance3Y` | `number \| null` | Calculated | Percent change from close at or before 3 years before latest historical close. |
| `performance5Y` | `number \| null` | Calculated | Percent change from close at or before 5 years before latest historical close. |
| `analystConsensus` | `string \| null` | Yahoo `quoteSummary.financialData` / `recommendationTrend` | Uses explicit recommendation key first, otherwise winner among recommendation buckets. |
| `grossMargin` | `number \| null` | Calculated, fallback Yahoo ratio | `Gross Profit / Revenue * 100`; fallback from Yahoo gross margin ratio. |
| `operatingMargin` | `number \| null` | Calculated, fallback Yahoo ratio | `Operating Income / Revenue * 100`; fallback from Yahoo operating margin ratio. |
| `roce` | `number \| null` | Calculated | `EBIT / (Total Assets - Total Current Liabilities) * 100`. |
| `fcfMargin` | `number \| null` | Calculated, fallback Yahoo ratio | `Free Cash Flow / Revenue * 100`; FCF can fall back to `Operating Cash Flow - Capex`. |
| `pe` | `number \| null` | Yahoo ratio, fallback calculated | Yahoo trailing P/E first; fallback `Current Price / positive EPS TTM`. |
| `forwardPe` | `number \| null` | Calculated, fallback Yahoo ratio | `Current Price / positive next-year estimated EPS`; fallback Yahoo forward P/E. |
| `peg` | `number \| null` | Yahoo ratio, fallback calculated | Yahoo PEG first; fallback `positive P/E / positive EPS growth percentage`. |
| `netDebtToEbitda` | `number \| null` | Calculated | `(Total Debt - Cash) / positive EBITDA`; preferred debt-management score input. |
| `revenueGrowth` | `number \| null` | Calculated, fallback Yahoo ratio | Latest annual revenue vs previous annual revenue. |
| `epsGrowth` | `number \| null` | Calculated, fallback Yahoo ratio | Latest annual EPS vs previous annual EPS; can fall back to forward EPS vs EPS TTM. |
| `debtToEquity` | `number \| null` | Calculated, fallback Yahoo ratio | `Total Debt / positive Total Equity`. |
| `beta` | `number \| null` | Yahoo `quote` / `quoteSummary` | Rounded to 2 decimals. |
| `sector` | `string \| null` | Yahoo `quoteSummary.assetProfile` | Used by the frontend for watchlist sector comparison. |
| `industry` | `string \| null` | Yahoo `quoteSummary.assetProfile` | Informational company classification. |
| `moat` | enum | Supabase `watchlist_stocks` | User/app-maintained field, not from Yahoo. |
| `redFlags` | `string[]` | Calculated | Severe leverage / cash-flow warnings used as score penalties. |
| `scorePenalty` | `number` | Calculated | Points subtracted after the base score, capped at 20. |
| `score` | `number \| null` | Calculated | 0-100 quality score from profitability, growth, valuation, and debt metrics. |
| `lastUpdated` | `string \| null` | Supabase cache timestamps | Latest quote/fundamentals/historical cache timestamp. |

All numeric display fields are rounded to 2 decimals.

## Calculated Fields

These fields are calculated by Equity Fortress:

- `oneYearChart`
- `performance1W`
- `performance1Y`
- `performance3Y`
- `performance5Y`
- `grossMargin`
- `operatingMargin`
- `roce`
- `fcfMargin`
- `pe` when Yahoo does not provide trailing P/E
- `forwardPe` when next-year EPS is available
- `peg` when Yahoo does not provide PEG
- `netDebtToEbitda`
- `revenueGrowth`
- `epsGrowth`
- `debtToEquity`
- `redFlags`
- `scorePenalty`
- `score`

## Score Formula

The score is a 0-100 weighted score:

| Factor | Weight |
| --- | ---: |
| ROCE | 20 |
| Gross margin | 7.5 |
| Operating margin | 7.5 |
| EPS growth + revenue growth | 15 |
| FCF margin | 10 |
| MOAT | 15 |
| Valuation, PEG preferred then P/E fallback | 10 |
| Debt management, Net Debt/EBITDA preferred then Debt/Equity fallback | 10 |
| Analyst consensus | 5 |

Each factor contributes up to its listed weight. Missing provider metrics
contribute 30% of their maximum weight, which avoids over-penalizing incomplete
Yahoo data while staying conservative. `MOAT: Unknown` contributes 3 points.
Red flags are deducted after the base score: debt penalty only when
`Debt/Equity > 2` and `Net Debt/EBITDA > 3` are both true; FCF negative for
the latest 2 annual periods is penalized separately.

## Cached Provider Payload

The backend stores normalized Yahoo data in `stock_metrics_cache.data_json`.
That internal cache payload can contain:

- `_meta.provider`: currently `yahoo-finance2`.
- `_meta.refreshedAt`: ISO timestamp for the last cache write.
- `_meta.schemaVersion`: cache schema/scoring generation. Older generations are ignored and refreshed.
- `profile`: normalized company/profile fields.
- `quote`: normalized quote fields.
- `historical`: normalized daily close history.
- `incomeStatements`: annual income statement records.
- `incomeStatementTtm`: trailing income statement record.
- `balanceSheets`: annual balance sheet records.
- `cashFlows`: annual cash flow records.
- `cashFlowTtm`: trailing cash flow record.
- `ratiosTtm`: normalized trailing ratios.
- `keyMetricsTtm`: normalized valuation/key metrics.
- `estimates`: normalized earnings estimate records.
- `gradesConsensus`: normalized analyst recommendation data.
- `endpointErrors`: partial provider errors from the last refresh, if any.

This cache shape is an internal backend detail. The frontend should rely on the
`StockData` response shape above.
