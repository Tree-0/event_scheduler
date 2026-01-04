import math
from datetime import datetime, timedelta, timezone

from data_models import event, window, gcal

_DT_FMT = "%Y%m%d-%H:%M"
def _parse(dt_str: str) -> datetime:
    return datetime.strptime(dt_str, _DT_FMT)

def to_blocks(minutes, block_size):
    return minutes // block_size

def duration_to_blocks(duration, block_size):
    # must round up for the number of blocks a duration takes up
    return math.ceil(duration / block_size)

# given a datetime, a start_date (block 0), and a block size (minutes),
# convert the datetime to a block number relative to start_date
def datetime_to_block(datetime: str, start_date: str, block_size: int):
    minutes = datetime_to_minute(datetime, start_date)
    return to_blocks(minutes, block_size)

def datetime_to_minute(datetime: str, start_date: str):
    start_dt = _parse(start_date)
    target_dt = _parse(datetime)
    delta = target_dt - start_dt
    return int(delta.total_seconds() // 60)

def block_to_datetime(start_date: str, block_size: int, block: int):
    minutes = block * block_size
    return minute_to_datetime(start_date, minutes)

def minute_to_datetime(start_date: str, minute: int):
    start_dt = _parse(start_date)
    target_dt = start_dt + timedelta(minutes=minute)
    return target_dt.strftime(_DT_FMT)

#
# Converting between optimization model Events <--> Google Calendar Events
#

def block_to_datetime_from_base(base_start: datetime, block_size_min: int, block: int) -> datetime:
    """Convert a block index to an aware datetime, relative to base_start."""
    if base_start.tzinfo is None:
        base_start = base_start.replace(tzinfo=timezone.utc)
    return base_start + timedelta(minutes=block * block_size_min)

def datetime_to_block_from_base(base_start: datetime, block_size_min: int, dt: datetime) -> int:
    """Convert a datetime to a block index relative to base_start."""
    if base_start.tzinfo is None:
        base_start = base_start.replace(tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta_min = (dt - base_start).total_seconds() / 60
    return math.floor(delta_min / block_size_min)

def event_to_gcal_event(event: event.Event, base_start: datetime, description: str = '') -> gcal.GoogleCalendarEvent:
    """
    Convert a scheduled Event (start_time as minute offset) into a GoogleCalendarEvent.
    base_start: datetime representing minute 0.
    """
    if event.start_time is None:
        raise ValueError("Event.start_time must be set before conversion to GoogleCalendarEvent")

    base = base_start if base_start.tzinfo else base_start.replace(tzinfo=timezone.utc)
    start_dt = base + timedelta(minutes=event.start_time)
    end_dt = start_dt + timedelta(minutes=event.duration)

    return gcal.GoogleCalendarEvent(
        id=event.id or '',
        summary=event.name,
        description=description,
        start_dt=start_dt,
        end_dt=end_dt,
    )

def gcal_event_to_model_event(g_event: gcal.GoogleCalendarEvent, base_start: datetime) -> event.Event:
    """
    Convert a GoogleCalendarEvent into an Event using minute offsets from base_start.
    - base_start: datetime representing minute 0.
    """
    if g_event.start_dt is None or g_event.end_dt is None:
        raise ValueError("GoogleCalendarEvent must have start_dt and end_dt set")

    base = base_start if base_start.tzinfo else base_start.replace(tzinfo=timezone.utc)
    start_dt = g_event.start_dt if g_event.start_dt.tzinfo else g_event.start_dt.replace(tzinfo=timezone.utc)
    end_dt = g_event.end_dt if g_event.end_dt.tzinfo else g_event.end_dt.replace(tzinfo=timezone.utc)

    delta_min = (start_dt - base).total_seconds() / 60
    start_min = math.floor(delta_min)
    duration_min = (end_dt - start_dt).total_seconds() / 60
    if duration_min <= 0:
        raise ValueError("GoogleCalendarEvent end_dt must be after start_dt")
    duration_min = math.ceil(duration_min)
    end_min = start_min + duration_min

    return event.Event(
        name=g_event.summary,
        id=g_event.id or '',
        duration=int(duration_min),
        schedulable_windows=[window.Window(start=start_min, end=end_min)],
        start_time=start_min,
        end_time=end_min,
    )