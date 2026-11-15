-- STAGING ONLY. Run by .github/workflows/staging-database.yml (never point this at live).

-- TEST DATA: give about 80% of visible checkpoints a status, in a mix of states.
-- Safe to run again any time (statuses fade after 2 hours, so re-run to refresh).
-- Each picked checkpoint lands in one of these states:
--   confirmed  (40%): 2-3 different reporters agree within the last 25 minutes
--   single     (25%): one report in the last 30 minutes ("not confirmed yet")
--   disputed   (10%): two reporters disagree in the last 30 minutes
--   older      (25%): one report 40-110 minutes ago (shown, but stale)
-- Status mix: about 55% open, 25% crowded, 20% closed. Huwara is always confirmed closed,
-- so the "closed checkpoint on your way" flow can be tested on Ramallah-Nablus.
-- One report, written as the server (so the 5-minute limit doesn't apply).
-- Reporter 0-3 = the four test accounts, 4-5 = two pretend public channels.
create or replace function pg_temp.report(p_cp text, p_status public.checkpoint_status, p_who int, p_ago interval, p_people uuid[])
returns void language sql as $f$
  insert into public.checkpoint_reports (checkpoint_id, status, reporter_id, source, channel_ref, created_at)
  values (
    p_cp, p_status,
    case when p_who < 4 then p_people[p_who + 1] end,
    case when p_who >= 4 then 'channel' when random() < 0.4 then 'driver' else 'passenger' end,
    case when p_who >= 4 then 'test_channel_' || p_who || '/' || gen_random_uuid() end,
    now() - p_ago
  );
$f$;

do $$
declare
  people uuid[] := array[
    '71443aaf-e54d-44b9-9e7e-8ce3728c07de',  -- Ahmad
    '7493831f-8353-4072-89a3-eb5eef6f4d9f',  -- Waleed
    'bf9efa01-e6ca-40dc-92c0-8adb52676158',  -- Manar
    '50c08146-76e0-4958-bbdd-124844886957'   -- Sara
  ]::uuid[];
  c record;
  st public.checkpoint_status;
  other public.checkpoint_status;
  roll float;
  n int;
  i int;
  who int;
  ago interval;
begin
  for c in
    select id from checkpoints where hidden_at is null
     order by random()
     limit (select ceil(count(*) * 0.8) from checkpoints where hidden_at is null)
  loop
    roll := random();
    st := case when roll < 0.55 then 'open' when roll < 0.80 then 'crowded' else 'closed' end;
    if c.id = 'huwara' then st := 'closed'; end if;
    roll := case when c.id = 'huwara' then 0 else random() end;
    who := floor(random() * 6)::int;  -- start somewhere in the reporter pool

    if roll < 0.40 then                       -- confirmed
      n := 2 + floor(random() * 2)::int;
      for i in 0 .. n - 1 loop
        ago := make_interval(mins => 2 + floor(random() * 23)::int);
        perform pg_temp.report(c.id, st, (who + i) % 6, ago, people);
      end loop;
    elsif roll < 0.65 then                    -- single fresh report
      perform pg_temp.report(c.id, st, who, make_interval(mins => 1 + floor(random() * 28)::int), people);
    elsif roll < 0.75 then                    -- disputed
      other := case st when 'open' then 'crowded' when 'crowded' then 'closed' else 'open' end;
      perform pg_temp.report(c.id, st, who, make_interval(mins => 5 + floor(random() * 10)::int), people);
      perform pg_temp.report(c.id, other, (who + 1) % 6, make_interval(mins => 15 + floor(random() * 10)::int), people);
    else                                      -- older, single
      perform pg_temp.report(c.id, st, who, make_interval(mins => 40 + floor(random() * 70)::int), people);
    end if;
  end loop;
end $$;
