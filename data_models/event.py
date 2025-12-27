from dataclasses import dataclass
from data_models.window import Window

@dataclass(frozen=True)
class Event:
    name: str # event name
    id: str # some uuid? <-- want to differentiate events of the same name

    duration: int # in minutes
    
    # the window in which the Event is allowed to be scheduled
    # TODO: Make sure validation checks occur somewhere to guarantee
    # that (window.start + duration <= window.end)
    schedulable_window: Window

    start_time: int = None # determined later
    end_time: int = None # determined later (start_time + duration)


    
