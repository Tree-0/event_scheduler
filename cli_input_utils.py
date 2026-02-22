# utility functions for getting a user input and returning a value for the cli

import datetime
import uuid
from zoneinfo import ZoneInfo

from data_models.utils import parse_iso_datetime
from data_models import event, window

def user_input_events(num_blocks: int, block_size: int):
    '''
    Gets a list of user-inputted events to feed to the scheduling model
    '''
    print("Would you like to manually input events?")
    manual_event_input = input('(y/n): ') in ['y', 'Y']
    print()

    if manual_event_input:
        # TODO: Allow entering in datetime format instead?
        minute_slots = num_blocks * block_size
        print(f"Enter events in the following format (in minutes on the interval [0,{minute_slots}]): ")
        print("[name] [earliest start] [latest completion] [duration]")
    
    events = []

    while manual_event_input:
        event_string = input().strip()

        # exit manual input
        if event_string.lower() in ["done", "quit", "exit", 'd', 'q', 'e']:
            manual_event_input = False
            break

        parts = event_string.split()
        
        # validate input
        if len(parts) != 4:
            print("Invalid event format. Expected 4 space-separated values.")
            continue
        
        name, wstart, wend, duration = parts
        try:
            wstart = int(wstart)
            wend = int(wend)
            duration = int(duration)
        except:
            print(
                "Invalid numeric values. ",
                "earliest_start, latest_completion, and duration ",
                "must be integers within the scheduling interval."
            )
            continue

        # construct object
        try:
            id = str(uuid.uuid4())
            # TODO: support user input of multiple discontiguous windows for one event
            new_window = [window.Window(wstart, wend)]
            new_event = event.Event(name, id, duration, new_window)
            events.append(new_event)
        except Exception as e:
            print("Unable to create event. Check that window start < window end, ",
                "and make sure the event duration can fit in the window.")
            print("Error Details: ", e)
            continue
    
    return events