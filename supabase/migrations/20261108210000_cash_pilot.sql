-- Cash pilot (Waleed, 7 Nov 2026): no card gateway and no service fee for now.
-- The passenger pays the driver in cash in the car. Booking rules stay the same
-- (driver accepts, deadlines, cancels, no-shows); only the money step is skipped.
--
-- Switch: settings.cash_only = 1 means cash. Set it to 0 (and the fee back) when a real
-- gateway arrives; request_seat() and the payments table are kept for that day.

insert into public.settings (key, value) values ('cash_only', 1)
on conflict (key) do update set value = excluded.value;
update public.settings set value = 0 where key = 'service_fee_ils';

create or replace function public.cash_only()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value = 1 from settings where key = 'cash_only'), false);
$$;
revoke execute on function public.cash_only() from public, anon;
grant execute on function public.cash_only() to authenticated;

-- Ask for a seat, paying cash to the driver: a booking with no payment row.
create or replace function public.request_seat_cash(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if not cash_only() then
    raise exception 'Cash payments are off';
  end if;
  perform set_config('rafiq.paying', 'on', true);
  insert into bookings (trip_id, passenger_id) values (p_trip_id, auth.uid())
  returning id into v_booking;
  perform set_config('rafiq.paying', 'off', true);
  return v_booking;
end;
$$;
revoke execute on function public.request_seat_cash(uuid) from public, anon;
grant execute on function public.request_seat_cash(uuid) to authenticated;

-- request_seat() (the pretend card) still works for tests; the app doesn't offer it while
-- cash_only is on.
