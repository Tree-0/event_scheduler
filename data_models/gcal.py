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
    
    # assume UTC time
    start_dt: datetime
    end_dt: datetime

    colorId: str = ''

    # need some constructor that takes an event.Event object and translates the data
    pass

@dataclass
class GoogleCalendar:
    # ditto
    id: str

    events: List[GoogleCalendarEvent]