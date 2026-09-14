-- Run once in Supabase SQL editor or via supabase db push.
create extension if not exists pgcrypto;
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 company text not null check(length(company) between 2 and 120),
 sector text not null check(sector in ('Real estate','Construction','Retail','Professional services','Education','Hospitality','Other')),
 size text not null check(size in ('Solo','2–10','11–50','51–200','200+')),
 goals text not null check(length(goals) between 10 and 1000),
 email_opt_in boolean not null default false,
 updated_at timestamptz not null default now()
);
-- Separate entitlement table: the user cannot self-activate by editing their profile.
create table public.subscriptions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'inactive' check(status in ('active','inactive')),
 activated_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.sources (
 id text primary key, name text not null, url text not null,
 feed_url text, kind text not null check(kind in ('primary','discovery','press','analysis')),
 enabled boolean not null default false,
 last_fetched_at timestamptz, last_error text
);
create table public.articles (
 id uuid primary key default gen_random_uuid(),
 source_id text not null references public.sources(id),
 source_name text not null, source_url text not null unique check(source_url like 'https://%'),
 title text not null, title_key text not null unique,
 excerpt text not null, summary text not null default '',
 category text not null default 'Business' check(category in ('Business','Productivity','AI tools','Research')),
 sectors text[] not null default '{}', published_at timestamptz not null,
 status text not null default 'queued' check(status in ('queued','published','rejected','review')),
 attempts int not null default 0, last_error text, model text,
 created_at timestamptz not null default now()
);
create index articles_queue on public.articles(status, published_at desc);
create table public.partners (
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z0-9-]+$'),
 name text not null,description text not null,
 sectors text[] not null default '{}',capabilities text[] not null default '{}',
 website text not null check(website like 'https://%'),email text,phone text,linkedin text,instagram text,
 placement text not null default 'directory' check(placement in ('directory','newsletter')),
 plan text not null default 'catalog' check(plan in ('catalog','connections','strategic')),
 active boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.editions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 week_start date not null,
 status text not null default 'queued' check(status in ('queued','ready','sending','sent','failed','review','cancelled')),
 content jsonb, articles jsonb not null default '[]',partners jsonb not null default '[]',
 attempts int not null default 0, last_error text, model text,
 delivery_payload jsonb, send_started_at timestamptz,sent_at timestamptz,provider_id text,
 created_at timestamptz not null default now(),unique(user_id,week_start)
);
create index edition_queue on public.editions(status,week_start);
create table public.job_locks(name text primary key,owner uuid not null,lease_until timestamptz not null);
create table public.job_runs(id uuid primary key default gen_random_uuid(),job text not null,status text not null default 'running',started_at timestamptz not null default now(),finished_at timestamptz,metrics jsonb,error text);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.sources enable row level security;
alter table public.articles enable row level security;
alter table public.partners enable row level security;
alter table public.editions enable row level security;
alter table public.job_locks enable row level security;
alter table public.job_runs enable row level security;

create policy profile_owner_read on public.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy profile_owner_insert on public.profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy profile_owner_update on public.profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy subscription_owner_read on public.subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy edition_owner_read on public.editions for select to authenticated using ((select auth.uid())=user_id);
create policy published_articles_read on public.articles for select to anon, authenticated using(status='published');
create policy active_partners_read on public.partners for select to anon, authenticated using(active=true);

-- Explicit privileges, including for projects with permissive default grants.
revoke all on public.profiles,public.subscriptions,public.sources,public.articles,public.partners,public.editions,public.job_locks,public.job_runs from anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select(id,week_start,status,content,articles,partners,sent_at,user_id) on public.editions to authenticated;
grant select(id,title,summary,source_name,source_url,published_at,category,sectors,status) on public.articles to anon,authenticated;
grant select on public.partners to anon,authenticated;
grant all on public.profiles,public.subscriptions,public.sources,public.articles,public.partners,public.editions,public.job_locks,public.job_runs to service_role;

create or replace function public.acquire_job(lock_name text,lock_owner uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into public.job_locks(name,owner,lease_until) values(lock_name,lock_owner,now()+interval '10 minutes')
 on conflict(name) do update set owner=excluded.owner,lease_until=excluded.lease_until where job_locks.lease_until<now();
 return found;
end;$$;
create or replace function public.release_job(lock_name text,lock_owner uuid) returns void language sql security definer set search_path=public as $$delete from public.job_locks where name=lock_name and owner=lock_owner;$$;
create or replace function public.enqueue_editions(edition_week date) returns integer language plpgsql security definer set search_path=public as $$
declare inserted integer;
begin
 insert into public.editions(user_id,week_start)
 select p.user_id,edition_week from public.profiles p join public.subscriptions s using(user_id)
 where p.email_opt_in and s.status='active' and not exists(select 1 from public.editions e where e.user_id=p.user_id and e.week_start=edition_week)
 order by p.user_id limit 50 on conflict(user_id,week_start) do nothing;
 get diagnostics inserted=row_count;return inserted;
end;$$;
revoke all on function public.acquire_job(text,uuid),public.release_job(text,uuid),public.enqueue_editions(date) from public,anon,authenticated;
grant execute on function public.acquire_job(text,uuid),public.release_job(text,uuid),public.enqueue_editions(date) to service_role;
