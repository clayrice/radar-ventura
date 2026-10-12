-- Worker-only input and classification cache. No grants to public readers.
alter table public.articles add column if not exists source_text text;
alter table public.articles add column if not exists source_text_checked_at timestamptz;
alter table public.articles add column if not exists classification_cache jsonb;
revoke select(source_text,source_text_checked_at,classification_cache) on public.articles from anon,authenticated;
-- Re-evaluate recent evidence failures with article text and untranslated quotations.
-- Already published articles and editorial relevance rejections are preserved.
update public.articles set status='queued',attempts=0,next_attempt_at=now(),classification_cache=null
where source_kind in ('press','analysis') and status='rejected'
and last_error='Perspectiva sem evidência no trecho da fonte'
and published_at>=now()-interval '14 days';
