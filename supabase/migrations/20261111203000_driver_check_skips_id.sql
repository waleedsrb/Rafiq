-- Driver check: don't ask for the ID photo twice.
--
-- Until now a driver check always needed three photos (ID, licence, car), even when the
-- person's ID was already approved as a passenger. Now, if the ID is verified, a driver
-- check needs only the licence and car photos. Someone whose ID isn't verified yet still
-- sends all three, and approving that check verifies the ID too (review_verification
-- is unchanged).
--
-- Same function as in 20261107080000_verification.sql; only the photo count rule changed.

create or replace function public.check_verification_request()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p text;
  v_id_ok boolean;
  v_need int;
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
    select id_verified_at is not null into v_id_ok from profiles where id = new.user_id;
    v_need := case when coalesce(v_id_ok, false) then 2 else 3 end;
    if coalesce(array_length(new.photos, 1), 0) <> v_need then
      raise exception '%', case when v_need = 2
        then 'A driver check needs licence and car photos'
        else 'A driver check needs ID, licence and car photos' end;
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

revoke execute on function public.check_verification_request() from public, anon, authenticated;
