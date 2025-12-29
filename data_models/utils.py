import math

def to_blocks(minutes, block_size):
    return minutes // block_size

def duration_to_blocks(duration, block_size):
    # must round up for the number of blocks a duration takes up
    return math.ceil(duration / block_size)