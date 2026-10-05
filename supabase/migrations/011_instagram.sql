create table if not exists public.instagram_posts (
 id uuid primary key default gen_random_uuid(),
 article_id uuid not null references public.articles(id),
 account_id text not null,
 radar_date date not null,
 slot smallint not null check (slot between 1 and 3),
 title text not null,
 caption text not null check (char_length(caption)<=2200),
 source_name text not null,
 cover_url text,
 status text not null default 'queued' check (status in ('queued','creating','processing','publishing','published','review','failed','cancelled')),
 image_url text,
 container_id text,
 media_id text,
 attempts integer not null default 0,
 last_error text,
 created_at timestamptz not null default now(),
 published_at timestamptz,
 unique(article_id,account_id),
 unique(account_id,radar_date,slot)
);
alter table public.instagram_posts enable row level security;
revoke all on public.instagram_posts from anon,authenticated;
grant all on public.instagram_posts to service_role;
create index if not exists instagram_posts_pending on public.instagram_posts(status,radar_date);
-- Only generated, public news artwork belongs here. Upload is server-only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('instagram-media','instagram-media',true,8000000,array['image/jpeg'])
on conflict(id) do nothing;
