"""Write channel reports into public.checkpoint_reports through Supabase's REST API.

Uses the server (secret / service_role) key, which skips row-level security. Keep it in
GitHub secrets only, never in the app. channel_ref is unique, so posting the same report
twice is a no-op ("ignore-duplicates").
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Report:
    checkpoint_id: str
    status: str
    channel: str
    post_id: int
    posted_at: datetime

    @property
    def channel_ref(self) -> str:
        return f"{self.channel}/{self.post_id}/{self.checkpoint_id}"

    def as_row(self) -> dict:
        return {
            "checkpoint_id": self.checkpoint_id,
            "status": self.status,
            "source": "channel",
            "channel_ref": self.channel_ref,
            "created_at": self.posted_at.isoformat(),
        }


def auth_headers(key: str) -> dict:
    # New-style keys (sb_secret_...) go in apikey only; legacy JWT keys also as a bearer token.
    headers = {"apikey": key}
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def write_reports(url: str, key: str, reports: list[Report], timeout: float = 20) -> None:
    if not reports:
        return
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/checkpoint_reports?on_conflict=channel_ref",
        data=json.dumps([r.as_row() for r in reports]).encode(),
        method="POST",
        headers={
            **auth_headers(key),
            "Content-Type": "application/json",
            "Prefer": "resolution=ignore-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout):
        pass
