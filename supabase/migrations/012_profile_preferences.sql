-- Structured preferences remain optional for existing subscribers.
alter table public.profiles add column if not exists preferences jsonb;
