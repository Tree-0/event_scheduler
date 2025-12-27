import argparse
import yaml
import pathlib
from opt_models import scheduler_factory

#
# Read config file
#

print("(optional) enter config file: ")
config = input().strip()

# defaults
block_size = 15
num_blocks = 672
event_file = ''
scheduling_model = ''

if not config:
    print("loading defaults.")
elif not pathlib.Path(config).exists():
    print("unrecognized config file. Using defaults instead.")
else:
    with open(config, 'r') as config_file:
        config_data = yaml.safe_load(config_file)
        print(config_data)
    
    block_size = config_data['block_size']
    num_blocks = config_data['num_blocks']
    event_file = config_data['event_file']
    scheduling_model = config_data['scheduling_model']

#
# read events from file
#

events = []
if event_file:
    print(f"reading {event_file}...")
    if not pathlib.Path(event_file).exists():
        print(f"unrecognized events file. Enter manually in the next step.")
    else:
        from adapters.json_io import read_event_file
        events = read_event_file(event_file)

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

if not scheduling_model:
    print("enter scheduling model type: ")
    # TODO: global list of scheduling model names
    scheduling_model = input().strip()

model_factory = scheduler_factory.SchedulerFactory()
model_factory.create_scheduler_model(
    scheduling_model, 
    events, 
    block_size, 
    num_blocks
)