-- Storage buckets for HalalBasket.
--   avatars           public read  (profile photos)
--   listing-images    public read  (menu / product photos)
--   verification-docs private       (licences, permits, IDs)
-- NOTE: verification-docs policies below are demo-grade — any authenticated
-- user may read them so both upload and admin signed-URL review work without
-- the clerk_id↔user_id path join. Tighten before production.

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('listing-images', 'listing-images', true),
  ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

-- avatars: public read, authenticated write
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars auth write" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');
create policy "avatars auth update" on storage.objects
  for update to authenticated using (bucket_id = 'avatars');

-- listing-images: public read, authenticated write
create policy "listing images public read" on storage.objects
  for select using (bucket_id = 'listing-images');
create policy "listing images auth write" on storage.objects
  for insert to authenticated with check (bucket_id = 'listing-images');
create policy "listing images auth update" on storage.objects
  for update to authenticated using (bucket_id = 'listing-images');

-- verification-docs: authenticated read + write (demo-grade; see note above)
create policy "verification docs auth read" on storage.objects
  for select to authenticated using (bucket_id = 'verification-docs');
create policy "verification docs auth write" on storage.objects
  for insert to authenticated with check (bucket_id = 'verification-docs');
create policy "verification docs auth update" on storage.objects
  for update to authenticated using (bucket_id = 'verification-docs');
