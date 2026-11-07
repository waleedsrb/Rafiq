-- Slice 5: ID checks and an admin review.
--
-- Passengers upload a photo of their ID before their first booking.
-- Drivers upload ID, licence and a car photo before their first trip.
-- An admin looks at the photos and approves or rejects (with a reason).
-- The database, not the app, refuses bookings and trips from people who aren't verified,
-- so an old app version or a hand-made request can't skip the check.

-- ─── Admins ──────────────────────────────────────────────────────────────────
create table public.admins (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  added_at  timestamptz not null default now()
);
-- No policies: nobody reads or writes this table through the API.
-- Admins are added by hand in the dashboard / SQL editor.
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ─── Verified flags ──────────────────────────────────────────────────────────
alter table public.profiles add column id_verified_at timestamptz;
alter table public.driver_details add column verified_at timestamptz;

-- People can edit their own profile and car, but never mark themselves verified.
-- Only review_verification() may change these columns: it sets a flag for the
-- length of its transaction ("rafiq.reviewing"), which this guard checks.
create or replace function public.guard_verified_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reviewing boolean := coalesce(current_setting('rafiq.reviewing', true), '') = 'on';
  server    boolean := auth.uid() is null;   -- dashboard, cron, migrations
begin
  if reviewing or server then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    if tg_op = 'INSERT' then
      new.id_verified_at := null;
    elsif new.id_verified_at is distinct from old.id_verified_at then
      raise exception 'Verification is set by a reviewer';
    end if;
  else -- driver_details
    if tg_op = 'INSERT' then
      new.verified_at := null;
    elsif new.verified_at is distinct from old.verified_at then
      raise exception 'Verification is set by a reviewer';
    elsif new.car_model is distinct from old.car_model
       or new.car_color is distinct from old.car_color
       or new.plate     is distinct from old.plate then
      -- A different car needs a new look.
      new.verified_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_verified
before insert or update on public.profiles
for each row execute function public.guard_verified_columns();

create trigger driver_details_guard_verified
before insert or update on public.driver_details
for each row execute function public.guard_verified_columns();

revoke execute on function public.guard_verified_columns() from public, anon, authenticated;

-- ─── Verification requests ───────────────────────────────────────────────────
create table public.verifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           text not null check (kind in ('passenger', 'driver')),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Paths inside the private "verification" storage bucket, always under "<user_id>/".
  -- passenger: [id]; driver: [id, licence, car]
  photos         text[] not null,
  reject_reason  text check (reject_reason is null or length(trim(reject_reason)) between 2 and 200),
  submitted_at   timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.profiles (id)
);
create index verifications_pending_idx on public.verifications (submitted_at) where status = 'pending';
-- At most one open request per person and kind.
create unique index verifications_one_pending on public.verifications (user_id, kind) where status = 'pending';

alter table public.verifications enable row level security;
create policy verifications_read on public.verifications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy verifications_insert on public.verifications for insert to authenticated
  with check (user_id = auth.uid());
-- No update/delete policies: decisions go through review_verification().

create or replace function public.check_verification_request()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p text;
begin
  new.status := 'pending';
  new.reject_reason := null;
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.submitted_at := now();

  if new.kind = 'passenger' and coalesce(array_length(new.photos, 1), 0) <> 1 then
    raise exception 'A passenger check needs one ID photo';
  end if;
  if new.kind = 'driver' then
    if coalesce(array_length(new.photos, 1), 0) <> 3 then
      raise exception 'A driver check needs ID, licence and car photos';
    end if;
    if not exists (select 1 from driver_details where driver_id = new.user_id) then
      raise exception 'Add your car before asking for a driver check';
    end if;
  end if;
  foreach p in array new.photos loop
    if p is null or p not like new.user_id::text || '/%' then
      raise exception 'Photos must be your own uploads';
    end if;
  end loop;
  return new;
end;
$$;

create trigger verifications_check
before insert on public.verifications
for each row execute function public.check_verification_request();
revoke execute on function public.check_verification_request() from public, anon, authenticated;

-- The admin's decision. Approving a driver check also verifies their ID.
create or replace function public.review_verification(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if not is_admin() then
    raise exception 'Only admins can review';
  end if;
  select * into v from verifications where id = p_id for update;
  if not found or v.status <> 'pending' then
    raise exception 'This request is not waiting for review';
  end if;
  if not p_approve and (p_reason is null or length(trim(p_reason)) < 2) then
    raise exception 'Say why it was rejected';
  end if;

  perform set_config('rafiq.reviewing', 'on', true);
  update verifications
     set status = case when p_approve then 'approved' else 'rejected' end,
         reject_reason = case when p_approve then null else trim(p_reason) end,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_id;
  if p_approve then
    update profiles set id_verified_at = coalesce(id_verified_at, now()) where id = v.user_id;
    if v.kind = 'driver' then
      update driver_details set verified_at = now() where driver_id = v.user_id;
    end if;
  end if;
  perform set_config('rafiq.reviewing', 'off', true);
end;
$$;
revoke execute on function public.review_verification(uuid, boolean, text) from public, anon;
grant execute on function public.review_verification(uuid, boolean, text) to authenticated;

-- ─── Rules: verified before booking or driving ──────────────────────────────
create or replace function public.require_verified_passenger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = new.passenger_id and id_verified_at is not null) then
    raise exception 'Verify your ID before booking';
  end if;
  return new;
end;
$$;
create trigger bookings_require_verified
before insert on public.bookings
for each row execute function public.require_verified_passenger();
revoke execute on function public.require_verified_passenger() from public, anon, authenticated;

create or replace function public.require_car()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified timestamptz;
begin
  select verified_at into v_verified from driver_details where driver_id = new.driver_id;
  if not found then
    raise exception 'Add your car before posting a trip';
  end if;
  if v_verified is null then
    raise exception 'Your driver check is not approved yet';
  end if;
  return new;
end;
$$;

-- ─── Private photo storage ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('verification', 'verification', false)
on conflict (id) do nothing;

-- Files live under "<your user id>/...". You can add and see your own; admins can see all.
create policy verification_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);
create policy verification_read on storage.objects for select to authenticated
  using (bucket_id = 'verification' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy verification_delete on storage.objects for delete to authenticated
  using (bucket_id = 'verification' and public.is_admin());

-- ─── Search shows who is verified ────────────────────────────────────────────
drop function public.search_trips(public.city, public.city, timestamptz, timestamptz);

create function public.search_trips(
  p_origin public.city,
  p_destination public.city,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  id uuid,
  departs_at timestamptz,
  seats_total int,
  seats_left int,
  price_ils numeric,
  driver_first_name text,
  driver_last_initial text,
  car_model text,
  driver_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.departs_at,
    t.seats_total,
    t.seats_total - coalesce((
      select sum(b.seats)::int from bookings b
      where b.trip_id = t.id and b.status = 'accepted'
    ), 0) as seats_left,
    t.price_ils,
    split_part(p.full_name, ' ', 1) as driver_first_name,
    case when position(' ' in trim(p.full_name)) > 0
         then left(regexp_replace(trim(p.full_name), '^.*\s', ''), 1)
         else '' end as driver_last_initial,
    d.car_model,
    d.verified_at is not null as driver_verified
  from trips t
  join profiles p on p.id = t.driver_id
  left join driver_details d on d.driver_id = t.driver_id
  where t.origin = p_origin
    and t.destination = p_destination
    and t.departs_at >= greatest(p_from, now())
    and t.departs_at < p_to
    and t.cancelled_at is null
    and t.driver_id <> auth.uid()          -- don't show me my own trips
  order by t.departs_at;
$$;

revoke execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) to authenticated;
