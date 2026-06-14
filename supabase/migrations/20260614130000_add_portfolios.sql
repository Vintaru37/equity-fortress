create table if not exists public.portfolios (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolios_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists portfolios_user_id_idx
  on public.portfolios (user_id);

create unique index if not exists portfolios_user_default_uidx
  on public.portfolios (user_id)
  where is_default;

drop trigger if exists set_portfolios_updated_at on public.portfolios;
create trigger set_portfolios_updated_at
before update on public.portfolios
for each row
execute function public.set_updated_at();

alter table public.portfolios enable row level security;

drop policy if exists "Users can read their portfolios" on public.portfolios;
create policy "Users can read their portfolios"
on public.portfolios
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert their portfolios" on public.portfolios;
create policy "Users can insert their portfolios"
on public.portfolios
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their portfolios" on public.portfolios;
create policy "Users can update their portfolios"
on public.portfolios
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their portfolios" on public.portfolios;
create policy "Users can delete their portfolios"
on public.portfolios
for delete
to authenticated
using (user_id = auth.uid());

alter table public.watchlist_stocks
add column if not exists portfolio_id uuid null references public.portfolios(id) on delete cascade;

update public.watchlist_stocks
set ticker = upper(trim(ticker))
where ticker <> upper(trim(ticker));

create index if not exists watchlist_stocks_portfolio_id_idx
  on public.watchlist_stocks (portfolio_id);

create unique index if not exists watchlist_stocks_portfolio_ticker_uidx
  on public.watchlist_stocks (portfolio_id, ticker)
  where portfolio_id is not null;

drop policy if exists "Users can read their watchlist stocks" on public.watchlist_stocks;
create policy "Users can read their watchlist stocks"
on public.watchlist_stocks
for select
to authenticated
using (
  user_id = auth.uid()
  and (
    portfolio_id is null
    or exists (
      select 1
      from public.portfolios
      where portfolios.id = watchlist_stocks.portfolio_id
        and portfolios.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users can insert their watchlist stocks" on public.watchlist_stocks;
create policy "Users can insert their watchlist stocks"
on public.watchlist_stocks
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    portfolio_id is null
    or exists (
      select 1
      from public.portfolios
      where portfolios.id = watchlist_stocks.portfolio_id
        and portfolios.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users can update their watchlist stocks" on public.watchlist_stocks;
create policy "Users can update their watchlist stocks"
on public.watchlist_stocks
for update
to authenticated
using (
  user_id = auth.uid()
  and (
    portfolio_id is null
    or exists (
      select 1
      from public.portfolios
      where portfolios.id = watchlist_stocks.portfolio_id
        and portfolios.user_id = auth.uid()
    )
  )
)
with check (
  user_id = auth.uid()
  and (
    portfolio_id is null
    or exists (
      select 1
      from public.portfolios
      where portfolios.id = watchlist_stocks.portfolio_id
        and portfolios.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users can delete their watchlist stocks" on public.watchlist_stocks;
create policy "Users can delete their watchlist stocks"
on public.watchlist_stocks
for delete
to authenticated
using (
  user_id = auth.uid()
  and (
    portfolio_id is null
    or exists (
      select 1
      from public.portfolios
      where portfolios.id = watchlist_stocks.portfolio_id
        and portfolios.user_id = auth.uid()
    )
  )
);
