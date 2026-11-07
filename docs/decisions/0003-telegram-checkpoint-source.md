# 0003. Read Telegram channels from the public web preview, with a rule-based classifier

- **Date:** 2026-11-07
- **Status:** Accepted
- **Door:** two-way. The reader and the classifier are small files behind one function each.

## Context
Crowd reports only work once many people use the app. Until then, public Telegram channels already post road and checkpoint news in Arabic all day. We want those posts to count as checkpoint reports.

## Decision
- **Reading:** fetch `t.me/s/<channel>`, the public web preview. No Telegram account, bot token or API key, and nothing to keep logged in. The alternative (Telethon with a user account) can read more history but needs a phone number and session secrets; we can switch later if the preview stops being enough.
- **Classifying:** keyword rules (checkpoint names, status words, emojis, simple negation). It stays silent when a line has no status or two statuses that disagree, because a wrong "open" is worse than no report.
- **Writing:** reports with `source = 'channel'`, no person attached, and a unique `channel_ref` (`channel/post/checkpoint`) so a post is never counted twice. One channel post counts as one vote, the same as one person.
- **Running:** a GitHub Actions schedule every 10 minutes. Free, and no server to look after.

## Consequences
- If Telegram changes the preview page, the parser test with the saved page still passes but real runs find 0 posts. The job prints "N posts read" so it shows up in the Actions log.
- The classifier's quality is unknown until we label real posts. `python -m checkpoint_bot sample` and `evaluate` are there for that, before anyone tries machine learning.
- GitHub may delay scheduled runs at busy times. Fine for a status that is "majority of the last 30 minutes".
