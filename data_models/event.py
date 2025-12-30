from dataclasses import dataclass, field
from typing import List
from data_models.window import Window, merge_windows

@dataclass
class Event:
    name: str # event name
    id: str # some uuid? <-- want to differentiate events of the same name

    duration: int  # in minutes

    # list of windows in which the Event is allowed to be scheduled
    schedulable_windows: List[Window]

    start_time: int = None # determined later
    end_time: int = None # determined later (start_time + duration)

    def __post_init__(self):
        if not self.schedulable_windows:
            raise ValueError("Event must have at least one schedulable window")

        # validate individual windows and merge overlaps/adjacent ranges
        for w in self.schedulable_windows:
            if w.end <= w.start:
                raise ValueError("Event window end must be strictly greater than start")

        merged = merge_windows(self.schedulable_windows)

        # ensure at least one window can fit the duration
        if all(w.end - w.start < self.duration for w in merged):
            raise ValueError(f"No window can fit event duration of {self.duration}")

        # store merged list back
        object.__setattr__(self, "schedulable_windows", merged)

    
