-- Slice 3a: live updates.
-- Supabase Realtime sends a message to the app whenever a row in a table in
-- this publication changes. It still applies Row Level Security, so a phone
-- only hears about bookings it is allowed to read (its own requests, or
-- requests on its own trips).
alter publication supabase_realtime add table public.bookings;
