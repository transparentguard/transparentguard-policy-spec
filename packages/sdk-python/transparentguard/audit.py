"""
TransparentGuard Python SDK — Audit Emitter
Writes audit events to file, stdout, or HTTP destination.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from .types import AuditEvent, TPSAudit


class AuditEmitter:
    """Buffers audit events and writes them to the configured destination."""

    def __init__(self, audit_config: TPSAudit) -> None:
        self._config = audit_config
        self._queue: List[AuditEvent] = []

    def enqueue(self, event: AuditEvent) -> None:
        if not self._config.get("enabled"):
            return
        self._queue.append(event)

    def enqueue_many(self, events: List[AuditEvent]) -> None:
        for e in events:
            self.enqueue(e)

    async def flush(self) -> None:
        if not self._queue:
            return
        events = list(self._queue)
        self._queue.clear()

        destination = self._config.get("destination", "stdout")
        fmt = self._config.get("format", "ndjson")

        if destination == "stdout":
            for event in events:
                sys.stdout.write(json.dumps(event) + "\n")
            sys.stdout.flush()

        elif destination and destination.startswith("file://"):
            path = destination[len("file://"):]
            with open(path, "a", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event) + "\n")

        elif destination and destination.startswith("https://"):
            await self._post_events(destination, events)

    async def _post_events(self, url: str, events: List[AuditEvent]) -> None:
        try:
            import httpx  # type: ignore[import]
            payload = json.dumps(events)
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    url,
                    content=payload,
                    headers={"Content-Type": "application/json"},
                )
        except Exception as exc:
            sys.stderr.write(f"[TransparentGuard] Audit delivery failed: {exc}\n")
