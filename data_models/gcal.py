# structs to model the google calendar API objects

from dataclasses import dataclass
from typing import List

@dataclass
class GoogleCalendarEvent:
    # will fill this out to be compatible with API 

    # need some constructor that takes an event.Event object and translates the data
    pass

@dataclass
class GoogleCalendar:
    # ditto
    events: List[GoogleCalendarEvent]