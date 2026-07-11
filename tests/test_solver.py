from datetime import datetime, timezone

from event_scheduler.domain import BusyInterval, EventRequest, ScheduleRequest, TimeWindow
from event_scheduler.solver import MakespanScheduler

UTC = timezone.utc


def dt(hour=0, minute=0):
    return datetime(2026, 1, 1, hour, minute, tzinfo=UTC)


def request(events, busy=(), block=15):
    return ScheduleRequest(dt(), dt(12), block, tuple(events), tuple(busy))


def event(event_id, duration, start, end):
    return EventRequest(event_id, event_id, duration, (TimeWindow(start, end),))


def test_rounds_allowed_window_inward_and_duration_upward():
    result = MakespanScheduler().solve(
        request([event("one", 16, dt(1, 1), dt(2, 1))])
    )
    assert result.status == "optimal"
    assert result.events[0].scheduled_start == dt(1, 15)
    assert result.events[0].scheduled_end == dt(1, 31)
    assert result.objective["makespan_reserved_minutes"] == 105


def test_busy_interval_rounds_outward_and_prevents_overlap():
    result = MakespanScheduler().solve(
        request(
            [event("one", 30, dt(1), dt(3))],
            [BusyInterval("busy", dt(1, 1), dt(1, 29))],
        )
    )
    assert result.status == "optimal"
    assert result.events[0].scheduled_start == dt(1, 30)


def test_multiple_windows_and_non_overlap_are_deterministic():
    flexible = EventRequest(
        "a",
        "a",
        30,
        (TimeWindow(dt(2), dt(3)), TimeWindow(dt(1), dt(2))),
    )
    result = MakespanScheduler().solve(request([flexible, event("b", 30, dt(1), dt(3))]))
    assert result.status == "optimal"
    assert len(result.events) == 2
    assert result.events[0].scheduled_end <= result.events[1].scheduled_start


def test_reports_block_infeasibility_without_throwing():
    result = MakespanScheduler().solve(request([event("one", 15, dt(1, 1), dt(1, 14))]))
    assert result.status == "infeasible"
    assert "block-aligned" in result.diagnostics[0]


def test_reports_global_infeasibility():
    result = MakespanScheduler().solve(
        request([event("a", 60, dt(1), dt(2)), event("b", 60, dt(1), dt(2))])
    )
    assert result.status == "infeasible"
