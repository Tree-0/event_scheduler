import pytest

from data_models.utils import (
    datetime_to_block,
    datetime_to_minute,
    block_to_datetime,
    minute_to_datetime,
    duration_to_blocks,
    to_blocks,
)


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
