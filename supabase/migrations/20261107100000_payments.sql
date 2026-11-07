-- Slice 6: payments, with a pretend gateway first.
--
-- The money follows the booking rules (product topic 3):
--   request a seat  -> the card is HELD (fare + service fee)
--   driver accepts  -> the hold is CHARGED
--   declined / expired / withdrawn -> the hold is RELEASED (nothing was taken)
--   cancelled in time, or the driver cancels the trip -> REFUNDED
--   cancelled late, or no-show -> stays charged (that is the "certainty" promise)
-- Paying drivers out after the trip comes later; for now the ledger is this table.
--
-- Only provider 'fake' exists. It accepts tokens made by the app's pretend card form
-- (src/lib/payments.ts). A real gateway will replace authorize/charge/refund with calls
-- from a server function, writing to this same table, so the rules below stay.

-- ─── Settings the owner can change in the dashboard ─────────────────────────
create table public.settings (
  key    text primary key,
  value  numeric not null
);
alter table public.settings enable row level security;
create policy settings_read on public.settings for select to authenticated using (true);
-- Placeholder until the business model numbers are decided: a flat fee per seat.
insert into public.settings (key, value) values ('service_fee_ils', 2);

-- ─── Payments ────────────────────────────────────────────────────────────────
create type public.payment_status as enum ('held', 'charged', 'released', 'refunded');

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null unique references public.bookings (id) on delete cascade,
  passenger_id  uuid not null references public.profiles (id) on delete cascade,
  provider      text not null default 'fake',
  provider_ref  text not null,            -- the gateway's id for this hold
  card_brand    text not null,
  card_last4    text not null check (card_last4 ~ '^[0-9]{4}$'),
  fare_ils      numeric(8, 2) not null check (fare_ils >= 0),   -- goes to the driver
  fee_ils       numeric(8, 2) not null check (fee_ils >= 0),    -- Rafiq's service fee
  total_ils     numeric(8, 2) generated always as (fare_ils + fee_ils) stored,
  status        public.payment_status not null default 'held',
  held_at       timestamptz not null default now(),
  charged_at    timestamptz,
  released_at   timestamptz,
  refunded_at   timestamptz
);
create index payments_passenger_idx on public.payments (passenger_id);

-- Passengers see their own payments. Nobody writes directly: request_seat() and the
-- booking trigger below are the only ways in.
alter table public.payments enable row level security;
create policy payments_read_own on public.payments for select to authenticated
  using (passenger_id = auth.uid());

-- ─── Request a seat = hold the card + create the booking, together ───────────
-- One transaction: if the card is declined, no booking exists; if the booking is
-- refused (full, not verified, ...), no hold exists.
create or replace function public.request_seat(
  p_trip_id    uuid,
  p_card_token text,
  p_card_brand text,
  p_card_last4 text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking  uuid;
  v_price    numeric;
  v_fee      numeric;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  -- The pretend gateway. 'tok_fake_decline' plays a declined card.
  if p_card_token = 'tok_fake_decline' then
    raise exception 'Your card was declined';
  end if;
  if p_card_token is null or p_card_token !~ '^tok_fake_[A-Za-z0-9]+$' then
    raise exception 'Unknown card';
  end if;

  perform set_config('rafiq.paying', 'on', true);
  insert into bookings (trip_id, passenger_id) values (p_trip_id, auth.uid())
  returning id into v_booking;
  perform set_config('rafiq.paying', 'off', true);

  select t.price_ils * b.seats into v_price
    from bookings b join trips t on t.id = b.trip_id where b.id = v_booking;
  select value * (select seats from bookings where id = v_booking) into v_fee
    from settings where key = 'service_fee_ils';

  insert into payments (booking_id, passenger_id, provider_ref, card_brand, card_last4, fare_ils, fee_ils)
  values (v_booking, auth.uid(), 'fake_' || replace(gen_random_uuid()::text, '-', ''),
          p_card_brand, p_card_last4, v_price, coalesce(v_fee, 0));
  return v_booking;
end;
$$;
revoke execute on function public.request_seat(uuid, text, text, text) from public, anon;
grant execute on function public.request_seat(uuid, text, text, text) to authenticated;

-- A signed-in person can't create a booking without going through request_seat().
-- (The server, with no signed-in user, still can: tests, admin fixes.)
create or replace function public.require_payment_hold()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and coalesce(current_setting('rafiq.paying', true), '') <> 'on' then
    raise exception 'Pay for the seat to request it';
  end if;
  return new;
end;
$$;
create trigger bookings_require_payment
before insert on public.bookings
for each row execute function public.require_payment_hold();
revoke execute on function public.require_payment_hold() from public, anon, authenticated;

-- ─── The money follows the booking ───────────────────────────────────────────
create or replace function public.settle_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_cancelled boolean;
  v_by_driver      boolean;
begin
  if new.status = old.status then
    return null;
  end if;

  if new.status = 'accepted' then
    update payments set status = 'charged', charged_at = now()
     where booking_id = new.id and status = 'held';

  elsif old.status = 'requested' and new.status in ('declined', 'expired', 'cancelled') then
    update payments set status = 'released', released_at = now()
     where booking_id = new.id and status = 'held';

  elsif old.status = 'accepted' and new.status = 'cancelled' then
    select cancelled_at is not null, driver_id = auth.uid()
      into v_trip_cancelled, v_by_driver
      from trips where id = new.trip_id;
    -- The driver cancelling (the trip or this seat), or the passenger cancelling in time: full refund.
    if v_trip_cancelled or coalesce(v_by_driver, false) or not coalesce(new.cancelled_late, false) then
      update payments set status = 'refunded', refunded_at = now()
       where booking_id = new.id and status = 'charged';
    end if;
  end if;
  -- completed, no_show and late cancels keep the charge.
  return null;
end;
$$;
create trigger bookings_settle_payment
after update of status on public.bookings
for each row execute function public.settle_payment();
revoke execute on function public.settle_payment() from public, anon, authenticated;
