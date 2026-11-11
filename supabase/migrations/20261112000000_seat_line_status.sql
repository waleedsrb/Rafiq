-- Seat holds, part 1 of 2: a new booking status for riders waiting in line.
--
-- 'queued' = every seat is held (requested or accepted), so this rider waits in a short
-- line. The driver doesn't see the line. When a held seat opens (declined, expired,
-- cancelled), the first rider in line moves up to 'requested' on their own.
--
-- Its own file because Postgres can't use a new enum value in the same transaction
-- that adds it (paste this one first, then part 2).
alter type public.booking_status add value if not exists 'queued' after 'requested';
