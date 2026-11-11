"""Compare the live database with what supabase/migrations/ says it should be.

Inputs are the JSON fingerprints from public.schema_fingerprint() (one built fresh from the
migrations in CI, one read from live Supabase) and the live public.cron_fingerprint().
Writes a Markdown report and exits 1 when they differ, 0 when they match.

    python3 drift_check.py --expected expected.json --live live.json \
        --live-cron live-cron.json --migrations supabase/migrations --out report.md
"""

import argparse
import json
import re
import sys
from pathlib import Path

# cron.schedule('name', 'schedule', 'command') and cron.unschedule('name') in the migrations.
SCHEDULE = re.compile(r"cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:[^']|'')*)'\s*\)")
UNSCHEDULE = re.compile(r"cron\.unschedule\(\s*'([^']+)'\s*\)")


def cron_from_migrations(folder: Path) -> dict:
    """The pg_cron jobs the migrations create, in the same shape as cron_fingerprint()."""
    jobs = {}
    for path in sorted(folder.glob("*.sql")):
        text = path.read_text(encoding="utf-8")
        events = [(m.start(), "add", m) for m in SCHEDULE.finditer(text)]
        events += [(m.start(), "drop", m) for m in UNSCHEDULE.finditer(text)]
        for _, kind, m in sorted(events, key=lambda e: e[0]):
            if kind == "add":
                jobs[m.group(1)] = f"{m.group(2)} | {m.group(3).replace(chr(39) * 2, chr(39))}"
            else:
                jobs.pop(m.group(1), None)
    return jobs


def compare(expected: dict, live: dict) -> dict:
    """Keys only in the repo, only live, and in both with a different value."""
    return {
        "missing": sorted(set(expected) - set(live)),
        "extra": sorted(set(live) - set(expected)),
        "changed": sorted(k for k in set(expected) & set(live) if expected[k] != live[k]),
    }


def is_clean(*diffs: dict) -> bool:
    return not any(d[k] for d in diffs for k in d)


def report(schema: dict, cron: dict) -> str:
    if is_clean(schema, cron):
        return "The live database matches `supabase/migrations/`. Nothing to do.\n"
    lines = [
        "The live database does not match `supabase/migrations/`.",
        "",
        "Usually a slice's SQL was not pasted into Supabase yet, or was pasted from an older copy.",
        "Find the migration that defines each item below and run it in the SQL Editor, then run",
        "this check again (Actions -> Drift check -> Run workflow). It closes this issue once clean.",
        "",
    ]
    sections = [
        ("Missing live (in the repo, not in Supabase)", schema["missing"]),
        ("Different live (same name, other definition)", schema["changed"]),
        ("Only live (in Supabase, in no migration)", schema["extra"]),
        ("Scheduled jobs missing live", cron["missing"]),
        ("Scheduled jobs with another schedule or command", cron["changed"]),
        ("Scheduled jobs only live", cron["extra"]),
    ]
    for title, items in sections:
        if items:
            lines.append(f"### {title} ({len(items)})")
            lines.append("")
            lines += [f"- `{item}`" for item in items[:200]]
            if len(items) > 200:
                lines.append(f"- ...and {len(items) - 200} more")
            lines.append("")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--expected", required=True, type=Path)
    parser.add_argument("--live", required=True, type=Path)
    parser.add_argument("--live-cron", required=True, type=Path)
    parser.add_argument("--migrations", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)

    expected = json.loads(args.expected.read_text())
    live = json.loads(args.live.read_text())
    live_cron = json.loads(args.live_cron.read_text())
    schema = compare(expected, live)
    cron = compare(cron_from_migrations(args.migrations), live_cron)
    text = report(schema, cron)
    args.out.write_text(text)
    print(text)
    return 0 if is_clean(schema, cron) else 1


if __name__ == "__main__":
    sys.exit(main())
