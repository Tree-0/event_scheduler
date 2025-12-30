# A dataclass to parse configuration from a .yaml file into an object for easy accesss

import yaml
import pathlib
from dataclasses import dataclass

@dataclass
class Config:
    block_size: int = 15
    num_blocks: int = 672
    event_file: str = ''
    scheduling_model: str = ''
    json_skip_invalid_events: bool = False
    start_datetime: str = ''
    
    def load_config(self, config_file: str):
        if not config_file:
            return
        elif not pathlib.Path(config_file).exists():
            return
        
        with open(config_file, 'r') as file:
            config_data = yaml.safe_load(file)
            self.block_size = config_data['block_size']
            self.num_blocks = config_data['num_blocks']
            self.event_file = config_data['event_file']
            self.scheduling_model = config_data['scheduling_model']
            self.json_skip_invalid_events = config_data['json_parsing']['read_skip_invalid_events']
            self.start_datetime = config_data['start_datetime']