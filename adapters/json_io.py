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
def read_event_file(jfile: str, skip_invalid: bool=True) -> List[event.Event]:
    with open(jfile, 'r') as file:
        json_data = json.load(file)
        events = []

        # parse json into events
        for event_json in json_data:
            event_window = window.Window(
                start = event_json["window_start"],
                end = event_json["window_end"]
            )

            try:
                new_event = event.Event(
                    name = event_json["name"],
                    id = event_json["id"],
                    duration = event_json["duration"],
                    schedulable_window = event_window
                )
            except: # if we have an invalid event
                if skip_invalid:
                    # TODO: replace with logger instead?
                    print(f"WARNING: Invalid event while reading event {event_json['id']}, skipping event")
                    continue
                else:
                    raise
            
            # start and end time keys will be present in a results file
            if "start_time" in event_json:
                new_event.start_time = event_json["start_time"]
            if "end_time" in event_json:
                new_event.end_time = event_json["end_time"]

            events.append(new_event)
        
        return events

# write a list of json events back 
def write_event_file(jfile: str, events: List[event.Event]):
    payload = []
    for ev in events:
        ev_json = {
            "name": ev.name,
            "id": ev.id,
            "duration": ev.duration,
            "window_start": ev.schedulable_window.start,
            "window_end": ev.schedulable_window.end,
        }
        if getattr(ev, "start_time", None) is not None:
            ev_json["start_time"] = ev.start_time
        if getattr(ev, "end_time", None) is not None:
            ev_json["end_time"] = ev.end_time
        payload.append(ev_json)
    
    with open(jfile, "w") as file:
        json.dump(payload, file, indent=2)