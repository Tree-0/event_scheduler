# class for creating Google OrTools optimization models and solvers 

from data_models import event
from typing import List

from config.config import Config

# model options
from opt_models.base_scheduler import BaseScheduler
from opt_models.makespan import MakespanScheduler

class SchedulerFactory:

    # takes in various parameters and returns the appropriate scheduling optimization model
    @staticmethod
    def create_scheduler_model(
        model_name: str, 
        events: List[event.Event], 
        config_obj: Config
    ) -> BaseScheduler:

        match model_name.lower().strip():

            case "makespan": 
                return MakespanScheduler(events, config_obj)

        raise ValueError("Unknown model name when trying to create Scheduler: ", model_name)    