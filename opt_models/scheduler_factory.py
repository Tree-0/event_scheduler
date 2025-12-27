# class for creating Google OrTools optimization models and solvers 

from data_models import event
from typing import List

from opt_models.base_scheduler import SchedulerModel
from makespan import MakespanScheduler
# TODO: other models and their imports

class SchedulerFactory:

    # takes in various parameters and returns the appropriate scheduling optimization model
    @staticmethod
    def create_scheduler_model(
        model_name: str, 
        events: List[event.Event], 
        block_size: int, 
        num_blocks: int
    ) -> SchedulerModel:
        
        match model_name.lower().strip():

            case "makespan": 
                return MakespanScheduler(events, block_size, num_blocks)

        raise ValueError("Unknown model name when trying to create Scheduler")    