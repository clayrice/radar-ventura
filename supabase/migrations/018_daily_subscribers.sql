create table public.daily_subscribers (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 status text not null default 'pending' check(status in ('pending','active','unsubscribed')),
 nonce uuid not null default gen_random_uuid(), requested_at timestamptz not null default now(),
 confirmed_at timestamptz, consent_at timestamptz not null default now()
);
create table public.daily_deliveries (
 subscriber_id uuid references public.daily_subscribers(id) on delete cascade,
 radar_date date not null, status text not null default 'sending' check(status in ('sending','sent','review','cancelled')),
 payload jsonb not null, started_at timestamptz not null default now(), provider_id text,
 primary key(subscriber_id,radar_date)
);
alter table public.daily_subscribers enable row level security;
alter table public.daily_deliveries enable row level security;
revoke all on public.daily_subscribers,public.daily_deliveries from anon,authenticated;
grant all on public.daily_subscribers,public.daily_deliveries to service_role;
create function public.request_daily_signup(address text) returns setof public.daily_subscribers
language sql security definer set search_path=public as $$
 insert into daily_subscribers(email) values(address)
 on conflict(email) do update set status='pending',confirmed_at=null,nonce=gen_random_uuid(),requested_at=now(),consent_at=now()
 where daily_subscribers.status <> 'active' and daily_subscribers.requested_at < now()-interval '10 minutes'
 returning *;
$$;
revoke all on function public.request_daily_signup(text) from public,anon,authenticated;
grant execute on function public.request_daily_signup(text) to service_role;
