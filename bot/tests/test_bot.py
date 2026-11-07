import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from checkpoint_bot.__main__ import evaluate_rows, reports_from
from checkpoint_bot.classify import classify_line, classify_post, normalize
from checkpoint_bot.supabase_sink import Report, auth_headers
from checkpoint_bot.telegram_web import Post, parse_preview

FIXTURES = Path(__file__).parent / "fixtures"


def pairs(text):
    return sorted((m.checkpoint_id, m.status) for m in classify_post(text))


class Normalize(unittest.TestCase):
    def test_spelling_variants_look_the_same(self):
        self.assertEqual(normalize("حوارةُ  مُغلَقة"), normalize("حواره مغلقه"))
        self.assertEqual(normalize("أزمـــة"), "ازمه")


class Classify(unittest.TestCase):
    def test_simple_lines(self):
        self.assertEqual(pairs("حاجز حوارة مغلق"), [("huwara", "closed")])
        self.assertEqual(pairs("عطارة سالك"), [("atara", "open")])
        self.assertEqual(pairs("زعترة أزمة خانقة"), [("zaatara", "crowded")])
        self.assertEqual(pairs("عيون الحرامية مسكر"), [("uyun_haramiya", "closed")])

    def test_emojis_alone(self):
        self.assertEqual(pairs("حوارة 🔴"), [("huwara", "closed")])
        self.assertEqual(pairs("عطارة ✅"), [("atara", "open")])

    def test_prefixes_glued_to_words(self):
        self.assertEqual(pairs("وحوارة والطريق بالسالك"), [("huwara", "open")])

    def test_negation(self):
        self.assertEqual(pairs("عطارة غير سالك"), [("atara", "closed")])
        self.assertEqual(pairs("زعترة ما في أزمة"), [("zaatara", "open")])
        self.assertEqual(pairs("حوارة مش مسكر"), [("huwara", "open")])

    def test_one_status_for_two_checkpoints(self):
        self.assertEqual(pairs("عطارة وعيون الحرامية سالكات"), [("atara", "open"), ("uyun_haramiya", "open")])

    def test_one_line_per_checkpoint(self):
        self.assertEqual(pairs("حوارة مغلق 🔴\nعطارة سالك ✅"), [("atara", "open"), ("huwara", "closed")])

    def test_name_and_status_on_separate_lines(self):
        self.assertEqual(pairs("تحديث حاجز حوارة:\nمغلق بالاتجاهين"), [("huwara", "closed")])

    def test_stays_silent_when_unsure(self):
        self.assertEqual(pairs("حوارة"), [])                       # no status
        self.assertEqual(pairs("عطارة سالك بس في أزمة"), [])          # two statuses disagree
        self.assertEqual(pairs("الطريق سالك"), [])                  # no checkpoint
        self.assertEqual(classify_line("تواجد عسكري قرب حوارة"), [])  # "سكر" inside "عسكري"


class Preview(unittest.TestCase):
    def test_parses_posts_text_and_time(self):
        posts = parse_preview((FIXTURES / "preview.html").read_text(encoding="utf-8"))
        self.assertEqual([p.post_id for p in posts], [101, 102])  # 103 is a photo without text
        first = posts[0]
        self.assertEqual(first.channel, "roads_demo")
        self.assertEqual(first.text.splitlines(), ["حاجز حوارة مغلق 🔴", "عطارة سالك ✅", "زعترة: أزمة خانقة"])
        self.assertEqual(first.posted_at, datetime(2026, 11, 7, 5, 40, tzinfo=timezone.utc))
        # The quoted reply is not mixed into the second post's own text.
        self.assertEqual(posts[1].text, "صباح الخير يا جماعة & انتبهوا")


class Reports(unittest.TestCase):
    def test_old_posts_are_skipped_and_refs_are_stable(self):
        now = datetime(2026, 11, 7, 7, 0, tzinfo=timezone.utc)
        posts = [
            Post("roads_demo", 1, now - timedelta(minutes=30), "حوارة مغلق"),
            Post("roads_demo", 2, now - timedelta(hours=3), "عطارة سالك"),
        ]
        reports = reports_from(posts, now, timedelta(hours=2))
        self.assertEqual([r.channel_ref for r in reports], ["roads_demo/1/huwara"])
        row = reports[0].as_row()
        self.assertEqual(row["source"], "channel")
        json.dumps(row)  # serialisable

    def test_auth_headers(self):
        self.assertEqual(auth_headers("sb_secret_x"), {"apikey": "sb_secret_x"})
        self.assertIn("Authorization", auth_headers("eyJhbGciOi.legacy.jwt"))


class Evaluate(unittest.TestCase):
    def test_scores_against_labels(self):
        rows = [
            {"line": "حوارة مغلق", "checkpoint": "huwara", "status": "closed"},
            {"line": "صباح الخير", "checkpoint": "", "status": ""},
            {"line": "زعترة فيها شوية سيارات", "checkpoint": "zaatara", "status": "crowded"},
        ]
        res = evaluate_rows(rows)
        self.assertEqual((res["correct"], res["total"]), (2, 3))
        self.assertEqual(res["confusion"][("crowded", "-")], 1)


if __name__ == "__main__":
    unittest.main()
