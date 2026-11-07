"""Rafiq checkpoint bot.

  python -m checkpoint_bot run [--dry-run]       read channels, write reports (the cron job)
  python -m checkpoint_bot classify "حوارة مغلق"   try the classifier on one sentence
  python -m checkpoint_bot sample posts.csv       save recent post lines to label by hand
  python -m checkpoint_bot evaluate posts.csv     score the classifier against your labels

Settings come from the environment:
  CHECKPOINT_CHANNELS   comma-separated public channel names, e.g. "chan_one,chan_two"
  SUPABASE_URL          https://<project>.supabase.co
  SUPABASE_SECRET_KEY   the server key (only needed for run without --dry-run)
  MAX_AGE_MINUTES       ignore posts older than this (default 120; older reports don't count)
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

from .classify import classify_line, classify_post
from .supabase_sink import Report, write_reports
from .telegram_web import Post, fetch_channel


def _channels() -> list[str]:
    names = [c.strip().lstrip("@") for c in os.environ.get("CHECKPOINT_CHANNELS", "").split(",")]
    names = [n for n in names if n]
    if not names:
        sys.exit("Set CHECKPOINT_CHANNELS to one or more public channel names.")
    return names


def _fetch_all() -> list[Post]:
    posts: list[Post] = []
    for name in _channels():
        try:
            posts += fetch_channel(name)
        except Exception as e:  # one broken channel shouldn't stop the others
            print(f"! could not read {name}: {e}", file=sys.stderr)
    return posts


def reports_from(posts: list[Post], now: datetime, max_age: timedelta) -> list[Report]:
    out = []
    for post in posts:
        if now - post.posted_at > max_age:
            continue
        for m in classify_post(post.text):
            out.append(Report(m.checkpoint_id, m.status, post.channel, post.post_id, post.posted_at))
    return out


def cmd_run(args) -> None:
    now = datetime.now(timezone.utc)
    max_age = timedelta(minutes=int(os.environ.get("MAX_AGE_MINUTES", "120")))
    posts = _fetch_all()
    reports = reports_from(posts, now, max_age)
    for r in reports:
        print(f"{r.posted_at:%H:%M} {r.channel_ref:40} {r.status}")
    print(f"{len(posts)} posts read, {len(reports)} reports found")
    if args.dry_run:
        return
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SECRET_KEY, or use --dry-run.")
    write_reports(url, key, reports)
    print("written (duplicates ignored)")


def cmd_classify(args) -> None:
    matches = classify_post(args.text)
    print("\n".join(f"{m.checkpoint_id}: {m.status}" for m in matches) or "nothing found")


LABEL_FIELDS = ["channel", "post_id", "posted_at", "line", "checkpoint", "status"]


def cmd_sample(args) -> None:
    """One row per non-empty line. Fill in checkpoint and status yourself; leave both empty
    when the line says nothing about a checkpoint's status."""
    rows = 0
    with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:  # -sig: Excel shows Arabic right
        w = csv.DictWriter(f, LABEL_FIELDS)
        w.writeheader()
        for post in _fetch_all():
            for line in filter(None, (l.strip() for l in post.text.splitlines())):
                w.writerow({"channel": post.channel, "post_id": post.post_id,
                            "posted_at": post.posted_at.isoformat(), "line": line,
                            "checkpoint": "", "status": ""})
                rows += 1
    print(f"wrote {rows} lines to {args.csv}. Label the checkpoint and status columns, then run evaluate.")


def evaluate_rows(rows: list[dict]) -> dict:
    """Compare the classifier with hand labels, one (checkpoint, status) answer per line.
    A line with two checkpoints is labelled 'atara+huwara'."""
    confusion: Counter[tuple[str, str]] = Counter()
    misses = []
    for row in rows:
        want_cps = sorted(filter(None, (row.get("checkpoint") or "").split("+")))
        want = f"{'+'.join(want_cps)}:{row.get('status', '').strip()}" if want_cps else "-"
        got_m = classify_line(row["line"])
        got = f"{'+'.join(sorted(m.checkpoint_id for m in got_m))}:{got_m[0].status}" if got_m else "-"
        want_status = want.split(":")[-1] if want != "-" else "-"
        got_status = got.split(":")[-1] if got != "-" else "-"
        confusion[(want_status, got_status)] += 1
        if want != got:
            misses.append((row["line"], want, got))
    total = sum(confusion.values())
    correct = total - len(misses)
    return {"total": total, "correct": correct, "confusion": confusion, "misses": misses}


def cmd_evaluate(args) -> None:
    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    res = evaluate_rows(rows)
    if not res["total"]:
        sys.exit("no rows")
    print(f"accuracy: {res['correct']}/{res['total']} = {res['correct'] / res['total']:.0%}\n")
    labels = ["-", "open", "crowded", "closed"]
    print("status confusion (rows = your label, columns = classifier)")
    print(" " * 9 + "".join(f"{l:>9}" for l in labels))
    for want in labels:
        print(f"{want:>9}" + "".join(f"{res['confusion'][(want, got)]:>9}" for got in labels))
    print("\nfirst misses (line | you said | classifier said):")
    for line, want, got in res["misses"][:15]:
        print(f"  {line[:60]} | {want} | {got}")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="checkpoint_bot", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run"); r.add_argument("--dry-run", action="store_true"); r.set_defaults(fn=cmd_run)
    c = sub.add_parser("classify"); c.add_argument("text"); c.set_defaults(fn=cmd_classify)
    s = sub.add_parser("sample"); s.add_argument("csv"); s.set_defaults(fn=cmd_sample)
    e = sub.add_parser("evaluate"); e.add_argument("csv"); e.set_defaults(fn=cmd_evaluate)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
