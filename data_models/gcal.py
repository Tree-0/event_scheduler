# structs to model the google calendar API objects

from dataclasses import dataclass
from typing import List
import datetime

@dataclass
class GoogleCalendarEvent:
    # will fill this out to be compatible with API 
    id: str
    summary: str
    description: str

    # will be in a specified timezone from config, or UTC default
    start_dt: datetime
    end_dt: datetime

    colorId: str = ''

    # need some constructor that takes an event.Event object and translates the data.
    # Alternatively (and what I currently do), a util function for conversions can work.
    # see data_models/utils.py

@dataclass
class GoogleCalendar:
    # ditto
    id: str

    events: List[GoogleCalendarEvent]