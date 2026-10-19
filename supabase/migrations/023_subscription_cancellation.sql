-- Recurrence lifecycle is separate from paid orders and paid access.
alter table public.orders add column renewal_status text not null default 'active'
 check(renewal_status in ('active','cancel_requested','cancelled'));
alter table public.orders add column cancellation_requested_at timestamptz;
alter table public.orders add column cancelled_at timestamptz;
