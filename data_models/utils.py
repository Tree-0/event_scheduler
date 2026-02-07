import math
from datetime import datetime, timedelta, timezone
from typing import Union, List

from data_models import event, window, gcal

ISO_EXAMPLE = "ISO 8601 with offset (e.g., 2026-01-01T00:00:00-06:00)"


def parse_iso_datetime(dt_str: str) -> datetime:
    """Parse an ISO 8601 string with offset or trailing Z into an aware datetime."""
    if not isinstance(dt_str, str):
        raise TypeError("datetime value must be a string in ISO 8601 format with offset")
    normalized = dt_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        raise ValueError("datetime string must include a timezone offset")
    return dt


def parse_gcal_datetime(raw: str) -> datetime:
    """Parse Google Calendar dateTime strings into aware datetimes."""
    if "T" not in raw:
        raise ValueError("Expected a dateTime value for Google Calendar event")
    dt = parse_iso_datetime(raw)
    # If Google ever returns a naive datetime (unlikely), treat it as UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _coerce_datetime(dt_or_str: Union[datetime, str]) -> datetime:
    return dt_or_str if isinstance(dt_or_str, datetime) else parse_iso_datetime(dt_or_str)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def to_blocks(minutes, block_size):
    return minutes // block_size

def duration_to_blocks(duration, block_size):
    # must round up for the number of blocks a duration takes up
    return math.ceil(duration / block_size)

# given a datetime, a start_date (block 0), and a block size (minutes),
# convert the datetime to a block number relative to start_date
def datetime_to_block(target: Union[datetime, str], start_date: Union[datetime, str], block_size: int):
    minutes = datetime_to_minute(target, start_date)
    return to_blocks(minutes, block_size)


def datetime_to_minute(target: Union[datetime, str], start_date: Union[datetime, str]):
    start_dt = _ensure_utc(_coerce_datetime(start_date))
    target_dt = _ensure_utc(_coerce_datetime(target))
    delta = target_dt - start_dt
    return int(delta.total_seconds() // 60)


def block_to_datetime(start_date: Union[datetime, str], block_size: int, block: int):
    minutes = block * block_size
    return minute_to_datetime(start_date, minutes)


def minute_to_datetime(start_date: Union[datetime, str], minute: int):
    start_dt = _ensure_utc(_coerce_datetime(start_date))
    target_dt = start_dt + timedelta(minutes=minute)
    return target_dt

#
# Converting between optimization model Events <--> Google Calendar Events
#

def block_to_datetime_from_base(base_start: datetime, block_size_min: int, block: int) -> datetime:
    """Convert a block index to an aware datetime, relative to base_start."""
    base_start_utc = _ensure_utc(base_start)
    return base_start_utc + timedelta(minutes=block * block_size_min)

def datetime_to_block_from_base(base_start: datetime, block_size_min: int, dt: datetime) -> int:
    """Convert a datetime to a block index relative to base_start."""
    base_start_utc = _ensure_utc(base_start)
    dt_utc = _ensure_utc(dt)
    delta_min = (dt_utc - base_start_utc).total_seconds() / 60
    return math.floor(delta_min / block_size_min)

def event_to_gcal_event(event: event.Event, base_start: datetime, description: str = '') -> gcal.GoogleCalendarEvent:
    """
    Convert a scheduled Event (start_time as minute offset) into a GoogleCalendarEvent.
    base_start: datetime representing minute 0.
    """
    if event.start_time is None:
        raise ValueError("Event.start_time must be set before conversion to GoogleCalendarEvent")

    base_utc = _ensure_utc(base_start)
    start_dt = base_utc + timedelta(minutes=event.start_time)
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

    base = _ensure_utc(base_start)
    start_dt = _ensure_utc(g_event.start_dt)
    end_dt = _ensure_utc(g_event.end_dt)

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

#
# Checking for overlap and conflicts between events
#

def deduplicate_events(events):
    """Drop duplicate event IDs (Google Calendar can return the same event more than once)."""
    deduped = []
    seen_ids = set()
    for ev in events:
        if ev.id in seen_ids:
            print(f"Skipping duplicate event id={ev.id} name={ev.name}")
            continue
        seen_ids.add(ev.id)
        deduped.append(ev)
    return deduped


def warn_overlapping_fixed_events(events):
    """Emit a warning if two fixed events (no slack in their only window) overlap."""
    fixed = []
    for ev in events:
        if len(ev.schedulable_windows) != 1:
            continue
        win = ev.schedulable_windows[0]
        if (win.end - win.start) != ev.duration:
            continue  # not fully fixed; scheduler can slide it
        fixed.append((win.start, win.end, ev))

    fixed.sort(key=lambda t: t[0])
    for first, second in zip(fixed, fixed[1:]):
        if first[1] > second[0]:
            a, b = first[2], second[2]
            print(f"Warning: fixed events overlap -> '{a.name}' [{first[0]}, {first[1]}] and '{b.name}' [{second[0]}, {second[1]}]")

def merge_overlapping_fixed_events(events: List[event.Event]):
    """
    Given a list of fixed events, return a new list with any overlapping fixed events merged into one new event
    that covers the entire interval. This is to prevent infeasibility in the CP scheduler. 
    """
    # Identify fixed events
    fixed = []
    non_fixed = []
    for ev in events:
        if len(ev.schedulable_windows) != 1:
            non_fixed.append(ev)
            continue
        win = ev.schedulable_windows[0]
        if (win.end - win.start) != ev.duration:
            non_fixed.append(ev)
            continue
        fixed.append((win.start, win.end, ev))
    
    if not fixed:
        return events
    
    # Sort by start time
    fixed.sort(key=lambda t: t[0])
    
    # Merge overlapping intervals
    merged_intervals = []
    current_start, current_end, merged_event = fixed[0]
    
    for start, end, ev in fixed[1:]:
        if start <= current_end:
            # Overlapping or adjacent; merge
            current_end = max(current_end, end)
            # Merge event names and take union of properties
            merged_event = event.Event(
                name=f"{merged_event.name}|{ev.name}",
                id=merged_event.id,
                duration=current_end - current_start,
                schedulable_windows=[window.Window(start=current_start, end=current_end)],
                start_time=current_start,
                end_time=current_end,
            )
        else:
            # No overlap; save current and start new
            merged_intervals.append((current_start, current_end, merged_event))
            current_start, current_end, merged_event = start, end, ev
    
    # Add the last interval
    merged_intervals.append((current_start, current_end, merged_event))
    
    # Return merged fixed events plus non-fixed events
    result = [merged_event for _, _, merged_event in merged_intervals] + non_fixed
    return result