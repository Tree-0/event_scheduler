"""Immutable domain contracts shared by adapters and solvers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal, Mapping

SCHEMA_VERSION = 1
ScheduleStatus = Literal["optimal", "feasible", "infeasible", "error"]


def parse_utc(value: str, field_name: str = "timestamp") -> datetime:
    """Parse the canonical JSON timestamp format (UTC with a trailing ``Z``)."""
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError(f"{field_name} must be a UTC ISO 8601 timestamp ending in 'Z'")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ValueError(f"{field_name} is not a valid ISO 8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise ValueError(f"{field_name} must be in UTC")
    return parsed.astimezone(timezone.utc)


def format_utc(value: datetime) -> str:
    """Serialize an aware datetime in the canonical UTC representation."""
    if value.tzinfo is None:
        raise ValueError("cannot serialize a naive datetime")
    utc = value.astimezone(timezone.utc)
    timespec = "seconds" if utc.microsecond == 0 else "microseconds"
    return utc.isoformat(timespec=timespec).replace("+00:00", "Z")


def _require_utc(value: datetime, field_name: str) -> None:
    if value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(value):
        raise ValueError(f"{field_name} must be timezone-aware UTC")


@dataclass(frozen=True)
class TimeWindow:
    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        _require_utc(self.start, "window.start")
        _require_utc(self.end, "window.end")
        if self.end <= self.start:
            raise ValueError("window.end must be after window.start")


@dataclass(frozen=True)
class EventRequest:
    id: str
    title: str
    duration_minutes: int
    windows: tuple[TimeWindow, ...]
    description: str = ""

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("event.id must not be empty")
        if not self.title.strip():
            raise ValueError(f"event {self.id!r} title must not be empty")
        if (
            not isinstance(self.duration_minutes, int)
            or isinstance(self.duration_minutes, bool)
            or self.duration_minutes <= 0
        ):
            raise ValueError(f"event {self.id!r} duration_minutes must be positive")
        if not self.windows:
            raise ValueError(f"event {self.id!r} must have at least one window")


@dataclass(frozen=True)
class BusyInterval:
    id: str
    start: datetime
    end: datetime
    title: str = ""

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("busy interval id must not be empty")
        _require_utc(self.start, "busy_interval.start")
        _require_utc(self.end, "busy_interval.end")
        if self.end <= self.start:
            raise ValueError(f"busy interval {self.id!r} end must be after start")


@dataclass(frozen=True)
class ScheduleRequest:
    horizon_start: datetime
    horizon_end: datetime
    block_minutes: int
    events: tuple[EventRequest, ...]
    busy_intervals: tuple[BusyInterval, ...] = ()

    def __post_init__(self) -> None:
        _require_utc(self.horizon_start, "horizon.start")
        _require_utc(self.horizon_end, "horizon.end")
        if self.horizon_end <= self.horizon_start:
            raise ValueError("horizon.end must be after horizon.start")
        if (
            not isinstance(self.block_minutes, int)
            or isinstance(self.block_minutes, bool)
            or self.block_minutes <= 0
        ):
            raise ValueError("horizon.block_minutes must be positive")

        ids = [event.id for event in self.events]
        if len(ids) != len(set(ids)):
            raise ValueError("event ids must be unique")
        busy_ids = [interval.id for interval in self.busy_intervals]
        if len(busy_ids) != len(set(busy_ids)):
            raise ValueError("busy interval ids must be unique")

        for event in self.events:
            for window in event.windows:
                self._require_in_horizon(window.start, window.end, f"event {event.id!r} window")
        for interval in self.busy_intervals:
            self._require_in_horizon(
                interval.start, interval.end, f"busy interval {interval.id!r}"
            )

    def _require_in_horizon(self, start: datetime, end: datetime, label: str) -> None:
        if start < self.horizon_start or end > self.horizon_end:
            raise ValueError(f"{label} must be contained within the schedule horizon")


@dataclass(frozen=True)
class ScheduledEvent:
    id: str
    title: str
    duration_minutes: int
    scheduled_start: datetime
    scheduled_end: datetime
    description: str = ""

    def __post_init__(self) -> None:
        _require_utc(self.scheduled_start, "scheduled_start")
        _require_utc(self.scheduled_end, "scheduled_end")
        if (
            not isinstance(self.duration_minutes, int)
            or isinstance(self.duration_minutes, bool)
            or self.duration_minutes <= 0
        ):
            raise ValueError("duration_minutes must be positive")
        if self.scheduled_end <= self.scheduled_start:
            raise ValueError("scheduled_end must be after scheduled_start")


@dataclass(frozen=True)
class ScheduleResult:
    model: str
    status: ScheduleStatus
    events: tuple[ScheduledEvent, ...] = ()
    objective: Mapping[str, Any] = field(default_factory=dict)
    diagnostics: tuple[str, ...] = ()
