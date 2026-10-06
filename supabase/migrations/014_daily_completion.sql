-- Durable editions survive function timeouts and cron retries.
create table public.radar_editions (
 radar_date date primary key,
 status text not null default 'pending' check(status in ('pending','blocked','completed')),
 search_stage integer not null default 0 check(search_stage between 0 and 3),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 metrics jsonb not null default '{}',
 last_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.radar_candidates (
 radar_date date not null references public.radar_editions(radar_date),
 article_id uuid not null references public.articles(id),
 primary key(radar_date,article_id)
);
alter table public.articles add column next_attempt_at timestamptz not null default now();
alter table public.radar_editions enable row level security;
alter table public.radar_candidates enable row level security;
revoke all on public.radar_editions,public.radar_candidates from anon,authenticated;
grant all on public.radar_editions,public.radar_candidates to service_role;
-- Separate news capacity from weekly/customer work. Every attempt reserves a call.
create table public.news_ai_usage(day date primary key,calls integer not null);
alter table public.news_ai_usage enable row level security;
revoke all on public.news_ai_usage from anon,authenticated;
grant all on public.news_ai_usage to service_role;
create function public.reserve_news_call() returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into public.news_ai_usage(day,calls) values((now() at time zone 'America/Sao_Paulo')::date,1)
 on conflict(day) do update set calls=news_ai_usage.calls+1 where news_ai_usage.calls<40;
 return found;
end;$$;
revoke all on function public.reserve_news_call() from public,anon,authenticated;
grant execute on function public.reserve_news_call() to service_role;
-- Enforce the cap even for concurrent writers outside the daily worker.
-- Historical editions are retained; only new transitions into published count.
create function public.enforce_radar_capacity() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status='published' and new.radar_date is not null and
   (tg_op='INSERT' or old.status is distinct from new.status or old.radar_date is distinct from new.radar_date) then
  perform pg_advisory_xact_lock(72139, (new.radar_date-date '2000-01-01')::integer);
  if (select count(*) from public.articles where status='published' and radar_date=new.radar_date and id<>new.id)>=3 then
   raise exception 'radar_daily_capacity_reached';
  end if;
 end if;
 return new;
end;$$;
create trigger radar_capacity before insert or update on public.articles for each row execute function public.enforce_radar_capacity();
