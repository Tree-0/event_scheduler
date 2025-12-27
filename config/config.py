# TODO: create an easy data class to pass around when creating models
# This will involve abstracting out block_size and num_blocks that we pass through to scheduler_factory

from dataclasses import dataclass

@dataclass
class Config:
    pass