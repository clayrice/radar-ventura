-- Restore the image provenance for existing source photos whose URL is on the article's own host.
-- This keeps historical rows eligible for Instagram while leaving unrelated/unknown images untouched.
update public.articles
set cover_origin='article'
where cover_origin is null
  and nullif(trim(cover_url),'') is not null
  and nullif(trim(source_url),'') is not null
  and lower(split_part(split_part(cover_url,'/',3),':',1))
      = lower(split_part(split_part(source_url,'/',3),':',1));

update public.instagram_posts as p
set cover_origin=a.cover_origin
from public.articles as a
where p.article_id=a.id
  and p.cover_origin is null
  and a.cover_origin in ('feed','article')
  and p.cover_url=a.cover_url;
