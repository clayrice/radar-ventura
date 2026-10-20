-- Financial notifications are queued in the same transaction as paid access.
create table public.billing_mail (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique,
 order_id uuid not null references public.orders(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('activated','renewed','payment_failed','cancelled')),
 payment_id text,
 status text not null default 'pending' check(status in ('pending','sending','sent','review','cancelled')),
 payload jsonb,
 created_at timestamptz not null default now(),
 started_at timestamptz,
 sent_at timestamptz,
 provider_id text,
 last_error text
);
alter table public.billing_mail enable row level security;
revoke all on public.billing_mail from public,anon,authenticated;
grant all on public.billing_mail to service_role;
create index billing_mail_pending on public.billing_mail(created_at) where status in ('pending','sending');

create function public.queue_paid_mail() returns trigger language plpgsql security definer set search_path=public as $$
declare o public.orders; message_kind text;
begin
 select * into strict o from public.orders where id=new.order_id;
 if o.product<>'weekly' then return new;end if;
 message_kind:=case when exists(select 1 from public.payments where order_id=o.id and id<>new.id and status='paid') then 'renewed' else 'activated' end;
 insert into public.billing_mail(event_key,order_id,user_id,kind,payment_id)
 values('paid/'||new.id,o.id,o.user_id,message_kind,new.id) on conflict(event_key) do nothing;
 return new;
end;$$;
create trigger paid_mail after insert on public.payments for each row execute function public.queue_paid_mail();

create function public.queue_cancelled_mail() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.product='weekly' and new.renewal_status='cancelled' and old.renewal_status is distinct from new.renewal_status then
 insert into public.billing_mail(event_key,order_id,user_id,kind)
 values('cancelled/'||new.id,new.id,new.user_id,'cancelled') on conflict(event_key) do nothing;
 end if;
 return new;
end;$$;
create trigger cancelled_mail after update of renewal_status on public.orders for each row execute function public.queue_cancelled_mail();

create function public.queue_billing_failure(order_key uuid,payment_key text) returns void language plpgsql security definer set search_path=public as $$
declare o public.orders;
begin
 select * into strict o from public.orders where id=order_key;
 if o.product<>'weekly' or length(payment_key)<1 or length(payment_key)>150 then return;end if;
 insert into public.billing_mail(event_key,order_id,user_id,kind,payment_id)
 values('failed/'||payment_key,o.id,o.user_id,'payment_failed',payment_key) on conflict(event_key) do nothing;
end;$$;
revoke all on function public.queue_paid_mail(),public.queue_cancelled_mail(),public.queue_billing_failure(uuid,text) from public,anon,authenticated;
grant execute on function public.queue_billing_failure(uuid,text) to service_role;
