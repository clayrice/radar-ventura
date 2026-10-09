-- Every current/future Radar article must carry an image from its own feed or article page.
alter table public.articles add column if not exists cover_origin text;
alter table public.articles add column if not exists image_attempts smallint not null default 0;
alter table public.articles add constraint articles_cover_origin_valid
 check(cover_origin is null or cover_origin in ('feed','article')) not valid;

create or replace function public.enforce_source_article_cover() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.status='published' and new.radar_date >= (now() at time zone 'America/Sao_Paulo')::date
   and (nullif(trim(new.cover_url),'') is null or new.cover_origin is null or new.cover_origin not in ('feed','article')) then
  raise exception 'publication_source_image_missing';
 end if;
 return new;
end;$$;
create trigger articles_require_source_image before insert or update on public.articles
 for each row execute function public.enforce_source_article_cover();

create or replace function public.enforce_radar_completion() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.status='completed' then
  if (select count(*) from articles where status='published' and radar_date=new.radar_date)<>3 then
   raise exception 'publication_articles_missing';
  end if;
  if (select count(*) from articles where status='published' and radar_date=new.radar_date
      and nullif(trim(cover_url),'') is not null and cover_origin in ('feed','article'))<>3 then
   raise exception 'publication_images_missing';
  end if;
  if not exists (
   select p.account_id from instagram_posts p join articles a on a.id=p.article_id
   where p.radar_date=new.radar_date and a.radar_date=new.radar_date and a.status='published'
    and p.status='published' and nullif(trim(p.image_url),'') is not null
    and nullif(trim(p.cover_url),'') is not null and p.cover_url=a.cover_url
    and a.cover_origin in ('feed','article')
   group by p.account_id having count(distinct p.article_id)=3
  ) then raise exception 'publication_instagram_missing'; end if;
 end if;
 return new;
end;$$;

alter table public.instagram_posts add column if not exists cover_origin text;
alter table public.instagram_posts add constraint instagram_source_image_required
 check(status not in ('queued','creating','processing','publishing','published')
       or (nullif(trim(cover_url),'') is not null and cover_origin is not null and cover_origin in ('feed','article'))) not valid;

-- Current-day rows are retried using source article metadata; historic editions stay untouched.
update public.radar_editions set status='pending',last_reason='source_image_policy_recheck',next_attempt_at=now()
where radar_date=(now() at time zone 'America/Sao_Paulo')::date and status='completed';
