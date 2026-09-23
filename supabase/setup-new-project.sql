-- Ventura AI: executar uma única vez em projeto novo, sem tabelas Ventura.
-- Cria tabelas, permissões, funções, armazenamento e registro de fontes.
begin;
-- 001_initial.sql
-- Run once in Supabase SQL editor or via supabase db push.
create extension if not exists pgcrypto;
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 company text not null check(length(company) between 2 and 120),
 sector text not null check(sector in ('Real estate','Construction','Retail','Professional services','Education','Hospitality','Other')),
 size text not null check(size in ('Solo','2–10','11–50','51–200','200+')),
 goals text not null check(length(goals) between 10 and 1000),
 email_opt_in boolean not null default false,
 updated_at timestamptz not null default now()
);
-- Separate entitlement table: the user cannot self-activate by editing their profile.
create table public.subscriptions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'inactive' check(status in ('active','inactive')),
 activated_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.sources (
 id text primary key, name text not null, url text not null,
 feed_url text, kind text not null check(kind in ('primary','discovery','press','analysis')),
 enabled boolean not null default false,
 last_fetched_at timestamptz, last_error text
);
create table public.articles (
 id uuid primary key default gen_random_uuid(),
 source_id text not null references public.sources(id),
 source_name text not null, source_url text not null unique check(source_url like 'https://%'),
 title text not null, title_key text not null unique,
 excerpt text not null, summary text not null default '',
 category text not null default 'Business' check(category in ('Business','Productivity','AI tools','Research')),
 sectors text[] not null default '{}', published_at timestamptz not null,
 status text not null default 'queued' check(status in ('queued','published','rejected','review')),
 attempts int not null default 0, last_error text, model text,
 created_at timestamptz not null default now()
);
create index articles_queue on public.articles(status, published_at desc);
create table public.partners (
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z0-9-]+$'),
 name text not null,description text not null,
 sectors text[] not null default '{}',capabilities text[] not null default '{}',
 website text not null check(website like 'https://%'),email text,phone text,linkedin text,instagram text,
 placement text not null default 'directory' check(placement in ('directory','newsletter')),
 plan text not null default 'catalog' check(plan in ('catalog','connections','strategic')),
 active boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.editions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 week_start date not null,
 status text not null default 'queued' check(status in ('queued','ready','sending','sent','failed','review','cancelled')),
 content jsonb, articles jsonb not null default '[]',partners jsonb not null default '[]',
 attempts int not null default 0, last_error text, model text,
 delivery_payload jsonb, send_started_at timestamptz,sent_at timestamptz,provider_id text,
 created_at timestamptz not null default now(),unique(user_id,week_start)
);
create index edition_queue on public.editions(status,week_start);
create table public.job_locks(name text primary key,owner uuid not null,lease_until timestamptz not null);
create table public.job_runs(id uuid primary key default gen_random_uuid(),job text not null,status text not null default 'running',started_at timestamptz not null default now(),finished_at timestamptz,metrics jsonb,error text);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.sources enable row level security;
alter table public.articles enable row level security;
alter table public.partners enable row level security;
alter table public.editions enable row level security;
alter table public.job_locks enable row level security;
alter table public.job_runs enable row level security;

create policy profile_owner_read on public.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy profile_owner_insert on public.profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy profile_owner_update on public.profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy subscription_owner_read on public.subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy edition_owner_read on public.editions for select to authenticated using ((select auth.uid())=user_id);
create policy published_articles_read on public.articles for select to anon, authenticated using(status='published');
create policy active_partners_read on public.partners for select to anon, authenticated using(active=true);

-- Explicit privileges, including for projects with permissive default grants.
revoke all on public.profiles,public.subscriptions,public.sources,public.articles,public.partners,public.editions,public.job_locks,public.job_runs from anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select(id,week_start,status,content,articles,partners,sent_at,user_id) on public.editions to authenticated;
grant select(id,title,summary,source_name,source_url,published_at,category,sectors,status) on public.articles to anon,authenticated;
grant select on public.partners to anon,authenticated;
grant all on public.profiles,public.subscriptions,public.sources,public.articles,public.partners,public.editions,public.job_locks,public.job_runs to service_role;

