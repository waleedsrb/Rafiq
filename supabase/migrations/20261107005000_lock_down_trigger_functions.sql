-- Trigger functions only ever run from their triggers. Postgres lets every role
-- EXECUTE new functions by default, which exposes them under /rest/v1/rpc/.
-- They can't do anything useful when called that way, but we close the door anyway.
-- (Flagged by the Supabase security advisor.)
revoke execute on function public.guard_booking() from public, anon, authenticated;
revoke execute on function public.log_booking_event() from public, anon, authenticated;
