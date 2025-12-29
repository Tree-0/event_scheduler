import argparse
import yaml
import pathlib
from opt_models import scheduler_factory
from config.config import Config
from adapters.event_timeline import EventTimeline
from adapters.json_io import read_event_file, write_event_file

from ortools.sat.python import cp_model # want to abstract this

#
# Read config file
#

print("(optional) enter config file: ")
config_file = input().strip()

if not config_file or not pathlib.Path(config_file).exists():
    print("Unable to locate config file... using defaults.")

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

while manual_event_input:
    # TODO
    print("NOT IMPLEMENTED")
    manual_event_input = False

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
        print(f"    start: {e.start_time} | end: {e.end_time} | duration: {e.duration} minutes")
    
    print(f"\n{'=' * 50}\nTIMELINE: ")
    EventTimeline.display(scheduler.events, config_obj)
    print()

    # serialize to json
    write_event_file(f"tests/outputs/{event_file.split('/')[-1]}", scheduler.events)
else:
    print("NO SCHEDULING SOLUTION FOUND")
