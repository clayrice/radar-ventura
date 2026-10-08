-- Validate persisted facts rather than trusting worker metrics.
create function public.enforce_radar_completion() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.status='completed' then
  if (select count(*) from articles where status='published' and radar_date=new.radar_date)<>3 then
   raise exception 'publication_articles_missing';
  end if;
  if (select count(*) from articles where status='published' and radar_date=new.radar_date and nullif(trim(cover_url),'') is not null)<2 then
   raise exception 'publication_images_missing';
  end if;
  if not exists (
   select p.account_id from instagram_posts p join articles a on a.id=p.article_id
   where p.radar_date=new.radar_date and a.radar_date=new.radar_date and a.status='published'
    and p.status='published' and nullif(trim(p.image_url),'') is not null
   group by p.account_id having count(distinct p.article_id)=3
  ) then raise exception 'publication_instagram_missing'; end if;
 end if;
 return new;
end;$$;
create trigger radar_completion before insert or update on public.radar_editions
 for each row execute function public.enforce_radar_completion();

-- NOT VALID preserves historical rows while enforcing the rule on future writes.
alter table public.instagram_posts add constraint instagram_requires_art
 check(status not in ('creating','processing','publishing','published') or nullif(trim(image_url),'') is not null) not valid;

-- Recheck today's previously completed edition; do not republish historical backlogs.
update public.radar_editions e set status='pending',last_reason='image_policy_recheck',next_attempt_at=now()
where radar_date=(now() at time zone 'America/Sao_Paulo')::date and status='completed';
