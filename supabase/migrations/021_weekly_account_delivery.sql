-- Paid readers retain their weekly edition in the account even without email consent.
alter table public.editions drop constraint editions_status_check;
alter table public.editions add constraint editions_status_check check(status in ('queued','ready','available','sending','sent','failed','review','cancelled'));
create or replace function public.enqueue_editions(edition_week date) returns integer language plpgsql security definer set search_path=public as $$
declare inserted integer;
begin
 insert into public.editions(user_id,week_start)
 select p.user_id,edition_week from public.profiles p join public.subscriptions s using(user_id)
 where s.status='active' and (s.expires_at is null or s.expires_at>now())
 and not exists(select 1 from public.editions e where e.user_id=p.user_id and e.week_start=edition_week)
 order by p.user_id limit 50 on conflict(user_id,week_start) do nothing;
 get diagnostics inserted=row_count;return inserted;
end;$$;
revoke all on function public.enqueue_editions(date) from public,anon,authenticated;
grant execute on function public.enqueue_editions(date) to service_role;
