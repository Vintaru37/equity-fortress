# Equity Fortress

Equity Fortress to dashboard inwestycyjny z frontem w Vue 3 oraz backendem na
Supabase Edge Functions. Dane rynkowe sa pobierane po stronie backendu przez
`yahoo-finance2`; logowanie i portfele korzystaja z Supabase Auth oraz REST.

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

## Lokalny Moat Agent

Mini agent do notatek MOAT dziala lokalnie, poza frontendem. Nie korzysta z
ChatGPT Plus ani platnego OpenAI API. Domyslnie pobiera najnowsze raporty SEC i
robi szybka, konserwatywna analize zrodel. Ollama jest opcjonalne i domyslnie
wylaczone, bo lokalne generowanie dla calego portfela potrafi byc wolne.
Brave Search jest opcjonalny i dziala tylko po dodaniu darmowego/limitowanego
klucza API.

1. Opcjonalnie zainstaluj Ollama i pobierz model:

```bash
ollama pull llama3.1:8b
```

2. Skopiuj konfiguracje agenta:

```bash
copy .env.agent.example .env.agent.local
```

W `.env.agent.local` ustaw `SEC_USER_AGENT` na nazwe/email kontaktowy. Jezeli
chcesz web search poza SEC, uzupelnij `BRAVE_SEARCH_API_KEY`. Jezeli chcesz
wlaczyc lokalny model mimo wolniejszego dzialania, ustaw:

```bash
MOAT_AGENT_USE_OLLAMA=true
```

3. Uruchom agenta w osobnym terminalu:

```bash
npm run agent
```

4. Uruchom frontend:

```bash
npm run dev
```

W aplikacji przycisk z ikona agenta otwiera panel researchu. Wyniki nie zapisuja
sie automatycznie: trzeba kliknac `Add note` albo `Add all`.

Windows/background helper:

```bash
npm run dev:host
```

Build produkcyjny:

```bash
npm run build
```

## Deploy na GitHub Pages

Projekt ma workflow `.github/workflows/deploy-pages.yml`, ktory buduje aplikacje
i publikuje katalog `dist` na GitHub Pages po pushu do `main`.

1. W GitHub repo wejdz w `Settings -> Pages` i ustaw `Source` na
   `GitHub Actions`.
2. W `Settings -> Secrets and variables -> Actions` dodaj:
   - variable `VITE_SUPABASE_URL`
   - secret `VITE_SUPABASE_ANON_KEY`
3. W Supabase Auth dodaj URL aplikacji do dozwolonych redirect/site URLs:
   `https://vintaru37.github.io/equity-fortress/`
4. Commitnij zmiany i wypchnij je na `main`:

```bash
git add .github/workflows/deploy-pages.yml vite.config.ts
git commit -m "Add GitHub Pages deployment"
git push origin main
```

Po zakonczeniu workflow aplikacja bedzie pod adresem:

```bash
https://vintaru37.github.io/equity-fortress/
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

Frontend uzywa tych wartosci do:

- `/functions/v1/get-stock`
- `/functions/v1/get-stocks-batch`
- Supabase Auth
- Supabase REST dla portfeli i watchlisty

Nie ma klienta danych rynkowych po stronie UI.

## Funkcje UI

- domyslny portfel z kuratorowana lista startowa 50 tickerow
- logowanie i rejestracja przez Supabase Auth
- tworzenie nowych pustych portfeli dla zalogowanego uzytkownika
- przelaczanie, zmiana nazwy i usuwanie portfeli
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

`MOAT` i `Notes` sa zapisywane w Supabase dla zalogowanego uzytkownika, a w
`localStorage` w trybie niezalogowanym. Dane rynkowe sa pobierane tylko przez
Supabase Edge Functions.

Domyslne 50 tickerow to statyczna lista startowa, a nie ranking pobrany z
Yahoo. Yahoo-backed Edge Functions pobieraja dane dla podanych tickerow, a
ranking/score liczy aplikacja po zaladowaniu danych.

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
- `src/components/AuthControls.vue`
- `src/components/LoginDialog.vue`
- `src/components/RegisterDialog.vue`
- `src/components/PortfolioControls.vue`
- `src/components/PortfolioManageDialog.vue`
- `src/components/AddTickerForm.vue`
- `src/components/SparklineChart.vue`
- `src/components/MetricBadge.vue`
- `src/components/RefreshButton.vue`
- `src/components/MoatSelect.vue`
- `src/components/StockNotes.vue`

Store:

- `src/stores/useStocksStore.ts`
- `src/stores/useAuthStore.ts`

Typy i utilsy:

- `src/types/stock.ts`
- `src/utils/formatters.ts`
- `src/utils/supabaseApi.ts`

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
- `portfolios`
- `stock_metrics_cache`
- `refresh_logs`

Dozwolone wartosci `watchlist_stocks.moat`:

- `Excellent`
- `Good`
- `Average`
- `Bad`
- `Unknown`

Cache danych rynkowych i logi maja wlaczone RLS bez publicznych polityk. Sa
obslugiwane przez Edge Functions na service role. `portfolios` i
`watchlist_stocks` maja polityki CRUD dla zalogowanego uzytkownika na jego
`user_id`.

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

Batch normalizuje i deduplikuje tickery oraz ogranicza pojedynczy request do
50 symboli. To nie jest limit wielkosci portfela: frontend dzieli wieksze
portfele na kolejne requesty po 50 tickerow. Jezeli jedna spolka ma problem,
funkcja zwroci dla niej obiekt z polami `null`, a pozostale tickery beda dalej
przetwarzane.

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
