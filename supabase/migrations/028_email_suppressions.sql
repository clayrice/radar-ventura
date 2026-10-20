-- Only a fingerprint and provider references. Never store message bodies here.
create table public.email_suppressions (
 fingerprint text primary key check(fingerprint ~ '^[0-9a-f]{64}$'),
 reason text not null check(reason in ('hard_bounce','complaint')),
 event_id text not null check(length(event_id) between 1 and 200),
 provider_id text not null check(length(provider_id) between 1 and 200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from public,anon,authenticated;
grant all on public.email_suppressions to service_role;
create function public.record_email_suppression(recipient_fingerprint text,suppression_reason text,event_key text,provider_key text) returns void language sql security definer set search_path=public as $$
 insert into public.email_suppressions(fingerprint,reason,event_id,provider_id)
 values(recipient_fingerprint,suppression_reason,event_key,provider_key)
 on conflict(fingerprint) do update set
 reason=case when email_suppressions.reason='complaint' then 'complaint' else excluded.reason end,
 event_id=excluded.event_id,provider_id=excluded.provider_id,updated_at=now()
 where email_suppressions.event_id<>excluded.event_id;
$$;
revoke all on function public.record_email_suppression(text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_email_suppression(text,text,text,text) to service_role;

-- Aggregated operational view. No customer identifiers, payloads or provider errors.
create or replace function public.operations_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
 'email_suppressed',(select count(*) from public.email_suppressions),
 'day',(now() at time zone 'America/Sao_Paulo')::date,
 'generated_at',now(),
 'articles_today',(select count(*) from public.articles where status='published' and radar_date=(now() at time zone 'America/Sao_Paulo')::date),
 'photos_today',(select count(*) from public.articles where status='published' and radar_date=(now() at time zone 'America/Sao_Paulo')::date and cover_url is not null and cover_origin in ('feed','article')),
 'posts_today',(select count(*) from public.instagram_posts where status='published' and radar_date=(now() at time zone 'America/Sao_Paulo')::date),
 'daily_status',(select status from public.radar_editions where radar_date=(now() at time zone 'America/Sao_Paulo')::date),
 'daily_active',(select count(*) from public.daily_subscribers where status='active'),
 'daily_pending',(select count(*) from public.daily_subscribers where status='pending'),
 'daily_sent_today',(select count(*) from public.daily_deliveries where status='sent' and radar_date=(now() at time zone 'America/Sao_Paulo')::date),
 'daily_review',(select count(*) from public.daily_deliveries where status='review'),
 'weekly_active',(select count(*) from public.subscriptions where status='active' and expires_at>now()),
 'weekly_queued',(select count(*) from public.editions where status='queued'),
 'weekly_ready',(select count(*) from public.editions where status in ('ready','sending')),
 'weekly_review',(select count(*) from public.editions where status in ('review','failed')),
 'weekly_sent',(select count(*) from public.editions where status='sent' and sent_at>now()-interval '7 days'),
 'billing_review',(select count(*) from public.orders where status='review' or (status in ('creating','pending') and created_at<now()-interval '1 hour')),
 'billing_events_pending',(select count(*) from public.billing_events where status<>'processed' and created_at<now()-interval '15 minutes'),
 'financial_queued',(select count(*) from public.billing_mail where status in ('pending','sending')),
 'financial_review',(select count(*) from public.billing_mail where status='review'),
 'financial_sent',(select count(*) from public.billing_mail where status='sent' and sent_at>now()-interval '7 days'),
 'partners_active',(select count(*) from public.partners where active and (expires_at is null or expires_at>now())),
 'personalization_calls',coalesce((select calls from public.ai_usage where day=(now() at time zone 'UTC')::date),0),
 'news_calls',coalesce((select calls from public.news_ai_usage where day=(now() at time zone 'America/Sao_Paulo')::date),0),
 'daily_history',coalesce((select jsonb_agg(x order by x.radar_date desc) from (select radar_date,status,attempts,updated_at from public.radar_editions order by radar_date desc limit 7)x),'[]'::jsonb),
 'runs',coalesce((select jsonb_agg(x order by x.started_at desc) from (select job,status,started_at,finished_at from public.job_runs where started_at>now()-interval '7 days' order by started_at desc limit 12)x),'[]'::jsonb)
);$$;
revoke all on function public.operations_snapshot() from public,anon,authenticated;
grant execute on function public.operations_snapshot() to service_role;
