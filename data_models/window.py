from dataclasses import dataclass

@dataclass(frozen=True)
class Window:
    start: int # in minutes
    end: int # in minutes
    