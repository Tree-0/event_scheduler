# will need to refactor

# utility functions for getting a user input and returning a value for the cli

import datetime
from zoneinfo import ZoneInfo

from data_models.utils import _DT_FMT


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