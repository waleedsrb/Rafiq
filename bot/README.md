# Checkpoint bot

Reads public Telegram channels, finds lines like **حاجز حوارة مغلق 🔴**, and adds them to Rafiq as checkpoint reports from "a public channel". Plain Python 3.11+, no packages to install.

```bash
cd bot
python -m checkpoint_bot classify "عطارة سالك ✅"      # -> atara: open
CHECKPOINT_CHANNELS=some_channel python -m checkpoint_bot run --dry-run
python -m unittest discover -s tests -t .
```

How it fits together:

| File | Job |
|---|---|
| `checkpoint_bot/telegram_web.py` | Read a channel's public page `t.me/s/<name>` into posts (id, time, text) |
| `checkpoint_bot/classify.py` | Normalize the Arabic, find checkpoint names and status words, decide |
| `checkpoint_bot/supabase_sink.py` | Write reports into `checkpoint_reports` (duplicates ignored) |
| `.github/workflows/checkpoint-bot.yml` | Runs `run` every 10 minutes |

Why rules and not machine learning: see `docs/decisions/0003-telegram-checkpoint-source.md`.

## Turn it on

1. Apply `supabase/migrations/20261108300000_checkpoint_channels.sql` in the SQL editor.
2. In GitHub: Settings → Secrets and variables → Actions.
   - Secret `SUPABASE_SECRET_KEY`: the secret (service role) key from Supabase. It can skip all database rules, so it lives only here.
   - Variable `CHECKPOINT_CHANNELS`: the channel names, comma-separated (the part after `t.me/`).
3. Actions → Checkpoint bot → Run workflow (dry run ticked) and read the log. Untick it to write for real; after that it runs every 10 minutes by itself.

## Measure it (your Python project)

A classifier you haven't measured is a guess. The loop:

1. `python -m checkpoint_bot sample posts.csv` saves one row per line of recent posts.
2. Open it in Excel or Google Sheets. For each line fill `checkpoint` (`atara`, `uyun_haramiya`, `zaatara`, `huwara`, or `atara+huwara` for two) and `status` (`open`, `crowded`, `closed`). Leave both empty when the line says nothing about a checkpoint. Aim for about 100 lines.
3. `python -m checkpoint_bot evaluate posts.csv` prints accuracy, a confusion table and the lines it got wrong.
4. Fix one thing in `classify.py` (a missing spelling, a new status word), add a test for it, and run evaluate again.

Questions worth asking of the confusion table: which mistake is worse for a commuter, saying "open" when it's closed, or saying nothing? Does accuracy alone tell you that?
