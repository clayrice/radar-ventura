-- Projeto exclusivo: Radar Ventura (dmlbohxlwgbleiusyhln)
-- Preserva dados existentes. Execute tudo como uma única transação.
begin;
-- Structured preferences remain optional for existing subscribers.
alter table public.profiles add column if not exists preferences jsonb;

-- Preserve existing stories while allowing clearly labelled educational formats.
alter table public.articles drop constraint if exists articles_category_check;
alter table public.articles add constraint articles_category_check
 check (category in ('Business','Work','Backstage','Big launches','Guides','Cases','Comparisons'));

commit;
