import datetime
import pytest

from data_models.utils import (
    datetime_to_block,
    datetime_to_minute,
    block_to_datetime,
    minute_to_datetime,
    duration_to_blocks,
    to_blocks,
    block_to_datetime_from_base,
    datetime_to_block_from_base,
    event_to_gcal_event,
    gcal_event_to_model_event,
)
from data_models.event import Event
from data_models.window import Window
from data_models.gcal import GoogleCalendarEvent

START = "20260101-00:00"
BLOCK = 15


@pytest.mark.parametrize(
    "minutes, block_size, expected",
    [
        (30, BLOCK, 2),
        (31, BLOCK, 2),
        (59, 30, 1),
    ],
)
def test_to_blocks(minutes, block_size, expected):
    assert to_blocks(minutes, block_size) == expected


@pytest.mark.parametrize(
    "duration, block_size, expected",
    [
        (30, BLOCK, 2),
        (31, BLOCK, 3),
        (59, 30, 2),
    ],
)
def test_duration_to_blocks(duration, block_size, expected):
    assert duration_to_blocks(duration, block_size) == expected


@pytest.mark.parametrize(
    "target, expected_minutes",
    [
        ("20260101-00:00", 0),
        ("20260101-01:00", 60),
        ("20260102-00:00", 24 * 60),
        ("20251231-23:45", -15),  # target before start
    ],
)
def test_datetime_to_minute(target, expected_minutes):
    assert datetime_to_minute(target, START) == expected_minutes


@pytest.mark.parametrize(
    "target, expected_block",
    [
        ("20260101-00:00", 0),
        ("20260101-01:00", 4),
        ("20260102-00:00", 96),
        ("20251231-23:45", -1),
    ],
)
def test_datetime_to_block(target, expected_block):
    assert datetime_to_block(target, START, BLOCK) == expected_block


@pytest.mark.parametrize(
    "minute_offset, expected_dt",
    [
        (0, "20260101-00:00"),
        (60, "20260101-01:00"),
        (24 * 60, "20260102-00:00"),
        (-15, "20251231-23:45"),
    ],
)
def test_minute_to_datetime(minute_offset, expected_dt):
    assert minute_to_datetime(START, minute_offset) == expected_dt


@pytest.mark.parametrize(
    "block_index, expected_dt",
    [
        (0, "20260101-00:00"),
        (4, "20260101-01:00"),
        (96, "20260102-00:00"),
        (-1, "20251231-23:45"),
    ],
)
def test_block_to_datetime(block_index, expected_dt):
    assert block_to_datetime(START, BLOCK, block_index) == expected_dt


@pytest.mark.parametrize(
    "dt",
    [
        "20260101-00:00",
        "20260101-05:30",
        "20260102-12:15",
    ],
)
def test_round_trip_datetime_to_block_and_back(dt):
    block = datetime_to_block(dt, START, BLOCK)
    dt_back = block_to_datetime(START, BLOCK, block)
    assert dt_back == minute_to_datetime(START, datetime_to_minute(dt, START))


def test_block_to_datetime_from_base_naive_to_aware():
    base = datetime.datetime(2026, 1, 1, 0, 0)  # naive
    dt = block_to_datetime_from_base(base, block_size_min=15, block=4)
    assert dt.tzinfo is not None
    assert dt.isoformat() == "2026-01-01T01:00:00+00:00"


def test_block_to_datetime_from_base_aware():
    base = datetime.datetime(2026, 1, 1, 0, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=-6)))  # CST
    dt = block_to_datetime_from_base(base, block_size_min=30, block=2)
    assert dt.isoformat() == "2026-01-01T01:00:00-06:00"


def test_event_to_gcal_event_success():
    ev = Event(
        name="Test",
        id="evt-1",
        duration=45,
        schedulable_windows=[Window(start=0, end=300)],
    )
    ev.start_time = 60  # minutes after base_start
    base = datetime.datetime(2026, 1, 1, 0, 0, tzinfo=datetime.timezone.utc)

    g_ev = event_to_gcal_event(ev, base_start=base, description="desc")
    assert isinstance(g_ev, GoogleCalendarEvent)
    assert g_ev.summary == "Test"
    assert g_ev.description == "desc"
    assert g_ev.start_dt == datetime.datetime(2026, 1, 1, 1, 0, tzinfo=datetime.timezone.utc)
    assert g_ev.end_dt == datetime.datetime(2026, 1, 1, 1, 45, tzinfo=datetime.timezone.utc)


def test_event_to_gcal_event_requires_start_time():
    ev = Event(
        name="NoStart",
        id="evt-2",
        duration=30,
        schedulable_windows=[Window(start=0, end=300)],
    )
    base = datetime.datetime(2026, 1, 1, 0, 0, tzinfo=datetime.timezone.utc)

    with pytest.raises(ValueError):
        _ = event_to_gcal_event(ev, base_start=base)


def test_gcal_event_to_model_event_roundtrip_minutes():
    base = datetime.datetime(2026, 1, 1, 0, 0, tzinfo=datetime.timezone.utc)
    g_ev = GoogleCalendarEvent(
        id="g1",
        summary="G Event",
        description="",
        start_dt=datetime.datetime(2026, 1, 1, 1, 0, tzinfo=datetime.timezone.utc),
        end_dt=datetime.datetime(2026, 1, 1, 1, 45, tzinfo=datetime.timezone.utc),
    )
    ev = gcal_event_to_model_event(g_ev, base_start=base)
    assert isinstance(ev, Event)
    assert ev.start_time == 60
    assert ev.duration == 45
    assert ev.end_time == 105
    assert ev.schedulable_windows == [Window(start=60, end=105)]


def test_gcal_event_to_model_event_naive_datetimes_assume_utc():
    base = datetime.datetime(2026, 1, 1, 0, 0)  # naive
    g_ev = GoogleCalendarEvent(
        id="g2",
        summary="Naive",
        description="",
        start_dt=datetime.datetime(2026, 1, 1, 2, 0),  # naive
        end_dt=datetime.datetime(2026, 1, 1, 2, 30),   # naive
    )
    ev = gcal_event_to_model_event(g_ev, base_start=base)
    assert ev.start_time == 120
    assert ev.end_time == 150


def test_gcal_event_to_model_event_requires_positive_duration():
    base = datetime.datetime(2026, 1, 1, 0, 0, tzinfo=datetime.timezone.utc)
    g_ev = GoogleCalendarEvent(
        id="g3",
        summary="Bad",
        description="",
        start_dt=datetime.datetime(2026, 1, 1, 1, 0, tzinfo=datetime.timezone.utc),
        end_dt=datetime.datetime(2026, 1, 1, 1, 0, tzinfo=datetime.timezone.utc),
    )
    with pytest.raises(ValueError):
        _ = gcal_event_to_model_event(g_ev, base_start=base)
