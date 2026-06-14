alter table public.watchlist_stocks
drop constraint if exists watchlist_stocks_moat_check;

alter table public.watchlist_stocks
add constraint watchlist_stocks_moat_check check (
  moat in (
    'Excellent',
    'Very Good',
    'Good',
    'Average',
    'Bad',
    'Very Bad',
    'Unknown'
  )
);
