import json
import tempfile
import unittest
from pathlib import Path

import drift_check


class CompareTest(unittest.TestCase):
    def test_sorts_differences_into_three_groups(self):
        diff = drift_check.compare({"a": "1", "b": "2", "c": "3"}, {"b": "2", "c": "9", "d": "4"})
        self.assertEqual(diff, {"missing": ["a"], "extra": ["d"], "changed": ["c"]})

    def test_same_maps_are_clean(self):
        same = drift_check.compare({"a": "1"}, {"a": "1"})
        self.assertTrue(drift_check.is_clean(same, same))


class CronTest(unittest.TestCase):
    def test_reads_schedule_and_unschedule_in_file_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "001.sql").write_text(
                "perform cron.schedule('expire', '* * * * *', 'select public.expire()');\n"
                "perform cron.schedule('old', '0 * * * *', 'select 1');\n"
            )
            (folder / "002.sql").write_text(
                "perform cron.unschedule('old');\n"
                "perform cron.schedule('expire', '*/2 * * * *', 'select public.expire(''x'')');\n"
            )
            jobs = drift_check.cron_from_migrations(folder)
        self.assertEqual(jobs, {"expire": "*/2 * * * * | select public.expire('x')"})

    def test_real_migrations_schedule_the_known_jobs(self):
        folder = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
        jobs = drift_check.cron_from_migrations(folder)
        self.assertIn("expire-requests", jobs)
        self.assertIn("finish-due-trips", jobs)


class MainTest(unittest.TestCase):
    def run_main(self, expected, live, live_cron):
        with tempfile.TemporaryDirectory() as tmp:
            t = Path(tmp)
            (t / "migrations").mkdir()
            for name, data in [("e", expected), ("l", live), ("c", live_cron)]:
                (t / f"{name}.json").write_text(json.dumps(data))
            code = drift_check.main([
                "--expected", str(t / "e.json"), "--live", str(t / "l.json"),
                "--live-cron", str(t / "c.json"), "--migrations", str(t / "migrations"),
                "--out", str(t / "report.md"),
            ])
            return code, (t / "report.md").read_text()

    def test_in_sync_exits_zero(self):
        code, text = self.run_main({"table trips": "x"}, {"table trips": "x"}, {})
        self.assertEqual(code, 0)
        self.assertIn("matches", text)

    def test_missing_function_is_reported(self):
        code, text = self.run_main({"function request_seat(uuid)": "x"}, {}, {})
        self.assertEqual(code, 1)
        self.assertIn("Missing live", text)
        self.assertIn("function request_seat(uuid)", text)


if __name__ == "__main__":
    unittest.main()
