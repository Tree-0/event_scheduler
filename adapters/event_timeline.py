from data_models.event import Event
from config.config import Config
from typing import List
import math

# Simple tool for visualizing events in a timeline
# Assumes events cannot overlap
class EventTimeline:
    @staticmethod
    def _to_block_range(start_min: int, duration_min: int, block_size: int):
        start_block = start_min // block_size
        # end_block is exclusive
        end_block = math.ceil((start_min + duration_min) / block_size)
        return start_block, end_block

    @staticmethod
    def display(events: List[Event], config: Config):
        block_size = config.block_size
        num_blocks = config.num_blocks

        timeline = ['.'] * num_blocks
        legend = []

        for idx, ev in enumerate(events):
            label = str(idx % 10)  # single char
            sb, eb = EventTimeline._to_block_range(ev.start_time, ev.duration, block_size)
            sb = max(0, sb)
            eb = min(num_blocks, eb)

            for b in range(sb, eb):
                if timeline[b] != '.':
                    timeline[b] = 'X'  # overlap marker
                else:
                    timeline[b] = label

            legend.append(f"{label}: {ev.name} ({ev.start_time}–{ev.end_time} min)")

        # print timeline
        print("Blocks ({} min each):".format(block_size))
        print(''.join(timeline))
        if legend:
            print("Legend:")
            for line in legend:
                print(f"  {line}")

    # perhaps another function for more "machine-scheduling-esque" 
    # problems that can have overlapping tasks