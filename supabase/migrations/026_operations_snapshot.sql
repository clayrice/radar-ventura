-- Aggregated operational view. No customer identifiers, payloads or provider errors.
create function public.operations_snapshot() returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
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
