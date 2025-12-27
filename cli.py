import argparse
import yaml
import pathlib

# Read config file

print("(optional) enter config file: ")
config = input().strip()

# defaults
block_size = 15
num_blocks = 672

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

# print(block_size)
# print(num_blocks)

