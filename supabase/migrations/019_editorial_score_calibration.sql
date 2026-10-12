-- Reassess recent low-score rejections with the explicit 0–100 rubric.
-- Preserve publications and all source/evidence/format rejections.
update public.articles
set status='queued', attempts=0, next_attempt_at=now(),
    classification_cache=null, last_error=null
where status='rejected'
  and last_error='Baixa relevância ou interesse humano'
  and source_kind in ('press','analysis')
  and published_at>=now()-interval '14 days'
  and classification_cache->'output'->>'publish'='true'
  and (classification_cache->'output'->>'business_relevance')::numeric between 0 and 10
  and (classification_cache->'output'->>'reader_interest')::numeric between 0 and 10;
