create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.watchlist_stocks (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete cascade,
  ticker text not null,
  company text,
  moat text not null default 'Unknown',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchlist_stocks_moat_check check (
    moat in ('Excellent', 'Good', 'Average', 'Bad', 'Unknown')
  ),
  constraint watchlist_stocks_ticker_not_blank check (length(trim(ticker)) > 0)
);

create index if not exists watchlist_stocks_user_id_idx
  on public.watchlist_stocks (user_id);

create index if not exists watchlist_stocks_ticker_idx
  on public.watchlist_stocks (ticker);

drop trigger if exists set_watchlist_stocks_updated_at on public.watchlist_stocks;
create trigger set_watchlist_stocks_updated_at
before update on public.watchlist_stocks
for each row
execute function public.set_updated_at();

alter table public.watchlist_stocks enable row level security;

drop policy if exists "Users can read their watchlist stocks" on public.watchlist_stocks;
create policy "Users can read their watchlist stocks"
on public.watchlist_stocks
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert their watchlist stocks" on public.watchlist_stocks;
create policy "Users can insert their watchlist stocks"
on public.watchlist_stocks
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their watchlist stocks" on public.watchlist_stocks;
create policy "Users can update their watchlist stocks"
on public.watchlist_stocks
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their watchlist stocks" on public.watchlist_stocks;
create policy "Users can delete their watchlist stocks"
on public.watchlist_stocks
for delete
to authenticated
using (user_id = auth.uid());

create table if not exists public.stock_metrics_cache (
  ticker text primary key,
  data_json jsonb not null default '{}'::jsonb,
  quote_updated_at timestamptz,
  fundamentals_updated_at timestamptz,
  historical_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_metrics_cache_ticker_not_blank check (length(trim(ticker)) > 0)
);

drop trigger if exists set_stock_metrics_cache_updated_at on public.stock_metrics_cache;
create trigger set_stock_metrics_cache_updated_at
before update on public.stock_metrics_cache
for each row
execute function public.set_updated_at();

alter table public.stock_metrics_cache enable row level security;

create table if not exists public.refresh_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  ticker text,
  status text not null,
  message text,
  created_at timestamptz not null default now(),
  constraint refresh_logs_status_not_blank check (length(trim(status)) > 0)
);

create index if not exists refresh_logs_ticker_created_at_idx
  on public.refresh_logs (ticker, created_at desc);

alter table public.refresh_logs enable row level security;
