-- Slice 15b: follow a checkpoint, and "how is it now?" as you pass one.
--
-- Follow: a commuter follows the checkpoints on their road. When the status everyone
-- sees (checkpoint_overview) changes, followers get one push. At most one push per
-- checkpoint every 10 minutes, so a checkpoint flipping back and forth doesn't buzz
-- phones all morning. Kind 'checkpoint_status' (the Checkpoint alerts switch).
--
-- Ask: while a trip is underway the driver's phone sends the car's position (slice 12).
-- When the car comes within about 800 m of a checkpoint, each passenger on board gets one
-- question: "Passing Atara? How is it now?". Passengers, never the driver, who is driving.
-- Once per passenger, trip and checkpoint; skipped when the checkpoint already has 3
-- reports in the last 15 minutes. Kind 'checkpoint_ask' (the "Ask me near checkpoints" switch).

-- ─── Follow ──────────────────────────────────────────────────────────────────
create table public.checkpoint_follows (
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  checkpoint_id  text not null references public.checkpoints (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, checkpoint_id)
);
alter table public.checkpoint_follows enable row level security;
create policy checkpoint_follows_read   on public.checkpoint_follows for select to authenticated using (user_id = auth.uid());
create policy checkpoint_follows_insert on public.checkpoint_follows for insert to authenticated with check (user_id = auth.uid());
create policy checkpoint_follows_delete on public.checkpoint_follows for delete to authenticated using (user_id = auth.uid());

-- The last status we told followers about.
create table public.checkpoint_announcements (
  checkpoint_id  text primary key references public.checkpoints (id) on delete cascade,
  status         public.checkpoint_status not null,
  announced_at   timestamptz not null default now()
);
alter table public.checkpoint_announcements enable row level security; -- server only

create or replace function public.checkpoint_status_word(p_status public.checkpoint_status, p_lang text)
returns text
language sql
immutable
as $$
  select case p_lang when 'ar' then
           case p_status when 'open' then 'مفتوح' when 'crowded' then 'مزدحم' else 'مغلق' end
         else
           case p_status when 'open' then 'open' when 'crowded' then 'crowded' else 'closed' end
         end;
$$;

create or replace function public.announce_checkpoint_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   public.checkpoint_status;
  v_last  checkpoint_announcements%rowtype;
  v_cp    checkpoints%rowtype;
  f       record;
begin
  select status into v_now from checkpoint_overview() where id = new.checkpoint_id;
  if v_now is null then
    return null;
  end if;
  select * into v_last from checkpoint_announcements where checkpoint_id = new.checkpoint_id;
  if found and (v_last.status = v_now or v_last.announced_at > now() - interval '10 minutes') then
    return null;  -- nothing new, or we told people very recently
  end if;
  insert into checkpoint_announcements (checkpoint_id, status, announced_at)
  values (new.checkpoint_id, v_now, now())
  on conflict (checkpoint_id) do update set status = excluded.status, announced_at = excluded.announced_at;

  select * into v_cp from checkpoints where id = new.checkpoint_id;
  for f in
    select cf.user_id, p.language as lang
      from checkpoint_follows cf join profiles p on p.id = cf.user_id
     where cf.checkpoint_id = new.checkpoint_id
       and cf.user_id is distinct from new.reporter_id  -- they know, they just said it
  loop
    perform send_push(
      f.user_id, 'checkpoint_status',
      case when f.lang = 'ar'
        then v_cp.name_ar || ': ' || checkpoint_status_word(v_now, 'ar')
        else v_cp.name_en || ': ' || checkpoint_status_word(v_now, 'en') end,
      case when f.lang = 'ar'
        then 'حسب آخر التقارير. اضغط لترى التفاصيل.'
        else 'From the latest reports. Tap for details.' end,
      '/checkpoints/' || new.checkpoint_id);
  end loop;
  return null;
end;
$$;
create trigger checkpoint_reports_announce
after insert on public.checkpoint_reports
for each row execute function public.announce_checkpoint_change();

-- ─── Ask as you pass ─────────────────────────────────────────────────────────
create table public.checkpoint_asks (
  trip_id        uuid not null references public.trips (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  checkpoint_id  text not null references public.checkpoints (id) on delete cascade,
  asked_at       timestamptz not null default now(),
  primary key (trip_id, user_id, checkpoint_id)
);
alter table public.checkpoint_asks enable row level security; -- server only

create or replace function public.ask_near_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c  record;
  p  record;
begin
  for c in
    -- Flat-earth distance is plenty at 800 m: 1° latitude ≈ 111 km, 1° longitude ≈ 94 km here.
    select * from checkpoints k
     where k.lat is not null and k.lng is not null
       and sqrt(power((k.lat - new.lat) * 111000, 2) + power((k.lng - new.lng) * 94000, 2)) < 800
       and (select count(*) from checkpoint_reports r
             where r.checkpoint_id = k.id and r.created_at > now() - interval '15 minutes') < 3
  loop
    for p in
      select b.passenger_id, pr.language as lang
        from bookings b join profiles pr on pr.id = b.passenger_id
       where b.trip_id = new.trip_id and b.status = 'accepted'
         and pr.ask_near_checkpoints
    loop
      insert into checkpoint_asks (trip_id, user_id, checkpoint_id) values (new.trip_id, p.passenger_id, c.id)
      on conflict do nothing;
      continue when not found;
      perform send_push(
        p.passenger_id, 'checkpoint_ask',
        case when p.lang = 'ar' then 'تمرّون من ' || c.name_ar || '؟' else 'Passing ' || c.name_en || '?' end,
        case when p.lang = 'ar' then 'كيف الوضع الآن؟ ضغطة واحدة تساعد الجميع.' else 'How is it now? One tap helps everyone.' end,
        '/checkpoints/' || c.id);
    end loop;
  end loop;
  return null;
end;
$$;
create trigger trip_positions_ask_checkpoint
after insert or update on public.trip_positions
for each row execute function public.ask_near_checkpoint();

revoke execute on function public.announce_checkpoint_change(), public.ask_near_checkpoint()
  from public, anon, authenticated;
