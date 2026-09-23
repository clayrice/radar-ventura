alter table public.articles add column if not exists radar_date date;

update public.articles
set radar_date=(created_at at time zone 'America/Sao_Paulo')::date
where status='published' and radar_date is null;

create index if not exists articles_radar_date
on public.articles(radar_date desc,editorial_score desc)
where status='published';

grant select(radar_date) on public.articles to anon,authenticated;
