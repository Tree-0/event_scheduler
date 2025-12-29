from data_models.event import Event
from typing import List

# Simple tool for visualizing events in a timeline
# Assumes events cannot overlap
class EventTimeline:
    @classmethod
    def display(events: List[Event], config):
        pass

    # perhaps another function for more "machine-scheduling-esque" 
    # problems that can have overlapping tasks