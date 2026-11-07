"""Read the latest posts of a public Telegram channel from its web preview (t.me/s/<name>).

No Telegram account, bot token or API key is needed: this is the same page anyone sees in
a browser. It only works for public channels, and Telegram may change the page layout, so
the parser is small and covered by a saved sample page in tests/fixtures.
"""

from __future__ import annotations

import urllib.request
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser


@dataclass(frozen=True)
class Post:
    channel: str
    post_id: int
    posted_at: datetime
    text: str


class _PreviewParser(HTMLParser):
    """Collects data-post, the message text (with <br> as new lines) and <time datetime>."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.posts: list[dict] = []
        self._current: dict | None = None
        self._text_depth = 0  # >0 while inside the message text div

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        if tag == "div" and "tgme_widget_message" in classes and a.get("data-post"):
            self._current = {"ref": a["data-post"], "text": [], "time": None, "seen_text": False}
            self.posts.append(self._current)
            return
        if self._current is None:
            return
        if self._text_depth:
            if tag == "br":
                self._current["text"].append("\n")
            elif tag == "div":
                self._text_depth += 1
        elif tag == "div" and "tgme_widget_message_text" in classes and not self._current["seen_text"]:
            self._current["seen_text"] = True  # the post's own text, not a quoted reply below it
            self._text_depth = 1
        elif tag == "time" and a.get("datetime") and self._current["time"] is None:
            self._current["time"] = a["datetime"]

    def handle_endtag(self, tag):
        if self._text_depth and tag == "div":
            self._text_depth -= 1

    def handle_data(self, data):
        if self._text_depth and self._current is not None:
            self._current["text"].append(data)


def parse_preview(html: str) -> list[Post]:
    parser = _PreviewParser()
    parser.feed(html)
    posts = []
    for p in parser.posts:
        text = "".join(p["text"]).strip()
        if not text or not p["time"] or "/" not in p["ref"]:
            continue  # photos without a caption, service messages
        channel, _, num = p["ref"].rpartition("/")
        if not num.isdigit():
            continue
        posts.append(Post(channel, int(num), datetime.fromisoformat(p["time"]), text))
    return posts


def fetch_channel(name: str, timeout: float = 20) -> list[Post]:
    req = urllib.request.Request(
        f"https://t.me/s/{name}",
        headers={"User-Agent": "RafiqCheckpointBot/1.0", "Accept-Language": "ar,en"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return parse_preview(resp.read().decode("utf-8", errors="replace"))
