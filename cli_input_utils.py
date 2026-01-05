# will need to refactor

# utility functions for getting a user input and returning a value for the cli

import datetime
import uuid
from zoneinfo import ZoneInfo

from data_models.utils import _DT_FMT
from data_models import event, window


def _parse_base_datetime(dt_str: str, tz_name: str) -> datetime.datetime:
    """Parse user-provided base datetime to an aware datetime using an IANA timezone."""
    tz = ZoneInfo(tz_name)
    return datetime.datetime.strptime(dt_str, _DT_FMT).replace(tzinfo=tz)


def user_input_datetime(config_obj=None) -> datetime.datetime:
    # allow user to pick the base datetime that represents minute 0
    # default: config start_datetime -> now in configured TZ if none/invalid
    tz_name = getattr(config_obj, "user_timezone", "UTC") if config_obj else "UTC"

    base_input = input(
        "Enter base datetime for upload (YYYYMMDD-HH:MM). "
        "Leave blank to use config start_datetime or now (configured TZ): "
    ).strip()

    base_start_dt = None
    if base_input:
        try:
            base_start_dt = _parse_base_datetime(base_input, tz_name)
        except Exception:
            print("Invalid datetime or timezone; expected YYYYMMDD-HH:MM with a valid IANA TZ. Using fallback.")

    if base_start_dt is None and config_obj and config_obj.start_datetime:
        try:
            # try to use start_datetime from config
            base_start_dt = _parse_base_datetime(config_obj.start_datetime, tz_name)
        except Exception:
            print("Config start_datetime invalid; using current time in configured TZ.")

    if base_start_dt is None:
        try:
            base_start_dt = datetime.datetime.now(ZoneInfo(tz_name))
        except Exception:
            base_start_dt = datetime.datetime.now(datetime.timezone.utc)
            print("Configured timezone invalid; defaulting to UTC.")
    
    return base_start_dt


def user_input_events(num_blocks: int, block_size: int):
    '''
    Gets a list of user-inputted events to feed to the scheduling model
    '''
    print("Would you like to manually input events?")
    manual_event_input = input('(y/n): ') in ['y', 'Y']
    print()

    if manual_event_input:
        # TODO: Allow entering in datetime format instead?
        minute_slots = num_blocks * block_size
        print(f"Enter events in the following format (in minutes on the interval [0,{minute_slots}]): ")
        print("[name] [earliest start] [latest completion] [duration]")
    
    events = []

    while manual_event_input:
        event_string = input().strip()

        # exit manual input
        if event_string.lower() in ["done", "quit", "exit", 'd', 'q', 'e']:
            manual_event_input = False
            break

        parts = event_string.split()
        
        # validate input
        if len(parts) != 4:
            print("Invalid event format. Expected 4 space-separated values.")
            continue
        
        name, wstart, wend, duration = parts
        try:
            wstart = int(wstart)
            wend = int(wend)
            duration = int(duration)
        except:
            print(
                "Invalid numeric values. ",
                "earliest_start, latest_completion, and duration ",
                "must be integers within the scheduling interval."
            )
            continue

        # construct object
        try:
            id = str(uuid.uuid4())
            # TODO: support user input of multiple discontiguous windows for one event
            new_window = [window.Window(wstart, wend)]
            new_event = event.Event(name, id, duration, new_window)
            events.append(new_event)
        except Exception as e:
            print("Unable to create event. Check that window start < window end, ",
                "and make sure the event duration can fit in the window.")
            print("Error Details: ", e)
            continue
    
    return events