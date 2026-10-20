-- A permanently invalid recipient must not hold the oldest delivery batch.
alter table public.billing_mail add column attempts integer not null default 0 check(attempts>=0);
