"""Build the places and checkpoints seed migration from the OpenStreetMap data in data/.

Run:  pip install shapely && python3 scripts/map-data/build_seed.py
Writes supabase/migrations/20261109190000_places_seed.sql.

How it decides things (worth reading: these are judgement calls, not facts from OSM):
- Region of a place:
  * west_bank   inside one of the 11 West Bank governorates in OSM, and not a settlement
  * settlement  inside the West Bank but its main OSM name is in Hebrew (Israeli settlements
                are named in Hebrew; Palestinian towns and villages in Arabic)
  * jerusalem   East Jerusalem: outside the governorate outlines (OSM leaves it out) but east
                of the 1949 line in Jerusalem (a rough box, see in_east_jerusalem)
  * outside     everything else (Israel, Jordan)
  Only west_bank places can be picked in the app; the others are shown, flagged.
- Checkpoints: every OSM military=checkpoint / barrier=checkpoint / barrier=border_control,
  merged when two are within 400 m. Ones that duplicate our hand-placed four are skipped.

Data (c) OpenStreetMap contributors, ODbL.
"""
import json
import math
import os
import re

from shapely.geometry import Point, shape
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "supabase", "migrations", "20261109190000_places_seed.sql")
# The West Bank places ship inside the app too, so it can name and place a trip's towns
# without asking the server: {id: [name_ar, name_en, lat, lng, governorate_ar]}.
APP_OUT = os.path.join(ROOT, "src", "data", "places.ts")

HEBREW = re.compile("[֐-׿]")
ARABIC = re.compile("[؀-ۿ]")
LATIN = re.compile("[A-Za-z]")

GOV_AR = {
    "Jenin Governorate": "جنين",
    "Tubas Governorate": "طوباس",
    "Tulkarm Governorate": "طولكرم",
    "Nablus Governorate": "نابلس",
    "Qalqilya Governorate": "قلقيلية",
    "Salfit Governorate": "سلفيت",
    "Ramallah and al-Bireh Governorate": "رام الله والبيرة",
    "Jerusalem Periphery Governorate": "القدس",
    "Jericho Governorate": "أريحا",
    "Bethlehem Governorate": "بيت لحم",
    "Hebron Governorate": "الخليل",
}

# The four checkpoints Rafiq already has (hand placed, kept as they are).
OURS = {"atara": (31.9855, 35.1968), "uyun_haramiya": (32.0340, 35.2370), "zaatara": (32.1167, 35.2566), "huwara": (32.1530, 35.2560)}
OURS_NAMES = {"atara": ("عطارة", "atara"), "huwara": ("حوارة", "hawwar")}


def km(a_lat, a_lng, b_lat, b_lng):
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(h)))


def in_east_jerusalem(lat, lng):
    # A rough box for the part of Jerusalem east of the 1949 line. Good enough to flag a
    # search result; not a border.
    return 31.74 <= lat <= 31.87 and lng >= 35.222


def clean(s):
    return (s or "").replace("‎", "").replace("‏", "").strip()


