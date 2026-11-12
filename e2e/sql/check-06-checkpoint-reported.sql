-- After flow 06: Dana's report is in, and counts as a driver's (her trip is underway).
do $$
declare r record;
begin
  select * into r from public.checkpoint_reports
   where reporter_id = '00000000-0000-0000-0000-0000000e2e01' order by created_at desc limit 1;
  if r is null then raise exception 'CHECK 06: Dana''s checkpoint report is missing'; end if;
  if r.checkpoint_id <> 'zaatara' or r.status::text <> 'closed' then
    raise exception 'CHECK 06: expected zaatara closed, got % %', r.checkpoint_id, r.status;
  end if;
  if r.source::text <> 'driver' then raise exception 'CHECK 06: expected a driver report, got %', r.source; end if;
  raise notice 'CHECK 06 ok: Zaatara reported closed by a driver';
end $$;
