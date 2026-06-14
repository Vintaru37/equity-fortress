# Equity Fortress

Equity Fortress to dashboard inwestycyjny z frontem w Vue 3 oraz backendem na
Supabase Edge Functions. Frontend komunikuje sie wylacznie z Edge Functions.
Dane rynkowe sa pobierane po stronie backendu przez `yahoo-finance2`.

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
- yahoo-finance2 / Yahoo Finance

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

Testy kalkulacji w Edge Functions:

```bash
npm run test:edge
```

Ten skrypt wymaga lokalnie zainstalowanego Deno, czyli runtime TypeScript/JavaScript
uzywanego przez Supabase Edge Functions.

## Zmienne frontendowe

Utworz `.env` na podstawie `.env.example`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Frontend uzywa tych wartosci do wywolywania:

- `/functions/v1/get-stock`
- `/functions/v1/get-stocks-batch`

Nie ma klienta danych rynkowych po stronie UI.

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
- `Refresh` wykonuje pelne odswiezenie cen, fundamentow, estimates, consensus
  oraz historical prices

`MOAT` i `Notes` sa zapisywane lokalnie w `localStorage`. Dane rynkowe sa
pobierane tylko przez Supabase Edge Functions.

### Refresh

`Refresh` pobiera quote/profile, fundamenty, ratios, estimates oraz historical
prices dla wszystkich widocznych tickerow. Refresh pojedynczego wiersza uzywa
tej samej pelnej sciezki odswiezania dla wybranej spolki.

Pierwsze zaladowanie aplikacji tez wysyla `refreshScope: "full"`, zeby ekran
nie ocenial spolek na podstawie starego cache. Cache w Supabase zostaje jako
magazyn i awaryjne zrodlo, gdy provider zwroci blad.

Pelny refresh buduje payload od zera. Jesli Yahoo nie zwroci ktorejs grupy
danych, ta grupa nie jest uzupelniana starym cache, tylko trafia do score jako
brakujaca metryka.

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

Backend nie wymaga klucza API do danych rynkowych. Funkcje uzywaja
`yahoo-finance2` po stronie Edge Functions.

Funkcje uzywaja `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`. Supabase zwykle
udostepnia je w runtime funkcji; dla lokalnego `supabase functions serve` ustaw
je w lokalnym srodowisku albo jako sekrety projektu.

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

Cache danych rynkowych i logi maja wlaczone RLS bez publicznych polityk. Sa
obslugiwane przez Edge Functions na service role. `watchlist_stocks` ma polityki CRUD dla
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

Jezeli odpowiednia czesc cache jest swieza, funkcja nie odpytuje Yahoo dla tej
grupy danych. Batch endpoint jest cache-first: jesli dane juz sa w Supabase,
frontend dostaje cache bez odpytywania Yahoo.

Pelny refresh (`refreshScope: "full"` lub `forceRefresh: true`) jest drozszy i
powinien byc uzywany glownie przy dodawaniu nowego tickera albo recznym
uzupelnianiu danych.

## Obliczenia i fallbacki

Jesli Yahoo nie zwroci gotowego pola, backend liczy je tylko wtedy, gdy ma
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

## Moduly Yahoo

Funkcje uzywaja `yahoo-finance2` importowanego z JSR:

- `quote`
- `historical`
- `fundamentalsTimeSeries`
- `quoteSummary`

`quote` obsluguje szybkie odswiezanie cen, `historical` zasila wykres i
performance, `fundamentalsTimeSeries` zasila raporty finansowe, a
`quoteSummary` uzupelnia ratios, estimates i consensus.

## Score

Score jest liczony w skali 0-100:

- ROCE: 20 pkt
- Gross margin: 7.5 pkt
- Operating margin: 7.5 pkt
- EPS + Revenue growth: 15 pkt (10/5)
- FCF margin: 10 pkt
- MOAT: 15 pkt (`Unknown` daje 3 pkt)
- Valuation, preferowane PEG albo fallback P/E: 10 pkt
- Debt management: 10 pkt, preferuje Net Debt/EBITDA, fallback Debt/Equity
- Analyst consensus: 5 pkt

Kazdy czynnik daje maksymalnie tyle punktow, ile wynosi jego waga. Brakujace
metryki od providera daja 30% swojej maksymalnej wagi, zeby score nie karal
zbyt mocno za niekompletne dane Yahoo, ale nadal byl konserwatywny.

Red flags odejmuja punkty po score bazowym: kara za dlug tylko gdy
Debt/Equity > 2 i Net Debt/EBITDA > 3 jednoczesnie; osobno ujemny FCF przez
2 ostatnie lata. Tabela pokazuje tez krotki kontekst sektorowy: roznice
score'u wzgledem sredniej spolek z tego samego sektora w watchliscie.
