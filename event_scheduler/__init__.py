"""Offline-first event scheduling package."""

from event_scheduler.domain import (
    BusyInterval,
    EventRequest,
    ScheduleRequest,
    ScheduleResult,
    ScheduledEvent,
    TimeWindow,
)

__all__ = [
    "BusyInterval",
    "EventRequest",
    "ScheduleRequest",
    "ScheduleResult",
    "ScheduledEvent",
    "TimeWindow",
]

__version__ = "0.1.0"