create or replace function public.acquire_job(lock_name text,lock_owner uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into public.job_locks(name,owner,lease_until) values(lock_name,lock_owner,now()+interval '10 minutes')
 on conflict(name) do update set owner=excluded.owner,lease_until=excluded.lease_until where job_locks.lease_until<now();
 return found;
end;$$;
create or replace function public.release_job(lock_name text,lock_owner uuid) returns void language sql security definer set search_path=public as $$delete from public.job_locks where name=lock_name and owner=lock_owner;$$;
create or replace function public.enqueue_editions(edition_week date) returns integer language plpgsql security definer set search_path=public as $$
declare inserted integer;
begin
 insert into public.editions(user_id,week_start)
 select p.user_id,edition_week from public.profiles p join public.subscriptions s using(user_id)
 where p.email_opt_in and s.status='active' and not exists(select 1 from public.editions e where e.user_id=p.user_id and e.week_start=edition_week)
 order by p.user_id limit 50 on conflict(user_id,week_start) do nothing;
 get diagnostics inserted=row_count;return inserted;
end;$$;
revoke all on function public.acquire_job(text,uuid),public.release_job(text,uuid),public.enqueue_editions(date) from public,anon,authenticated;
grant execute on function public.acquire_job(text,uuid),public.release_job(text,uuid),public.enqueue_editions(date) to service_role;

-- 002_discovery.sql
create table public.discoveries(id uuid primary key default gen_random_uuid(),source_id text not null references public.sources(id),source_url text not null unique,title text not null,excerpt text not null,primary_links text[] not null default '{}',created_at timestamptz not null default now());
alter table public.discoveries enable row level security;
revoke all on public.discoveries from anon,authenticated;
grant all on public.discoveries to service_role;

-- 003_products.sql
alter table public.partners add column owner_id uuid unique references auth.users(id) on delete cascade;
alter table public.partners add column expires_at timestamptz;
alter table public.subscriptions add column expires_at timestamptz;
drop policy active_partners_read on public.partners;
create policy active_partners_read on public.partners for select to anon,authenticated using(active and (expires_at is null or expires_at>now()));
create table public.partner_applications(user_id uuid primary key references auth.users(id) on delete cascade,name text not null,description text not null,website text not null,email text not null,phone text,linkedin text,instagram text,sectors text[] not null,capabilities text[] not null,plan text not null check(plan in ('catalog','connections','strategic')),consent_at timestamptz not null);
create table public.roadmap_inputs(user_id uuid primary key references auth.users(id) on delete cascade,answers jsonb not null,updated_at timestamptz not null default now());
create table public.orders(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,product text not null check(product in ('weekly','catalog','connections','strategic','roadmap')),value_cents integer not null check(value_cents>0),status text not null default 'creating' check(status in ('creating','pending','paid','review','cancelled')),checkout_id text unique,subscription_id text,created_at timestamptz not null default now(),last_error text);
create unique index one_pending_order on public.orders(user_id,product) where status in ('creating','pending','review');
create table public.billing_events(id text primary key,event text not null,checkout_id text,payment_id text,status text not null default 'pending',created_at timestamptz not null default now());
create table public.payments(id text primary key,order_id uuid not null references public.orders(id),period_end timestamptz not null,status text not null default 'paid');
create table public.roadmaps(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,order_id uuid unique not null references public.orders(id),answers jsonb not null,status text not null default 'queued' check(status in ('queued','ready','failed','cancelled')),output jsonb,partners jsonb not null default '[]',attempts integer not null default 0,last_error text,created_at timestamptz not null default now());
alter table public.partner_applications enable row level security;
alter table public.roadmap_inputs enable row level security;
alter table public.orders enable row level security;
alter table public.billing_events enable row level security;
alter table public.payments enable row level security;
alter table public.roadmaps enable row level security;
revoke all on public.partner_applications,public.roadmap_inputs,public.orders,public.billing_events,public.payments,public.roadmaps from anon,authenticated;
grant select on public.partner_applications,public.roadmap_inputs,public.orders,public.roadmaps to authenticated;
grant all on public.partner_applications,public.roadmap_inputs,public.orders,public.billing_events,public.payments,public.roadmaps to service_role;
create policy partner_application_owner on public.partner_applications for select to authenticated using((select auth.uid())=user_id);
create policy roadmap_input_owner on public.roadmap_inputs for select to authenticated using((select auth.uid())=user_id);
create policy order_owner on public.orders for select to authenticated using((select auth.uid())=user_id);
create policy roadmap_owner on public.roadmaps for select to authenticated using((select auth.uid())=user_id);

-- The server calls this only after verifying a paid Asaas payment and the exact amount.
create or replace function public.confirm_payment(order_key uuid,payment_key text,subscription_key text,paid_until timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare o public.orders; a public.partner_applications; answer jsonb;
begin
 select * into strict o from public.orders where id=order_key for update;
 insert into public.payments(id,order_id,period_end) values(payment_key,o.id,paid_until) on conflict(id) do nothing;
 if not found then return;end if;
 update public.orders set status='paid',subscription_id=coalesce(subscription_key,subscription_id),last_error=null where id=o.id;
 if o.product='weekly' then
 insert into public.subscriptions(user_id,status,activated_at,expires_at) values(o.user_id,'active',now(),paid_until)
 on conflict(user_id) do update set status='active',expires_at=greatest(subscriptions.expires_at,excluded.expires_at),updated_at=now();
 elsif o.product='roadmap' then
 select answers into strict answer from public.roadmap_inputs where user_id=o.user_id;
 insert into public.roadmaps(user_id,order_id,answers) values(o.user_id,o.id,answer) on conflict(order_id) do nothing;
 else
 select * into strict a from public.partner_applications where user_id=o.user_id;
 insert into public.partners(owner_id,slug,name,description,website,email,phone,linkedin,instagram,sectors,capabilities,plan,placement,active,expires_at)
 values(o.user_id,'parceiro-'||o.user_id,a.name,a.description,a.website,a.email,nullif(a.phone,''),nullif(a.linkedin,''),nullif(a.instagram,''),a.sectors,a.capabilities,o.product,case when o.product='catalog' then 'directory' else 'newsletter' end,true,paid_until)
 on conflict(owner_id) do update set name=excluded.name,description=excluded.description,website=excluded.website,email=excluded.email,phone=excluded.phone,linkedin=excluded.linkedin,instagram=excluded.instagram,sectors=excluded.sectors,capabilities=excluded.capabilities,plan=excluded.plan,placement=excluded.placement,active=true,expires_at=greatest(partners.expires_at,excluded.expires_at);
 end if;
end;$$;
create or replace function public.revoke_payment(payment_key text) returns void language plpgsql security definer set search_path=public as $$
declare o public.orders; remaining timestamptz;
begin
 select orders.* into o from public.orders join public.payments on payments.order_id=orders.id where payments.id=payment_key for update of orders;
 if not found then return;end if;
 update public.payments set status='revoked' where id=payment_key;
 select max(p.period_end) into remaining from public.payments p join public.orders x on x.id=p.order_id where x.user_id=o.user_id and x.product=o.product and p.status='paid';
 if o.product='weekly' then update public.subscriptions set expires_at=coalesce(remaining,now()),status=case when remaining>now() then 'active' else 'inactive' end where user_id=o.user_id;
 elsif o.product='roadmap' then update public.roadmaps set status='cancelled',output=null,partners='[]' where order_id=o.id;
 else update public.partners set expires_at=coalesce(remaining,now()),active=coalesce(remaining>now(),false) where owner_id=o.user_id;
 end if;
end;$$;
revoke all on function public.confirm_payment(uuid,text,text,timestamptz),public.revoke_payment(text) from public,anon,authenticated;
grant execute on function public.confirm_payment(uuid,text,text,timestamptz),public.revoke_payment(text) to service_role;

-- 004_cost_limits.sql
create table public.ai_usage(day date primary key default current_date,calls integer not null default 0);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon,authenticated;
grant all on public.ai_usage to service_role;
create function public.reserve_ai_call() returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into public.ai_usage(day,calls) values(current_date,1) on conflict(day) do update set calls=ai_usage.calls+1 where ai_usage.calls<10;
 return found;
end;$$;
revoke all on function public.reserve_ai_call() from public,anon,authenticated;
grant execute on function public.reserve_ai_call() to service_role;

-- 005_weekly_preferences.sql
-- Add structured preferences without guessing selections for existing subscribers.
alter table public.profiles
 add column objective text check(objective in ('Economizar tempo','Reduzir custos','Vender mais','Melhorar o atendimento','Tomar decisões com dados','Entender por onde começar')),
 add column interests text[] not null default '{}' check(cardinality(interests)<=3 and interests <@ array['Marketing e conteúdo','Vendas e relacionamento','Atendimento ao cliente','Operação e processos','Finanças e administração','Pessoas e treinamento','Dados e relatórios']::text[]),
 add column business_model text check(business_model in ('Outras empresas (B2B)','Consumidores (B2C)','Empresas e consumidores')),
 add column ai_level text check(ai_level in ('Ainda não usamos IA','Usamos ferramentas pontualmente','Já temos IA em alguns processos','Queremos ampliar o que já funciona'));
-- goals remains for legacy records; new saves derive it from the chosen objective.

-- 006_human_editorial.sql
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

-- 007_partner_showcases.sql
create table public.partner_showcases (
 user_id uuid primary key references public.partner_applications(user_id) on delete cascade,
 items jsonb not null default '[]' check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=6),
 updated_at timestamptz not null default now()
);
alter table public.partner_showcases enable row level security;
revoke all on public.partner_showcases from anon,authenticated;
grant select on public.partner_showcases to anon,authenticated;
grant all on public.partner_showcases to service_role;
create policy showcase_owner_read on public.partner_showcases for select to authenticated using(user_id=(select auth.uid()));
create policy showcase_public_read on public.partner_showcases for select to anon,authenticated using(exists(select 1 from public.partners p where p.owner_id=user_id and p.active and (p.expires_at is null or p.expires_at>now())));

-- Six fixed object slots per registered partner bound storage to at most 240 MiB.
-- The published manifest is changed only by the authenticated server action.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('partner-media','partner-media',true,41943040,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']);
create policy partner_media_insert on storage.objects for insert to authenticated with check(
 bucket_id='partner-media' and name ~ ('^'||(select auth.uid())::text||'/[0-5]$')
 and exists(select 1 from public.partner_applications where user_id=(select auth.uid()))
);
create policy partner_media_select on storage.objects for select to authenticated using(
 bucket_id='partner-media' and name ~ ('^'||(select auth.uid())::text||'/[0-5]$')
);
create policy partner_media_update on storage.objects for update to authenticated using(
 bucket_id='partner-media' and name ~ ('^'||(select auth.uid())::text||'/[0-5]$')
) with check(
 bucket_id='partner-media' and name ~ ('^'||(select auth.uid())::text||'/[0-5]$')
 and exists(select 1 from public.partner_applications where user_id=(select auth.uid()))
);

-- 008_brazil_impact.sql
alter table public.articles add column brazil_impact text not null default '' check(char_length(brazil_impact)<=1000);
grant select(brazil_impact) on public.articles to anon,authenticated;

-- 009_article_covers.sql
alter table public.articles add column cover_url text check(cover_url is null or cover_url ~ '^https://');
alter table public.articles add column cover_caption text check(char_length(cover_caption)<=500);
alter table public.articles add column cover_credit text check(char_length(cover_credit)<=300);
grant select(cover_url,cover_caption,cover_credit) on public.articles to anon,authenticated;

-- 010_daily_radar.sql
alter table public.articles add column if not exists radar_date date;
update public.articles set radar_date=(created_at at time zone 'America/Sao_Paulo')::date where status='published' and radar_date is null;
create index if not exists articles_radar_date on public.articles(radar_date desc,editorial_score desc) where status='published';
grant select(radar_date) on public.articles to anon,authenticated;

-- seed.sql
-- Source registry: checked public feeds, no content or private data.
insert into public.sources(id,name,url,feed_url,kind,enabled) values
 ('human-in-the-loop','Human in the Loop · Andreas Horn','https://www.humanintheloop.online/','https://www.humanintheloop.online/feed','discovery',false),
 ('aidrops','AiDrops','https://www.aidrop.news/',null,'discovery',false),
 ('ai-breakfast','AI Breakfast','https://aibreakfast.beehiiv.com/',null,'discovery',false),
 ('rundown','The Rundown AI','https://www.therundown.ai/',null,'discovery',false),
 ('neuron','The Neuron','https://www.theneuron.ai/',null,'discovery',false),
 ('tldr','TLDR AI','https://tldr.tech/ai',null,'discovery',false),
 ('bens-bites','Ben’s Bites','https://www.bensbites.com/','https://www.bensbites.com/feed','discovery',true),
 ('superhuman','Superhuman AI','https://www.superhuman.ai/',null,'discovery',false),
 ('openai','OpenAI','https://openai.com/news/','https://openai.com/news/rss.xml','primary',true),
 ('anthropic','Anthropic','https://www.anthropic.com/news',null,'primary',false),
 ('google-ai','Google AI','https://blog.google/technology/ai/','https://blog.google/innovation-and-ai/technology/ai/rss/','primary',true),
 ('deepmind','Google DeepMind','https://deepmind.google/blog/','https://deepmind.google/blog/rss.xml','primary',true),
 ('meta','Meta AI','https://ai.meta.com/blog/',null,'primary',false),
 ('microsoft','Microsoft AI','https://blogs.microsoft.com/ai/','https://blogs.microsoft.com/ai/feed/','primary',false),
 ('nvidia','NVIDIA','https://blogs.nvidia.com/','https://blogs.nvidia.com/feed/','primary',true),
 ('mistral','Mistral AI','https://mistral.ai/news','https://mistral.ai/news/rss','primary',true),
 ('xai','xAI','https://x.ai/news',null,'primary',false),
 ('perplexity','Perplexity','https://www.perplexity.ai/hub',null,'primary',false),
 ('techcrunch','TechCrunch AI','https://techcrunch.com/category/artificial-intelligence/','https://techcrunch.com/category/artificial-intelligence/feed/','press',true),
 ('venturebeat','VentureBeat AI','https://venturebeat.com/category/ai/','https://venturebeat.com/category/ai/feed/','press',false),
 ('mit-review','MIT Technology Review','https://www.technologyreview.com/topic/artificial-intelligence/','https://www.technologyreview.com/feed/','press',true),
 ('ars-technica','Ars Technica','https://arstechnica.com/','https://feeds.arstechnica.com/arstechnica/index','press',true),
 ('wired','WIRED','https://www.wired.com/tag/artificial-intelligence/','https://www.wired.com/feed/tag/ai/latest/rss','press',true),
 ('the-batch','The Batch · DeepLearning.AI','https://www.deeplearning.ai/the-batch/','https://www.deeplearning.ai/the-batch/feed/','analysis',false),
 ('one-useful-thing','One Useful Thing · Ethan Mollick','https://www.oneusefulthing.org/','https://www.oneusefulthing.org/feed','analysis',true),
 ('import-ai','Import AI · Jack Clark','https://importai.substack.com/','https://importai.substack.com/feed','analysis',true),
 ('latent-space','Latent Space','https://www.latent.space/','https://www.latent.space/feed','analysis',true),
 ('interconnects','Interconnects · Nathan Lambert','https://www.interconnects.ai/','https://www.interconnects.ai/feed','analysis',true),
 ('ahead-of-ai','Ahead of AI · Sebastian Raschka','https://magazine.sebastianraschka.com/','https://magazine.sebastianraschka.com/feed','analysis',true),
 ('last-week-in-ai','Last Week in AI','https://lastweekin.ai/','https://lastweekin.ai/feed','analysis',true),
 ('ai-snake-oil','AI Snake Oil','https://www.aisnakeoil.com/','https://www.normaltech.ai/feed','analysis',true)
on conflict(id) do update set name=excluded.name,url=excluded.url,feed_url=excluded.feed_url,kind=excluded.kind,enabled=excluded.enabled;

commit;
