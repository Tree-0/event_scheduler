from datetime import datetime, timedelta, timezone

from event_scheduler.domain import EventRequest, ScheduleRequest, ScheduleResult, ScheduledEvent, TimeWindow
from event_scheduler.google_calendar import GoogleCalendarAdapter

UTC = timezone.utc


class Call:
    def __init__(self, value=None, error=None):
        self.value = value
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.value


class EventsResource:
    def __init__(self, pages=(), insert_errors=()):
        self.pages = list(pages)
        self.insert_errors = list(insert_errors)
        self.inserted = []

    def list(self, **kwargs):
        return Call(self.pages.pop(0))

    def insert(self, **kwargs):
        self.inserted.append(kwargs)
        error = self.insert_errors.pop(0) if self.insert_errors else None
        return Call({}, error)


class Service:
    def __init__(self, resource):
        self.resource = resource

    def events(self):
        return self.resource


def dt(hour):
    return datetime(2026, 1, 1, hour, tzinfo=UTC)


def request():
    event = EventRequest("new", "New", 30, (TimeWindow(dt(1), dt(3)),))
    return ScheduleRequest(dt(0), dt(12), 15, (event,))


def test_import_paginates_and_skips_all_day_events():
    pages = [
        {
            "items": [
                {"id": "all-day", "summary": "Holiday", "start": {"date": "2026-01-01"}, "end": {"date": "2026-01-02"}},
                {"id": "busy", "summary": "Meeting", "start": {"dateTime": "2026-01-01T04:00:00Z"}, "end": {"dateTime": "2026-01-01T05:00:00Z"}},
            ],
            "nextPageToken": "next",
        },
        {"items": [{"id": "busy-2", "start": {"dateTime": "2026-01-01T06:00:00Z"}, "end": {"dateTime": "2026-01-01T07:00:00Z"}}]},
    ]
    imported, diagnostics = GoogleCalendarAdapter(Service(EventsResource(pages))).import_busy_intervals(request(), "primary")
    assert [interval.id for interval in imported.busy_intervals] == ["busy", "busy-2"]
    assert "all-day" in diagnostics[0]


def test_export_counts_only_successes_and_reports_partial_failure():
    events = (
        ScheduledEvent("a", "A", 30, dt(1), dt(1) + timedelta(minutes=30)),
        ScheduledEvent("b", "B", 30, dt(2), dt(2) + timedelta(minutes=30)),
    )
    resource = EventsResource(insert_errors=[None, RuntimeError("denied")])
    uploaded, errors = GoogleCalendarAdapter(Service(resource)).export_events(
        ScheduleResult("makespan", "optimal", events), "primary"
    )
    assert uploaded == 1
    assert len(errors) == 1
    assert resource.inserted[0]["body"]["start"]["dateTime"].endswith("Z")
