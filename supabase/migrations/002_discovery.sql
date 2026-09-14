create table public.discoveries(id uuid primary key default gen_random_uuid(),source_id text not null references public.sources(id),source_url text not null unique,title text not null,excerpt text not null,primary_links text[] not null default '{}',created_at timestamptz not null default now());
alter table public.discoveries enable row level security;
revoke all on public.discoveries from anon,authenticated;
grant all on public.discoveries to service_role;
