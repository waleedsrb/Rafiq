-- Deleting your account failed with "Gender is confirmed from your ID" once your ID
-- check was approved: delete_my_account() clears gender, and guard_verified_columns()
-- refuses that for a person whose gender is confirmed. Deleting is allowed to wipe it,
-- so the function flags itself the same way an admin review does (rafiq.reviewing),
-- only for that one update, then switches the flag off again.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t  record;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  perform delete_my_account_check();

  -- 1. Close what is still open, through the normal rules, so refunds and
  --    the other side's pushes happen exactly as if they had cancelled by hand.
  for t in select id from trips
            where driver_id = me and cancelled_at is null and started_at is null and departs_at > now() loop
    perform cancel_trip(t.id);
  end loop;
  update bookings b set status = 'cancelled'
   where b.passenger_id = me and b.status in ('requested', 'accepted')
     and exists (select 1 from trips tr where tr.id = b.trip_id and tr.started_at is null and tr.departs_at > now());

  -- 2. Forget the person.
  delete from push_tokens    where user_id = me;
  delete from notifications  where user_id = me;
  delete from driver_details where driver_id = me;
  delete from admins         where user_id = me;
  -- ID checks: the app deletes the photo files from storage first (SQL may not delete
  -- stored files); here go the records, and the files' link to the sign-in.
  delete from verifications  where user_id = me;
  begin
    update storage.objects set owner = null where owner = me;
  exception when others then
    null; -- older/newer storage schemas differ; nothing to unlink then
  end;
  perform set_config('rafiq.reviewing', 'on', true);
  update profiles set
    full_name       = 'Former member',
    gender          = null,
    emergency_name  = null,
    emergency_phone = null,
    auto_share      = false,
    deleted_at      = now()
  where id = me;
  perform set_config('rafiq.reviewing', 'off', true);

  -- 3. Delete the sign-in. The app signs out right after.
  delete from auth.users where id = me;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
