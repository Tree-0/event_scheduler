# will need to refactor

# utility functions for getting a user input and returning a value for the cli

import datetime

from data_models.utils import _DT_FMT
def _parse_base_datetime(dt_str: str) -> datetime.datetime:
    """Parse user-provided base datetime (uploads) to an aware UTC datetime."""
    return datetime.datetime.strptime(dt_str, _DT_FMT).replace(tzinfo=datetime.timezone.utc)

def user_input_datetime(config_obj=None) -> datetime.datetime:
        # allow user to pick the base datetime that represents minute 0
        # default: config start_datetime -> now UTC if none/invalid
        base_input = input(
            "Enter base datetime for upload (YYYYMMDD-HH:MM). "
            "Leave blank to use config start_datetime or now (UTC): "
        ).strip()

        base_start_dt = None
        if base_input:
            try:
                base_start_dt = _parse_base_datetime(base_input)
            except ValueError:
                print("Invalid datetime format; expected YYYYMMDD-HH:MM. Using fallback.")

        if base_start_dt is None and config_obj:
            try:
                # try to use start_datetime from config
                base_start_dt = _parse_base_datetime(config_obj.start_datetime)
            except ValueError:
                print("Config start_datetime invalid; using current UTC time.")

        if base_start_dt is None:
            base_start_dt = datetime.datetime.now(datetime.timezone.utc)
        
        return base_start_dt