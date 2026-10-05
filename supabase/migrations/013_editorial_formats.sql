-- Preserve existing stories while allowing clearly labelled educational formats.
alter table public.articles drop constraint if exists articles_category_check;
alter table public.articles add constraint articles_category_check
 check (category in ('Business','Work','Backstage','Big launches','Guides','Cases','Comparisons'));
