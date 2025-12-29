from dataclasses import dataclass

@dataclass(frozen=True)
class Window:
    # validation for start < end done in data_models/event.py Event struct
    start: int # in minutes
    end: int # in minutes
    