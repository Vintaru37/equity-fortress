alter table public.watchlist_stocks
add column if not exists customer_dependence_score smallint null,
add column if not exists smart_money_score smallint null,
add column if not exists backlog_score smallint null,
add column if not exists buybacks_score smallint null;

alter table public.watchlist_stocks
drop constraint if exists watchlist_stocks_customer_dependence_score_check,
drop constraint if exists watchlist_stocks_smart_money_score_check,
drop constraint if exists watchlist_stocks_backlog_score_check,
drop constraint if exists watchlist_stocks_buybacks_score_check;

alter table public.watchlist_stocks
add constraint watchlist_stocks_customer_dependence_score_check
  check (customer_dependence_score is null or customer_dependence_score between 0 and 5),
add constraint watchlist_stocks_smart_money_score_check
  check (smart_money_score is null or smart_money_score between 0 and 15),
add constraint watchlist_stocks_backlog_score_check
  check (backlog_score is null or backlog_score between 0 and 10),
add constraint watchlist_stocks_buybacks_score_check
  check (buybacks_score is null or buybacks_score between 0 and 5);
