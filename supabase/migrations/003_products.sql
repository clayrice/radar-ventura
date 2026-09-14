alter table public.partners add column owner_id uuid unique references auth.users(id) on delete cascade;
alter table public.partners add column expires_at timestamptz;
alter table public.subscriptions add column expires_at timestamptz;
drop policy active_partners_read on public.partners;
create policy active_partners_read on public.partners for select to anon,authenticated using(active and (expires_at is null or expires_at>now()));
create table public.partner_applications(user_id uuid primary key references auth.users(id) on delete cascade,name text not null,description text not null,website text not null,email text not null,phone text,linkedin text,instagram text,sectors text[] not null,capabilities text[] not null,plan text not null check(plan in ('catalog','connections','strategic')),consent_at timestamptz not null);
create table public.roadmap_inputs(user_id uuid primary key references auth.users(id) on delete cascade,answers jsonb not null,updated_at timestamptz not null default now());
create table public.orders(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,product text not null check(product in ('weekly','catalog','connections','strategic','roadmap')),value_cents integer not null check(value_cents>0),status text not null default 'creating' check(status in ('creating','pending','paid','review','cancelled')),checkout_id text unique,subscription_id text,created_at timestamptz not null default now(),last_error text);
create unique index one_pending_order on public.orders(user_id,product) where status in ('creating','pending','review');
create table public.billing_events(id text primary key,event text not null,checkout_id text,payment_id text,status text not null default 'pending',created_at timestamptz not null default now());
create table public.payments(id text primary key,order_id uuid not null references public.orders(id),period_end timestamptz not null,status text not null default 'paid');
create table public.roadmaps(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,order_id uuid unique not null references public.orders(id),answers jsonb not null,status text not null default 'queued' check(status in ('queued','ready','failed','cancelled')),output jsonb,partners jsonb not null default '[]',attempts integer not null default 0,last_error text,created_at timestamptz not null default now());
alter table public.partner_applications enable row level security;
alter table public.roadmap_inputs enable row level security;
alter table public.orders enable row level security;
alter table public.billing_events enable row level security;
alter table public.payments enable row level security;
alter table public.roadmaps enable row level security;
revoke all on public.partner_applications,public.roadmap_inputs,public.orders,public.billing_events,public.payments,public.roadmaps from anon,authenticated;
grant select on public.partner_applications,public.roadmap_inputs,public.orders,public.roadmaps to authenticated;
grant all on public.partner_applications,public.roadmap_inputs,public.orders,public.billing_events,public.payments,public.roadmaps to service_role;
create policy partner_application_owner on public.partner_applications for select to authenticated using((select auth.uid())=user_id);
create policy roadmap_input_owner on public.roadmap_inputs for select to authenticated using((select auth.uid())=user_id);
create policy order_owner on public.orders for select to authenticated using((select auth.uid())=user_id);
create policy roadmap_owner on public.roadmaps for select to authenticated using((select auth.uid())=user_id);

-- The server calls this only after verifying a paid Asaas payment and the exact amount.
create or replace function public.confirm_payment(order_key uuid,payment_key text,subscription_key text,paid_until timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare o public.orders; a public.partner_applications; answer jsonb;
begin
 select * into strict o from public.orders where id=order_key for update;
 insert into public.payments(id,order_id,period_end) values(payment_key,o.id,paid_until) on conflict(id) do nothing;
 if not found then return;end if;
 update public.orders set status='paid',subscription_id=coalesce(subscription_key,subscription_id),last_error=null where id=o.id;
 if o.product='weekly' then
 insert into public.subscriptions(user_id,status,activated_at,expires_at) values(o.user_id,'active',now(),paid_until)
 on conflict(user_id) do update set status='active',expires_at=greatest(subscriptions.expires_at,excluded.expires_at),updated_at=now();
 elsif o.product='roadmap' then
 select answers into strict answer from public.roadmap_inputs where user_id=o.user_id;
 insert into public.roadmaps(user_id,order_id,answers) values(o.user_id,o.id,answer) on conflict(order_id) do nothing;
 else
 select * into strict a from public.partner_applications where user_id=o.user_id;
 insert into public.partners(owner_id,slug,name,description,website,email,phone,linkedin,instagram,sectors,capabilities,plan,placement,active,expires_at)
 values(o.user_id,'parceiro-'||o.user_id,a.name,a.description,a.website,a.email,nullif(a.phone,''),nullif(a.linkedin,''),nullif(a.instagram,''),a.sectors,a.capabilities,o.product,case when o.product='catalog' then 'directory' else 'newsletter' end,true,paid_until)
 on conflict(owner_id) do update set name=excluded.name,description=excluded.description,website=excluded.website,email=excluded.email,phone=excluded.phone,linkedin=excluded.linkedin,instagram=excluded.instagram,sectors=excluded.sectors,capabilities=excluded.capabilities,plan=excluded.plan,placement=excluded.placement,active=true,expires_at=greatest(partners.expires_at,excluded.expires_at);
 end if;
end;$$;
create or replace function public.revoke_payment(payment_key text) returns void language plpgsql security definer set search_path=public as $$
declare o public.orders; remaining timestamptz;
begin
 select orders.* into o from public.orders join public.payments on payments.order_id=orders.id where payments.id=payment_key for update of orders;
 if not found then return;end if;
 update public.payments set status='revoked' where id=payment_key;
 select max(p.period_end) into remaining from public.payments p join public.orders x on x.id=p.order_id where x.user_id=o.user_id and x.product=o.product and p.status='paid';
 if o.product='weekly' then update public.subscriptions set expires_at=coalesce(remaining,now()),status=case when remaining>now() then 'active' else 'inactive' end where user_id=o.user_id;
 elsif o.product='roadmap' then update public.roadmaps set status='cancelled',output=null,partners='[]' where order_id=o.id;
 else update public.partners set expires_at=coalesce(remaining,now()),active=coalesce(remaining>now(),false) where owner_id=o.user_id;
 end if;
end;$$;
revoke all on function public.confirm_payment(uuid,text,text,timestamptz),public.revoke_payment(text) from public,anon,authenticated;
grant execute on function public.confirm_payment(uuid,text,text,timestamptz),public.revoke_payment(text) to service_role;
