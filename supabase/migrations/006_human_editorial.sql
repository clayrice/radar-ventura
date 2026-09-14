alter table public.articles add column source_kind text not null default 'primary';
update public.articles a set source_kind=s.kind from public.sources s where s.id=a.source_id;
alter table public.articles add column human_angle text not null default '';
alter table public.articles add column perspective_attribution text not null default '';
alter table public.articles add column perspective_evidence text not null default '';
alter table public.articles add column editorial_score integer not null default 0 check(editorial_score between 0 and 100);
-- Previously generated summaries must be reassessed against the new policy.
update public.articles set status=case when source_kind in ('press','analysis') then 'queued' else 'review' end,attempts=0 where status='published';
alter table public.articles drop constraint articles_category_check;
update public.articles set category='Business' where category in ('AI tools','Productivity','Research');
alter table public.articles add constraint articles_category_check check(category in ('Business','Work','Backstage','Big launches'));
create function public.enforce_editorial_source() returns trigger language plpgsql set search_path=public as $$
begin
 select kind into new.source_kind from public.sources where id=new.source_id;
 if new.status='published' and (new.source_kind not in ('press','analysis') or length(trim(new.human_angle))<30 or length(trim(new.perspective_evidence))<30 or new.perspective_attribution<>new.source_name) then
 raise exception 'Independent human perspective required for publication';
 end if;
 return new;
end;$$;
create trigger editorial_source_guard before insert or update on public.articles for each row execute function public.enforce_editorial_source();
grant select(human_angle,perspective_attribution,editorial_score) on public.articles to anon,authenticated;
