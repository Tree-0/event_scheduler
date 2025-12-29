from dataclasses import dataclass
from data_models.window import Window

@dataclass#(frozen=True)
class Event:
    name: str # event name
    id: str # some uuid? <-- want to differentiate events of the same name

    duration: int # in minutes
    
    # the window in which the Event is allowed to be scheduled
    schedulable_window: Window

    start_time: int = None # determined later
    end_time: int = None # determined later (start_time + duration)

    # validation
    def __post_init__(self):
        if self.schedulable_window.end <= self.schedulable_window.start:
            raise ValueError(f"Event window end must be strictly greater than window start")
        if self.schedulable_window.end - self.schedulable_window.start < self.duration:
            raise ValueError(f"Event window cannot be smaller than event duration of {self.duration}")

    
