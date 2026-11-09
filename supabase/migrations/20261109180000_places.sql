-- Places and checkpoints across the whole West Bank (step 1 of taking Rafiq beyond
-- Ramallah and Nablus). Additive only: nothing existing changes meaning.
--
-- places: every city, town, village and neighbourhood OpenStreetMap knows around the West
-- Bank, with a region. Only 'west_bank' places can be picked for a trip; the app shows the
-- others in search, flagged, so people understand why they can't go there:
--   settlement  an Israeli settlement inside the West Bank
--   jerusalem   East Jerusalem (needs a permit)
--   outside     Israel or Jordan
-- The rows come from 20261109190000_places_seed.sql (generated, see scripts/map-data).
--
-- checkpoints get a kind, where the row came from, and the governorate. road_order stays
-- for the four on the Ramallah - Nablus road and is null for the rest.

create table public.places (
  id           text primary key,                 -- 'osm-n246843686'
  kind         text not null check (kind in ('city', 'town', 'village', 'hamlet', 'suburb')),
  name_ar      text not null,
  name_en      text not null,
  lat          numeric(9, 6) not null,
  lng          numeric(9, 6) not null,
  governorate  text,                             -- English OSM name, null outside the West Bank
  region       text not null check (region in ('west_bank', 'settlement', 'jerusalem', 'outside')),
  population   int
);
alter table public.places enable row level security;
create policy places_read on public.places for select to authenticated using (true);

-- Folds the spellings people type into one: Arabic letter variants (أ إ آ ٱ -> ا, ة -> ه,
-- ى -> ي, ؤ -> و, ئ -> ي), no diacritics or tatweel, lower case, no punctuation.
create or replace function public.fold_name(s text) returns text
language sql immutable parallel safe as $$
  select trim(regexp_replace(
    translate(lower(coalesce(s, '')),
      'أإآٱةىؤئ' || 'ًٌٍَُِّْـ' || '''`-.,()',
      'ااااهيوي'),
    '\s+', ' ', 'g'))
$$;

alter table public.places add column search_key text
  generated always as (public.fold_name(name_ar) || ' | ' || public.fold_name(name_en)) stored;
create index places_region_idx on public.places (region);

-- Place search for every "where" field. Best matches first: the name starts with what you
-- typed, then a word in it does, then it contains it. Towns before villages, then closer to
-- you (when the app knows where you are), then bigger. Up to p_limit West Bank places, plus up to 3
-- flagged ones (settlement, jerusalem, outside) for the app to show at the end.
create or replace function public.search_places(p_q text, p_lat numeric default null, p_lng numeric default null, p_limit int default 12)
returns table (
  id text, kind text, name_ar text, name_en text, governorate text, region text,
  lat numeric, lng numeric, distance_km numeric
)
language sql stable security invoker set search_path = public as $$
  with q as (select public.fold_name(p_q) as q),
  hits as (
    select p.*,
      case
        when p.search_key like q.q || '%' or p.search_key like '%| ' || q.q || '%' then 0
        when p.search_key like '% ' || q.q || '%' then 1
        else 2
      end as rank,
      case p.kind when 'city' then 0 when 'town' then 1 when 'village' then 2 when 'suburb' then 3 else 4 end as size,
      case when p_lat is null or p_lng is null then null
        else round((sqrt(power((p.lat - p_lat) * 111.0, 2) + power((p.lng - p_lng) * 94.5, 2)))::numeric, 1)
      end as dist
    from public.places p, q
    where length(q.q) >= 1 and p.search_key like '%' || q.q || '%'
  ),
  ranked as (
    select h.*, row_number() over (
      partition by (h.region = 'west_bank')
      order by h.rank, h.size, h.dist nulls last, h.population desc nulls last, h.name_en
    ) as n
    from hits h
  )
  select r.id, r.kind, r.name_ar, r.name_en, r.governorate, r.region, r.lat, r.lng, r.dist
  from ranked r
  where (r.region = 'west_bank' and r.n <= greatest(1, least(p_limit, 50))) or (r.region <> 'west_bank' and r.n <= 3)
  order by (r.region <> 'west_bank'), r.rank, r.size, r.dist nulls last, r.population desc nulls last, r.name_en
$$;
revoke execute on function public.search_places(text, numeric, numeric, int) from public, anon;
grant execute on function public.search_places(text, numeric, numeric, int) to authenticated;

-- The place you are in or nearest to ("Use my location · Al-Bireh"), any region, so the app
-- can also tell you when your location is outside the West Bank.
create or replace function public.place_near(p_lat numeric, p_lng numeric)
returns table (id text, kind text, name_ar text, name_en text, governorate text, region text, lat numeric, lng numeric, distance_km numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, p.kind, p.name_ar, p.name_en, p.governorate, p.region, p.lat, p.lng,
    round((sqrt(power((p.lat - p_lat) * 111.0, 2) + power((p.lng - p_lng) * 94.5, 2)))::numeric, 1)
  from public.places p
  where p.kind in ('city', 'town', 'village', 'suburb')
    and p.lat between p_lat - 0.2 and p_lat + 0.2 and p.lng between p_lng - 0.2 and p_lng + 0.2
  -- A neighbourhood only wins when it is clearly closer than the town around it.
  order by sqrt(power((p.lat - p_lat) * 111.0, 2) + power((p.lng - p_lng) * 94.5, 2))
         + case when p.kind = 'suburb' then 1.5 else 0 end
  limit 1
$$;
revoke execute on function public.place_near(numeric, numeric) from public, anon;
grant execute on function public.place_near(numeric, numeric) to authenticated;

-- Checkpoints: kind, source and governorate. The four we placed by hand stay as they are.
alter table public.checkpoints alter column road_order drop not null;
alter table public.checkpoints
  add column kind text not null default 'checkpoint'
    check (kind in ('checkpoint', 'partial', 'gate', 'roadblock', 'earthmound', 'crossing')),
  add column source text not null default 'rafiq' check (source in ('rafiq', 'osm', 'admin', 'user')),
  add column governorate text;
update public.checkpoints set governorate = case id
  when 'atara' then 'Ramallah and al-Bireh Governorate'
  when 'uyun_haramiya' then 'Ramallah and al-Bireh Governorate'
  else 'Nablus Governorate' end
where id in ('atara', 'uyun_haramiya', 'zaatara', 'huwara');
