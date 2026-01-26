from datetime import datetime
import pytest

from adapters.gcal_io import (
    GoogleCalendarIO
)

gcal_io: GoogleCalendarIO = GoogleCalendarIO()

@pytest.mark.parametrize(
    "after_dt, before_dt",
    [
        (datetime.now(), datetime(2026, 1, 1))
    ]
)
def test_error_get_calendar_events_objects(after_dt, before_dt):
    with pytest.raises(ValueError):
        gcal_io.get_calendar_events_objects(
            after_dt=after_dt,
            calendar_id="primary",
            before_dt=before_dt,
            limit=10
        )