def sql(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def load_jsonl(name):
    with open(os.path.join(HERE, "data", name), encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    with open(os.path.join(HERE, "data", "governorates.geojson"), encoding="utf-8") as f:
        govs = [(feat["properties"]["name"], shape(feat["geometry"]).buffer(0)) for feat in json.load(f)["features"]]
    west_bank = unary_union([g for _, g in govs])

    def governorate(lat, lng):
        p = Point(lng, lat)
        for name, g in govs:
            if g.contains(p):
                return name
        return None

    places = []
    # Nodes first: a town is often both a point and an area (its boundary); keep the point.
    rows = sorted(load_jsonl("osm-places.jsonl"), key=lambda r: (r["id"][0] != "n", r["id"]))
    for r in rows:
        if not r.get("place"):
            continue  # a node that only came along as part of an area
        name = clean(r.get("name"))
        ar = clean(r.get("name:ar")) or (name if ARABIC.search(name) else "")
        en = clean(r.get("name:en")) or (name if LATIN.search(name) and not ARABIC.search(name) else "")
        if not ar and not en:
            continue
        lat, lng = r["lat"], r["lng"]
        # The same name within 3 km is the same place.
        if any((p["name_ar"] == (ar or en) or p["name_en"] == (en or ar)) and km(lat, lng, p["lat"], p["lng"]) < 3 for p in places):
            continue
        gov = governorate(lat, lng)
        if gov:
            region = "settlement" if HEBREW.search(name) else "west_bank"
        elif in_east_jerusalem(lat, lng):
            region = "jerusalem"
        else:
            region = "outside"
        pop = r.get("population")
        pop = int(pop) if pop and str(pop).isdigit() else None
        places.append({
            "id": "osm-" + r["id"], "kind": r.get("place") if r.get("place") in ("city", "town", "village", "hamlet", "suburb") else "village",
            "name_ar": ar or en, "name_en": en or ar, "lat": lat, "lng": lng,
            "gov": gov, "region": region, "pop": pop,
        })

    pal = [p for p in places if p["region"] == "west_bank" and p["kind"] in ("city", "town", "village")
           and "مركز" not in p["name_ar"]]

    def nearest(lat, lng):
        return min(pal, key=lambda p: km(lat, lng, p["lat"], p["lng"]))

    checkpoints = []
    for r in load_jsonl("osm-checkpoints.jsonl"):
        lat, lng, t = r["lat"], r["lng"], r["tags"]
        if any(km(lat, lng, c["lat"], c["lng"]) < 0.4 for c in checkpoints):
            continue
        # Some names carry Hebrew and Arabic together; keep the Arabic and Latin parts.
        name = re.sub(r"\s+", " ", HEBREW.sub("", clean(t.get("name")))).strip(" /")
        low = (name + " " + clean(t.get("name:en"))).lower()
        dup = False
        for cid, (olat, olng) in OURS.items():
            near = km(lat, lng, olat, olng)
            ar_hint, en_hint = OURS_NAMES.get(cid, ("~", "~"))
            if near < 1.0 or (near < 4.0 and (ar_hint in name or en_hint in low)):
                dup = True
        if dup:
            continue
        inside = west_bank.contains(Point(lng, lat))
        crossing = (not inside) or any(w in low for w in ("crossing", "bridge")) or "מעבר" in name or "معبر" in name
        near = nearest(lat, lng)
        ar = clean(t.get("name:ar")) or (name.split("/")[0].strip() if ARABIC.search(name.split("/")[0]) else "")
        en = clean(t.get("name:en")) or (name if LATIN.search(name) and not HEBREW.search(name) else "")
        if not ar:
            ar = "حاجز قرب " + near["name_ar"]
        if not en:
            en = "Checkpoint near " + near["name_en"]
        checkpoints.append({
            "id": "osm-" + r["id"], "name_ar": ar, "name_en": en, "lat": lat, "lng": lng,
            "kind": "crossing" if crossing else "checkpoint", "gov": governorate(lat, lng),
        })

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("-- Generated by scripts/map-data/build_seed.py from OpenStreetMap (data (c) OpenStreetMap\n")
        f.write("-- contributors, ODbL). Do not edit by hand: change the script and run it again.\n")
        f.write(f"-- {len(places)} places, {len(checkpoints)} checkpoints.\n\n")
        f.write("insert into public.places (id, kind, name_ar, name_en, lat, lng, governorate, region, population) values\n")
        f.write(",\n".join(
            f"  ({sql(p['id'])}, {sql(p['kind'])}, {sql(p['name_ar'])}, {sql(p['name_en'])}, {p['lat']}, {p['lng']}, "
            f"{sql(p['gov'])}, {sql(p['region'])}, {p['pop'] if p['pop'] is not None else 'null'})"
            for p in places))
        f.write("\non conflict (id) do nothing;\n\n")
        f.write("insert into public.checkpoints (id, name_ar, name_en, road_order, lat, lng, kind, source, governorate) values\n")
        f.write(",\n".join(
            f"  ({sql(c['id'])}, {sql(c['name_ar'])}, {sql(c['name_en'])}, null, {c['lat']}, {c['lng']}, "
            f"{sql(c['kind'])}, 'osm', {sql(c['gov'])})"
            for c in checkpoints))
        f.write("\non conflict (id) do nothing;\n")
    app = {p["id"]: [p["name_ar"], p["name_en"], p["lat"], p["lng"], GOV_AR.get(p["gov"], "")]
           for p in places if p["region"] == "west_bank"}
    os.makedirs(os.path.dirname(APP_OUT), exist_ok=True)
    with open(APP_OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by scripts/map-data/build_seed.py from OpenStreetMap (data (c) OpenStreetMap\n")
        f.write("// contributors, ODbL). Do not edit by hand. {id: [name_ar, name_en, lat, lng, governorate_ar]}\n")
        f.write("export const PLACES: Record<string, [string, string, number, number, string]> = ")
        f.write(json.dumps(app, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
        f.write(";\n")
    by = {}
    for p in places:
        by[p["region"]] = by.get(p["region"], 0) + 1
    print(f"wrote {OUT}: {len(places)} places {by}, {len(checkpoints)} checkpoints")


if __name__ == "__main__":
    main()
