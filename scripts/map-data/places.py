"""Turn the OSM extract into rows we can review: populated places and the West Bank outline.

Reads places.geojson and boundary.geojson (made by osmium in the Map data workflow) and
prints one JSON line per row, so the rows can be read from the job log.
"""
import json
import sys

SOUTH, WEST, NORTH, EAST = 31.20, 34.70, 32.70, 35.70


def centre(geom):
    c = geom["coordinates"]
    if geom["type"] == "Point":
        return c[0], c[1]
    flat = []

    def walk(x):
        if isinstance(x[0], (int, float)):
            flat.append(x)
        else:
            for y in x:
                walk(y)

    walk(c)
    return sum(p[0] for p in flat) / len(flat), sum(p[1] for p in flat) / len(flat)


def main(places_path, boundary_path):
    for f in json.load(open(places_path, encoding="utf-8"))["features"]:
        lng, lat = centre(f["geometry"])
        if not (SOUTH <= lat <= NORTH and WEST <= lng <= EAST):
            continue
        t = f.get("properties") or {}
        keep = {k: v for k, v in t.items() if k in ("place", "name", "name:ar", "name:en", "population", "is_in", "wikidata", "@id")}
        print("PLACE", json.dumps({"id": f.get("id"), "lat": round(lat, 6), "lng": round(lng, 6), **keep}, ensure_ascii=False))
    for f in json.load(open(boundary_path, encoding="utf-8"))["features"]:
        t = f.get("properties") or {}
        g = f["geometry"]
        if g["type"] not in ("Polygon", "MultiPolygon"):
            continue
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for i, poly in enumerate(polys):
            ring = poly[0]
            # Keep every 3rd point: plenty for "is this place inside the West Bank?"
            ring = [[round(x, 5), round(y, 5)] for x, y in ring[::3]] + [[round(ring[0][0], 5), round(ring[0][1], 5)]]
            print("BOUNDARY", json.dumps({"id": f.get("id"), "name": t.get("name:en") or t.get("name"), "part": i, "points": len(poly[0]), "ring": ring}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
