from __future__ import annotations

from datetime import datetime, timedelta, timezone

HORA_GT = timezone(timedelta(hours=-6), name="America/Guatemala")


def ahora() -> datetime:
    return datetime.now(HORA_GT).replace(microsecond=0)


def iso(dt: datetime | None) -> str | None:
    """ISO 8601 con zona -06:00, como pide el contrato."""
    if dt is None:
        return None
    return dt.astimezone(HORA_GT).replace(microsecond=0).isoformat()
