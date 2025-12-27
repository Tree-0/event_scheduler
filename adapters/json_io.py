#
# for reading and writing json files:
# - test cases
# - event lists
# - solver outputs
#
import json 
from typing import List
from data_models import event, window

# read json file containing a list of events
def read_event_file(jfile: str) -> List[event.Event]:
    with open(jfile, 'r') as file:
        json_data = json.load(file)
        events = []

        # parse json into events
        for event_json in json_data:
            event_window = window.Window(
                start = event_json["window_start"],
                end = event_json["window_end"]
            )
            new_event = event.Event(
                name = event_json["name"],
                id = event_json["id"],
                duration = event_json["duration"],
                schedulable_window = event_window
            )
            # TODO: check for start_time and end_time keys?

            events.append(new_event)
        
        return events

# write a list of json events back 
def write_event_file(jfile: str, events: List[event.Event]):
    pass