import pathlib
import uuid
from opt_models import scheduler_factory
from config.config import Config
from adapters.event_timeline import EventTimeline
from adapters.json_io import read_event_file, write_event_file
from data_models import event, window

from ortools.sat.python import cp_model # want to abstract this

from data_models.utils import (
    block_to_datetime,
    minute_to_datetime
)

#
# Read config file
#

print("(optional) enter config file: ")
config_file = input().strip()

if not config_file or not pathlib.Path(config_file).exists():
    print()
    print(" UNABLE TO LOCATE CONFIG FILE... using defaults.")

config_obj = Config()
config_obj.load_config(config_file)

print(config_obj)

#
# read events from file
#

events = []

event_file = config_obj.event_file
if event_file:
    print(f"reading {event_file}...")
    if not pathlib.Path(event_file).exists():
        print(f"unrecognized events file. Enter manually in the next step.")
    else:
        events = read_event_file(event_file, config_obj.json_skip_invalid_events)

print()
print("current events:")
for ev in events:
    print(ev)
print()

#
# manually enter additional events
#

print("Would you like to manually input events?")
manual_event_input = input('(y/n): ') in ['y', 'Y']
print()

if manual_event_input:
    # TODO: Allow entering in datetime format instead?
    minute_slots = config_obj.num_blocks * config_obj.block_size
    print(f"Enter events in the following format (in minutes on the interval [0,{minute_slots}]): ")
    print("[name] [earliest start] [latest completion] [duration]")

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
        new_window = window.Window(wstart, wend)
        new_event = event.Event(name, id, duration, new_window)
        events.append(new_event)
    except:
        print("Unable to create event. Check that window start < window end, ",
              "and make sure the event duration can fit in the window.")
        continue

#
# configure model and solve
#

scheduling_model = config_obj.scheduling_model
if not scheduling_model:
    print("enter scheduling model type: ")
    # TODO: global list of scheduling model names
    scheduling_model = input().strip()

model_factory = scheduler_factory.SchedulerFactory()
scheduler = model_factory.create_scheduler_model(
    scheduling_model, 
    events, 
    config_obj
)

scheduler.build_model()
status = scheduler.solve()

# TODO: expand checks for solver status, provide more info, visual display of events
# TODO: abstract out cp_model from cli.py
# print events by start time
if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
    scheduler.events.sort(key=lambda e: e.start_time)
    for e in scheduler.events:
        print(f"{e.name} - {e.id}")
        print(f"    start: {minute_to_datetime(config_obj.start_datetime, e.start_time)}",
              f" | end: {minute_to_datetime(config_obj.start_datetime, e.end_time)}",
              f" | duration: {e.duration} minutes")
    
    print(f"\n{'=' * 50}\nTIMELINE: ")
    EventTimeline.display(scheduler.events, config_obj)
    print()

    # serialize to json
    write_event_file(f"tests/outputs/{event_file.split('/')[-1]}", scheduler.events)
else:
    print("NO SCHEDULING SOLUTION FOUND")
