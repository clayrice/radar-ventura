alter table public.articles add column cover_url text check(cover_url is null or cover_url ~ '^https://');
alter table public.articles add column cover_caption text check(char_length(cover_caption)<=500);
alter table public.articles add column cover_credit text check(char_length(cover_credit)<=300);
grant select(cover_url,cover_caption,cover_credit) on public.articles to anon,authenticated;
