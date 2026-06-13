alter table public.watchlist_stocks
drop constraint if exists watchlist_stocks_moat_check;

update public.watchlist_stocks
set moat = case moat
  when 'Very Wide' then 'Excellent'
  when 'Wide' then 'Good'
  when 'Narrow' then 'Average'
  when 'None' then 'Bad'
  else 'Unknown'
end;

alter table public.watchlist_stocks
alter column moat set default 'Unknown';

alter table public.watchlist_stocks
add constraint watchlist_stocks_moat_check check (
  moat in ('Excellent', 'Good', 'Average', 'Bad', 'Unknown')
);
