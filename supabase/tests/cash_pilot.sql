-- Checks the cash pilot: asking for a seat without a card, no fee, no payment row.
begin;
create or replace function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000d', '970591111111'),
  ('00000000-0000-0000-0000-0000000000a1', '970592222222');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh', 'm', 'ar');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.act_as(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'ramallah', 'nablus', now() + interval '1 day', 3, 25);

-- 1. Cash is on and the fee is 0.
do $$ begin
  if not public.cash_only() then raise exception 'FAIL: cash_only should be on'; end if;
  if (select value from public.settings where key = 'service_fee_ils') <> 0 then raise exception 'FAIL: fee should be 0'; end if;
end $$;

-- 2. A passenger asks for a seat with no card: a normal request, no payment row.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.request_seat_cash('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  if (select status from public.bookings where passenger_id = '00000000-0000-0000-0000-0000000000a1') <> 'requested' then
    raise exception 'FAIL: booking should be requested';
  end if;
  if exists (select 1 from public.payments) then raise exception 'FAIL: cash makes no payment row'; end if;
end $$;

-- 3. The driver accepts as usual.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where passenger_id = '00000000-0000-0000-0000-0000000000a1';

-- 4. With cash switched off, the cash path is closed.
select pg_temp.act_as(null);
update public.settings set value = 0 where key = 'cash_only';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.request_seat_cash('00000000-0000-0000-0000-0000000000c1');
  raise exception 'FAIL: cash should be refused';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;

select 'All cash pilot checks passed' as result;
rollback;
