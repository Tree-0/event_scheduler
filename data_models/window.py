from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class Window:
    start: int  # in minutes
    end: int    # in minutes


def merge_windows(windows: List[Window]) -> List[Window]:
    if not windows:
        return []

    # sort by start time, then merge overlapping or touching intervals
    sorted_windows = sorted(windows, key=lambda w: (w.start, w.end))
    merged: List[Window] = [sorted_windows[0]]

    for win in sorted_windows[1:]:
        last = merged[-1]
        if win.start <= last.end:  # overlap or touching
            merged[-1] = Window(start=last.start, end=max(last.end, win.end))
        else:
            merged.append(win)

    return merged
    