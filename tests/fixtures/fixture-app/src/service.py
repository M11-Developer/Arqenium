"""Fixture module for the Python language adapter tests."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class RecordStore:
    """In-memory store used by the fixture parser."""

    root: Path
    items: list[dict] = field(default_factory=list)

    def add(self, record: dict) -> None:
        self.items.append(record)

    def dump(self) -> str:
        return json.dumps(self.items)


def parse_records(payload: str) -> list[dict]:
    """Parse a JSON payload into a list of records."""
    data = json.loads(payload)
    if not isinstance(data, list):
        raise ValueError("payload must be a JSON array")
    return [item for item in data if isinstance(item, dict)]


def summarise(records: list[dict]) -> dict:
    counts: dict[str, int] = {}
    for record in records:
        key = str(record.get("kind", "unknown"))
        counts[key] = counts.get(key, 0) + 1
    return counts
