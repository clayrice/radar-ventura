-- Daily HMAC buckets only: never store the raw client IP or email here.
create table public.daily_signup_limits (
 bucket text primary key check(bucket ~ '^[0-9a-f]{64}$'),
 day_attempts integer not null default 1 check(day_attempts between 1 and 30),
 window_attempts integer not null default 1 check(window_attempts between 1 and 6),
 window_started_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '2 days'
);
create index daily_signup_limits_expiry on public.daily_signup_limits(expires_at);
alter table public.daily_signup_limits enable row level security;
revoke all on public.daily_signup_limits from public,anon,authenticated;
grant all on public.daily_signup_limits to service_role;
create function public.reserve_daily_signup(bucket_key text) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if bucket_key is null or bucket_key !~ '^[0-9a-f]{64}$' then return false;end if;
 delete from public.daily_signup_limits where expires_at<now();
 insert into public.daily_signup_limits(bucket) values(bucket_key)
 on conflict(bucket) do update set
 day_attempts=daily_signup_limits.day_attempts+1,
 window_attempts=case when daily_signup_limits.window_started_at<now()-interval '10 minutes' then 1 else daily_signup_limits.window_attempts+1 end,
 window_started_at=case when daily_signup_limits.window_started_at<now()-interval '10 minutes' then now() else daily_signup_limits.window_started_at end
 where daily_signup_limits.day_attempts<30 and (daily_signup_limits.window_started_at<now()-interval '10 minutes' or daily_signup_limits.window_attempts<6);
 return found;
end;$$;
revoke all on function public.reserve_daily_signup(text) from public,anon,authenticated;
grant execute on function public.reserve_daily_signup(text) to service_role;
