"""Pick West Bank checkpoints, gates and road closures out of OpenStreetMap.

Runs in GitHub Actions. The workflow downloads Geofabrik's Israel and Palestine extract
and filters it with osmium into checkpoints.geojson; this script keeps the points inside
a box around the West Bank and writes them, with all their tags, to osm-checkpoints.json
so we can review them before anything goes into the database.

Data (c) OpenStreetMap contributors, ODbL: credit OSM wherever we show it.
"""
import json
import sys

# A box around the West Bank. It also covers bits of Israel and Jordan; the review step
# keeps only points inside the West Bank.
SOUTH, WEST, NORTH, EAST = 31.34, 34.88, 32.56, 35.58


def centre(geom: dict) -> tuple[float, float]:
    """A point for any geometry: the point itself, or the average of a line's or area's corners."""
    coords = geom["coordinates"]
    if geom["type"] == "Point":
        return coords[0], coords[1]
    flat = []

    def walk(c):
        if isinstance(c[0], (int, float)):
            flat.append(c)
        else:
            for x in c:
                walk(x)

    walk(coords)
    return sum(p[0] for p in flat) / len(flat), sum(p[1] for p in flat) / len(flat)


def main(src: str, out_path: str) -> None:
    with open(src, encoding="utf-8") as f:
        features = json.load(f)["features"]
    rows = []
    for feat in features:
        lng, lat = centre(feat["geometry"])
        if not (SOUTH <= lat <= NORTH and WEST <= lng <= EAST):
            continue
        props = feat.get("properties") or {}
        rows.append({"id": feat.get("id") or props.get("@id"), "lat": round(lat, 6), "lng": round(lng, 6), "tags": props})
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f"{len(rows)} of {len(features)} features kept in {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
