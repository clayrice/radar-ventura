create table public.ai_usage(day date primary key default current_date,calls integer not null default 0);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon,authenticated;
grant all on public.ai_usage to service_role;
create function public.reserve_ai_call() returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into public.ai_usage(day,calls) values(current_date,1) on conflict(day) do update set calls=ai_usage.calls+1 where ai_usage.calls<10;
 return found;
end;$$;
revoke all on function public.reserve_ai_call() from public,anon,authenticated;
grant execute on function public.reserve_ai_call() to service_role;
