"""Download West Bank checkpoints, gates and road closures from OpenStreetMap.

Runs in GitHub Actions (the build machine can reach the Overpass API). Writes the raw
OSM elements, with all their tags, to osm-checkpoints.json so we can review them before
anything goes into the database.

Data (c) OpenStreetMap contributors, ODbL: credit OSM wherever we show it.
"""
import json
import sys
import urllib.parse
import urllib.request

# A box around the West Bank (south, west, north, east). It also covers parts of Israel
# and Jordan; the review step keeps only points inside the West Bank.
BBOX = "31.34,34.88,32.56,35.58"

QUERY = f"""
[out:json][timeout:120];
(
  nwr["military"="checkpoint"]({BBOX});
  nwr["barrier"="checkpoint"]({BBOX});
  nwr["barrier"="border_control"]({BBOX});
  nwr["police"="checkpoint"]({BBOX});
  nwr["amenity"="checkpoint"]({BBOX});
  node["barrier"~"^(gate|lift_gate|swing_gate|block|jersey_barrier|debris)$"]({BBOX});
);
out center tags;
"""

SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def main(out_path: str) -> None:
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    last_error = None
    for url in SERVERS:
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "rafiq-map-data/1.0"})
            with urllib.request.urlopen(req, timeout=180) as res:
                data = json.load(res)
            break
        except Exception as e:  # try the next server
            last_error = e
            print(f"{url} failed: {e}", file=sys.stderr)
    else:
        raise SystemExit(f"All Overpass servers failed: {last_error}")

    elements = data.get("elements", [])
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"osm_base": data.get("osm3s", {}).get("timestamp_osm_base"), "elements": elements}, f, ensure_ascii=False, indent=1)
    print(f"{len(elements)} elements written to {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "osm-checkpoints.json")
