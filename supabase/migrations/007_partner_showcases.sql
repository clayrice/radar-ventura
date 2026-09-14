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
