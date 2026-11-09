-- Profile photos (optional for now, with switches to change that later).
--
-- profiles.avatar_path: the photo's path in the private "avatars" bucket ("<user id>/avatar-<time>.jpg").
-- The path alone shows nothing; who may actually open the photo is decided by can_see_avatar()
-- in the storage policy below, so the rule lives in one place.
--
-- Two switches in settings (both start at 0):
--   profile_photo_required       1 = a photo is needed before booking a seat or posting a trip.
--   profile_photo_before_accept  1 = anyone signed in can see photos (search, requests).
--                                0 = only the two people on an accepted booking can (like phone and plate).
-- You, and admins comparing it with the ID photo, can always see your own.

-- ─── The column ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists avatar_path text
  check (avatar_path is null or avatar_path like id::text || '/%');

-- ─── The switches ───────────────────────────────────────────────────────────
insert into public.settings (key, value) values
  ('profile_photo_required', 0),
  ('profile_photo_before_accept', 0)
on conflict (key) do nothing;

create or replace function public.setting_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value = 1 from settings where key = p_key), false);
$$;
revoke execute on function public.setting_on(text) from public, anon;
grant execute on function public.setting_on(text) to authenticated;

-- ─── Who can see whose photo ────────────────────────────────────────────────
create or replace function public.can_see_avatar(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_owner = auth.uid()
      or public.is_admin()
      or public.setting_on('profile_photo_before_accept')
      or exists (
           select 1
             from bookings b
             join trips t on t.id = b.trip_id
            where b.status in ('accepted', 'completed', 'no_show')
              and (   (b.passenger_id = auth.uid() and t.driver_id = p_owner)
                   or (t.driver_id = auth.uid() and b.passenger_id = p_owner))
         );
$$;
revoke execute on function public.can_see_avatar(uuid) from public, anon;
grant execute on function public.can_see_avatar(uuid) to authenticated;

-- ─── The bucket ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

-- Your own folder only: add, replace and remove your photo.
create policy avatars_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_see_avatar(((storage.foldername(name))[1])::uuid));

-- ─── "Photo required" (only when the switch is on) ──────────────────────────
create or replace function public.require_profile_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid;
begin
  -- Separate statements: NEW has passenger_id only on bookings, driver_id only on trips.
  if tg_table_name = 'bookings' then
    v_person := new.passenger_id;
  else
    v_person := new.driver_id;
  end if;
  -- Trips made by the weekly repeat job (no signed-in person) are not blocked.
  if auth.uid() is null or v_person <> auth.uid() then
    return new;
  end if;
  if public.setting_on('profile_photo_required')
     and not exists (select 1 from profiles where id = v_person and avatar_path is not null) then
    raise exception 'Add a profile photo first';
  end if;
  return new;
end;
$$;
revoke execute on function public.require_profile_photo() from public, anon, authenticated;

create trigger bookings_require_photo
before insert on public.bookings
for each row execute function public.require_profile_photo();

create trigger trips_require_photo
before insert on public.trips
for each row execute function public.require_profile_photo();
