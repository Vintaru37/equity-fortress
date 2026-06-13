# Equity Fortress

Equity Fortress to dashboard inwestycyjny z frontem w Vue 3 oraz backendem na
Supabase Edge Functions. Frontend komunikuje sie wylacznie z Edge Functions.
Financial Modeling Prep API nie jest wolane bezposrednio z przegladarki.

## Stack

- Vue 3
- TypeScript
- Vite
- Pinia
- Tailwind
- TanStack Table
- ECharts
- Supabase
- Supabase Edge Functions
- Postgres
- Financial Modeling Prep API

## Uruchomienie frontendu

```bash
npm install
npm run dev
```

Domyslny adres Vite:

```bash
http://localhost:5173
```

Windows/background helper:

```bash
npm run dev:host
```

Build produkcyjny:

```bash
npm run build
```

## Zmienne frontendowe

Utworz `.env` na podstawie `.env.example`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Frontend uzywa tych wartosci do wywolywania:

- `/functions/v1/get-stock`
- `/functions/v1/get-stocks-batch`

Nie ma klienta FMP po stronie UI.

## Funkcje UI

- startowa lista tickerow: `MSFT`, `META`, `GOOGL`, `AMZN`, `AVGO`, `CEG`,
  `RKLB`, `ASTS`, `NVDA`, `MU`
- sortowanie po kazdej kolumnie
- wybor widocznych kolumn przez checkboxy i zmiana kolejnosci kolumn
- filtrowanie po tickerze i nazwie spolki
- dodawanie i usuwanie tickerow
- refresh jednej spolki
- refresh wszystkich spolek
- sticky header
- loading state
- error state
- last updated
- brakujace dane jako `N/A`
- edycja `MOAT`: `Excellent`, `Good`, `Average`, `Bad`, `Unknown`
- notatki per spolka
- dark/light theme
- budget-friendly refresh: `Refresh All` odswieza quote'y jednym batch requestem

`MOAT` i `Notes` sa zapisywane lokalnie w `localStorage`. Dane rynkowe sa
pobierane tylko przez Supabase Edge Functions.

### Refresh All vs Full Sync

- `Refresh All` jest tanie: odswieza tylko aktualne quote'y przez batch request.
- `Full Sync` jest drogie: pobiera quote/profile, fundamenty, ratios, estimates
  oraz historical prices dla wszystkich widocznych tickerow.
- Refresh pojedynczego wiersza jest automatyczny: jesli wiersz ma prawie same
  `N/A`, zrobi full fetch; jesli dane juz sa kompletne, odswiezy tylko quote.

## Komponenty frontendu

- `src/components/StockTable.vue`
- `src/components/StockRow.vue`
- `src/components/AddTickerForm.vue`
- `src/components/SparklineChart.vue`
- `src/components/MetricBadge.vue`
- `src/components/RefreshButton.vue`
- `src/components/MoatSelect.vue`
- `src/components/StockNotes.vue`

Store:

- `src/stores/useStocksStore.ts`

Typy i utilsy:

- `src/types/stock.ts`
- `src/utils/formatters.ts`

## Sekrety Supabase

```bash
supabase secrets set FMP_API_KEY=...
supabase secrets set FMP_BASE_URL=https://financialmodelingprep.com
```

Funkcje uzywaja tez `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`. Supabase
zwykle udostepnia je w runtime funkcji; dla lokalnego `supabase functions serve`
ustaw je w lokalnym srodowisku albo jako sekrety projektu.

## Baza danych

Migracja:

```bash
supabase db push
```

Tworzone tabele:

- `watchlist_stocks`
- `stock_metrics_cache`
- `refresh_logs`

Dozwolone wartosci `watchlist_stocks.moat`:

- `Excellent`
- `Good`
- `Average`
- `Bad`
- `Unknown`

Cache FMP i logi maja wlaczone RLS bez publicznych polityk. Sa obslugiwane przez
Edge Functions na service role. `watchlist_stocks` ma polityki CRUD dla
zalogowanego uzytkownika na jego `user_id`.

## Edge Functions

Deploy:

```bash
supabase functions deploy get-stock
supabase functions deploy get-stocks-batch
```

### `get-stock`

Input:

```json
{
  "ticker": "MSFT",
  "forceRefresh": false
}
```

Output: `StockData`.

### `get-stocks-batch`

Input:

```json
{
  "tickers": ["MSFT", "META", "GOOGL"]
}
```

Output: `StockData[]`.

Batch normalizuje i deduplikuje tickery oraz ogranicza request do 25 symboli.
Jezeli jedna spolka ma problem, funkcja zwroci dla niej obiekt z polami `null`,
a pozostale tickery beda dalej przetwarzane.

## Cache

- Quote/profile/current price: 6 godzin
- Fundamentals: 7 dni
- Historical prices: 7 dni

Jezeli odpowiednia czesc cache jest swieza, funkcja nie odpytuje FMP dla tej
grupy danych. Batch endpoint jest cache-first: jesli dane juz sa w Supabase,
frontend dostaje cache bez odpytywania FMP. `refreshScope: "quote"` odswieza
ceny przez `/stable/batch-quote`, co dla calej tabeli kosztuje jeden request
FMP.

Pelny refresh (`refreshScope: "full"` lub `forceRefresh: true`) jest drozszy i
powinien byc uzywany glownie przy dodawaniu nowego tickera albo recznym
uzupelnianiu danych.

## Obliczenia i fallbacki

Jesli FMP nie zwroci gotowego pola, backend liczy je tylko wtedy, gdy ma
wystarczajace pola z raportow:

- ROCE = EBIT / (Total Assets - Total Current Liabilities)
- FCF margin = Free Cash Flow / Revenue, z fallbackiem CFO - Capex
- Gross margin = Gross Profit / Revenue
- Operating margin = Operating Income / Revenue
- P/E = Current Price / positive EPS TTM
- Forward P/E = Current Price / positive estimated next year EPS
- PEG = positive P/E / positive EPS growth percentage
- Debt/Equity = Total Debt / positive Total Equity

Backend nie wypelnia metryk przyblizeniami, ktore zmieniaja znaczenie wskaznika.
Na przyklad total liabilities nie sa traktowane jako total debt.

## Endpointy FMP

Funkcje uzywaja endpointow `/stable`:

- `/stable/profile`
- `/stable/quote`
- `/stable/batch-quote`
- `/stable/historical-price-eod/full`
- `/stable/income-statement`
- `/stable/income-statement-growth`
- `/stable/balance-sheet-statement`
- `/stable/cash-flow-statement`
- `/stable/ratios-ttm`
- `/stable/key-metrics-ttm`
- `/stable/analyst-estimates`
- `/stable/grades-consensus`

Klucz FMP jest wysylany w naglowku `apikey`, nie w URL.

## Score

Score jest liczony w skali 0-100. Najwieksza wage ma ROCE, bo dashboard ma
premiowac kapitalowo efektywne spolki jakosciowe:

- ROCE: 35 pkt
- Operating margin: 15 pkt
- FCF margin: 15 pkt
- Gross margin: 10 pkt
- Revenue growth: 5 pkt
- EPS growth: 5 pkt
- Valuation, preferowane PEG albo fallback P/E: 10 pkt
- Debt/Equity: 5 pkt

Brakujace dane nie zeruja spolki automatycznie. Missing metrics dostaja
neutralny kredyt, zeby darmowy plan API nie karal nadmiernie firm, dla ktorych
FMP nie oddal kompletu pol.
