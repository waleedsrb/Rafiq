"""Turn one line of Arabic text into (checkpoint, status) pairs.

This is a rule-based classifier on purpose: it is easy to read, easy to fix, and gives
us a baseline. Before trying anything smarter, label real posts by hand and measure it
(see README: "Measure it").

The steps:
  1. normalize()  makes spelling variants look the same (أ/إ/آ -> ا, ة -> ه, no diacritics).
  2. find the checkpoints the line names (CHECKPOINT_ALIASES).
  3. find the status words and emojis (STATUS_WORDS), handling simple negation
     ("غير سالك" means closed, "ما في أزمة" means open).
  4. one clear status -> one report per checkpoint. No status, or two that disagree -> nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

OPEN, CROWDED, CLOSED = "open", "crowded", "closed"

_DIACRITICS = re.compile(r"[ً-ْٰـ]")  # harakat, dagger alef, tatweel
_LETTER_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي"})


def normalize(text: str) -> str:
    text = _DIACRITICS.sub("", text).translate(_LETTER_MAP).lower()
    return re.sub(r"\s+", " ", text).strip()


# Checkpoint ids match public.checkpoints. Spellings are written already normalized.
CHECKPOINT_ALIASES: dict[str, list[str]] = {
    "atara": ["عطاره", "atara"],
    "uyun_haramiya": ["عيون الحراميه", "عين الحراميه", "وادي الحراميه", "uyun al-haramiya"],
    "zaatara": ["زعتره", "تبوح", "zaatara", "tapuah"],
    "huwara": ["حواره", "huwara", "hawara"],
}

STATUS_WORDS: dict[str, list[str]] = {
    OPEN: ["سالك", "سالكه", "سالكات", "سالكين", "مفتوح", "مفتوحه", "مفتوحات", "فاتح", "فاتحه",
           "نظيف", "نظيفه", "تم فتح", "open"],
    CROWDED: ["ازمه", "ازمات", "ازدحام", "مزدحم", "مزدحمه", "زحمه", "عجقه", "طابور", "تفتيش",
              "تدقيق", "بطيء", "بطء", "ضغط", "crowded", "traffic"],
    CLOSED: ["مغلق", "مغلقه", "مغلقات", "مسكر", "مسكره", "مسكرات", "سكر", "اغلاق", "مقفل",
             "مقفله", "مسدود", "closed"],
}
STATUS_EMOJIS: dict[str, list[str]] = {
    OPEN: ["✅", "🟢", "💚"],
    CROWDED: ["🟡", "🟠", "⚠"],
    CLOSED: ["🔴", "❌", "⛔", "🚫"],
}
NEGATORS = ["غير", "مش", "مو", "ما في", "مافي", "لا يوجد", "ما فيه", "بدون", "not", "no"]

# Arabic glues short words to the front: و (and), ف (so), ب (at), ال (the), and combinations.
_PREFIX = r"(?:و|ف|ب|ل)?(?:ال)?"


def _word(phrase: str) -> re.Pattern[str]:
    # \w covers Arabic letters, so these boundaries keep "سكر" from matching inside "عسكري".
    return re.compile(rf"(?<!\w){_PREFIX}{re.escape(phrase)}(?!\w)")


_CHECKPOINT_PATTERNS = {cp: [_word(a) for a in aliases] for cp, aliases in CHECKPOINT_ALIASES.items()}
_STATUS_PATTERNS = {st: [_word(w) for w in words] for st, words in STATUS_WORDS.items()}
_NEGATED = re.compile(rf"(?<!\w)(?:{'|'.join(re.escape(n) for n in NEGATORS)})\s+$")


@dataclass(frozen=True)
class Match:
    checkpoint_id: str
    status: str


def find_checkpoints(norm: str) -> list[str]:
    return [cp for cp, pats in _CHECKPOINT_PATTERNS.items() if any(p.search(norm) for p in pats)]


def find_statuses(norm: str, raw: str) -> set[str]:
    found: set[str] = set()
    for status, pats in _STATUS_PATTERNS.items():
        for pat in pats:
            for m in pat.finditer(norm):
                if _NEGATED.search(norm[: m.start()]):
                    # "غير سالك" -> closed; "ما في ازمه" -> open; "مش مسكر" -> open.
                    found.add(CLOSED if status == OPEN else OPEN)
                else:
                    found.add(status)
    for status, emojis in STATUS_EMOJIS.items():
        if any(e in raw for e in emojis):
            found.add(status)
    return found


def classify_line(line: str) -> list[Match]:
    norm = normalize(line)
    checkpoints = find_checkpoints(norm)
    if not checkpoints:
        return []
    statuses = find_statuses(norm, line)
    if len(statuses) != 1:
        return []  # no status, or a mix we can't untangle: better silent than wrong
    status = next(iter(statuses))
    return [Match(cp, status) for cp in checkpoints]


def classify_post(text: str) -> list[Match]:
    """Channels often post one line per checkpoint. Read line by line first; if that finds
    nothing, try the whole post as one sentence (name on one line, status on the next)."""
    found: dict[str, Match] = {}
    for line in text.splitlines():
        for m in classify_line(line):
            found.setdefault(m.checkpoint_id, m)
    if not found:
        for m in classify_line(" ".join(text.splitlines())):
            found.setdefault(m.checkpoint_id, m)
    return list(found.values())
