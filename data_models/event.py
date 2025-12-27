from dataclasses import dataclass
from window import Window

@dataclass
class Event:
    name: str # event name
    id: str # some uuid? <-- want to differentiate events of the same name

    duration: int # in minutes
    start_time: int = None # determined later
    end_time: int = None # determined later (start_time + duration)
    schedulable_window: Window


    
