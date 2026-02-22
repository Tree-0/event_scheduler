import pathlib
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from opt_models import scheduler_factory
from config.config import Config
from adapters.event_timeline import EventTimeline
from adapters.json_io import read_event_file, write_event_file
from adapters.gcal_io import GoogleCalendarIO
from data_models import event, window

from typing import List

from ortools.sat.python import cp_model # want to abstract this

from data_models.utils import (
    block_to_datetime,
    event_to_gcal_event,
    gcal_event_to_model_event,
    deduplicate_events,
    warn_overlapping_fixed_events,
    merge_overlapping_fixed_events
)

import cli_input_utils

#
# (0) Read config file
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
# (1) read events from file
#

events: List[event.Event] = []

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
# (2) manually enter additional events
#

# TODO: are these coerced into UTC properly?
user_input_events = cli_input_utils.user_input_events(
    config_obj.num_blocks, config_obj.block_size
)
events.extend(user_input_events)

# shallow copy of the new events we are trying to schedule on the calendar
events_to_schedule = events.copy()

#
# (3) Read Google Calendar events that exist in the window we are scheduling.
# Currently we read a bunch of events after the start_date
# Treat these events as fixed: i.e. other events must not overlap with these
#

gcal_io = GoogleCalendarIO()

# get the configured timezone for the date times the user is inputting
user_tz = ZoneInfo(config_obj.user_timezone)

# get config starting date, or set to today if none provided
# TODO: this is a timezone aware datetime, probably need to amke sure it is consistent
# with the user_tz in config -> otherwise coerce it into the user's timezone
config_start_dt = config_obj.start_datetime

if config_start_dt is None:
    config_start_dt = datetime.now(tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

# compute the last datetime in our window based on our scheduling
# block size and the number of blocks
config_before_dt = block_to_datetime(
    config_start_dt,
    config_obj.block_size,
    config_obj.num_blocks
)

# get the events from the google calendar that we need to schedule around
fixed_gcal_events = gcal_io.get_calendar_events_objects(
    config_start_dt,
    config_before_dt,
    'primary',
    limit=20
)

# convert gcal to model events we will send to scheduler
modeled_gcal_events = [gcal_event_to_model_event(gcal_ev, config_start_dt) for gcal_ev in fixed_gcal_events]
events.extend(modeled_gcal_events)

# remove any duplicates and flag immovable but overlapping events...
# I realize "flag" is vague, final behavior tbd
events = deduplicate_events(events)
warn_overlapping_fixed_events(events)
merged_events = merge_overlapping_fixed_events(events)

print("All events to be sent to scheduler: ")
for e in merged_events:
    print(e)

#
# configure model and solve
#

scheduling_model = config_obj.scheduling_model
if not scheduling_model:
    print("enter scheduling model type: ")
    # TODO: global list of scheduling model names, validate model name
    scheduling_model = input().strip()

model_factory = scheduler_factory.SchedulerFactory()
scheduler = model_factory.create_scheduler_model(
    scheduling_model, 
    merged_events, 
    config_obj
)

scheduler.build_model()
status = scheduler.solve()

# TODO: expand checks for solver status, provide more info
# TODO: abstract out cp_model from cli.py?
# print events by start time
if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
    scheduler.events.sort(key=lambda e: e.start_time)
    for e in scheduler.events:
        start_dt_local = (config_start_dt + timedelta(minutes=e.start_time)).astimezone(user_tz)
        end_dt_local = (config_start_dt + timedelta(minutes=e.end_time)).astimezone(user_tz)
        print(f"{e.name} - {e.id}")
        print(
            f"    start: {start_dt_local.isoformat()}",
            f" | end: {end_dt_local.isoformat()}",
            f" | duration: {e.duration} minutes"
        )
    
    print(f"\n{'=' * 50}\nTIMELINE: ")
    EventTimeline.display(scheduler.events, config_obj)
    print()

    # serialize to json
    write_event_file(f"tests/outputs/{event_file.split('/')[-1] if event_file else 'SCHEDULE'}", scheduler.events)

    #
    # Write events to google calendar API
    #

    print("Write this schedule to your Google Calendar?")
    write_to_gcal = input("(y/n): ").strip().lower() == 'y'
    if write_to_gcal:
        # convert model events to google cal events

        #base_start_dt: datetime = cli_input_utils.user_input_datetime(config_obj)
        base_start_dt: datetime = config_start_dt

        upload_tz = user_tz.key

        gcal_events = []
        # scheduler.solve() will have modified the events by setting their start and end times.
        # Only writes events to the gcal that we did not already pull from the gcal
        for e in events_to_schedule:
            
            gcal_event = event_to_gcal_event(e, base_start_dt, e.description)
            print(gcal_event)
            gcal_events.append(gcal_event)

        # TODO: let user choose what calendar they are uploading to
        uploaded_count = gcal_io.send_events_to_calendar("primary", gcal_events, upload_tz)

        print(f"{uploaded_count}/{len(gcal_events)} uploaded to primary google calendar.")
    
else:
    print("NO SCHEDULING SOLUTION FOUND")
