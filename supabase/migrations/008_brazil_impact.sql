alter table public.articles add column brazil_impact text not null default '' check(char_length(brazil_impact)<=1000);
grant select(brazil_impact) on public.articles to anon,authenticated;
