-- Reconcile confirmed publication across hosts. This function never publishes.
create function public.reconcile_radar_edition(edition_date date) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if (select count(*) from articles where status='published' and radar_date=edition_date)<>3 then return false; end if;
 if (select count(*) from articles where status='published' and radar_date=edition_date
  and nullif(trim(cover_url),'') is not null and cover_origin in ('feed','article'))<>3 then return false; end if;
 if not exists(select p.account_id from instagram_posts p join articles a on a.id=p.article_id
  where p.radar_date=edition_date and a.radar_date=edition_date and a.status='published' and p.status='published'
   and nullif(trim(p.image_url),'') is not null and p.cover_url=a.cover_url and a.cover_origin in ('feed','article')
  group by p.account_id having count(distinct p.article_id)=3) then return false; end if;
 update radar_editions set status='completed',last_reason='three_articles_and_posts_confirmed',updated_at=now(),
  metrics=metrics||jsonb_build_object('status','completed','reason','three_articles_and_posts_confirmed',
   'portal_published',3,'articles_with_images',3,'instagram_published',3,'completion_source','confirmed_database')
 where radar_date=edition_date and status<>'completed';
 return exists(select 1 from radar_editions where radar_date=edition_date and status='completed');
end;$$;
revoke all on function public.reconcile_radar_edition(date) from public,anon,authenticated;
grant execute on function public.reconcile_radar_edition(date) to service_role;
