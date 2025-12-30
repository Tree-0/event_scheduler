import math
from datetime import datetime, timedelta


_DT_FMT = "%Y%m%d-%H:%M"
def _parse(dt_str: str) -> datetime:
    return datetime.strptime(dt_str, _DT_FMT)

def to_blocks(minutes, block_size):
    return minutes // block_size

def duration_to_blocks(duration, block_size):
    # must round up for the number of blocks a duration takes up
    return math.ceil(duration / block_size)

# given a datetime, a start_date (block 0), and a block size (minutes),
# convert the datetime to a block number relative to start_date
def datetime_to_block(datetime: str, start_date: str, block_size):
    minutes = datetime_to_minute(datetime, start_date)
    return to_blocks(minutes, block_size)

def datetime_to_minute(datetime: str, start_date: str):
    start_dt = _parse(start_date)
    target_dt = _parse(datetime)
    delta = target_dt - start_dt
    return int(delta.total_seconds() // 60)

def block_to_datetime(start_date: str, block_size: int, block: int):
    minutes = block * block_size
    return minute_to_datetime(start_date, minutes)

def minute_to_datetime(start_date: str, minute: int):
    start_dt = _parse(start_date)
    target_dt = start_dt + timedelta(minutes=minute)
    return target_dt.strftime(_DT_FMT)
