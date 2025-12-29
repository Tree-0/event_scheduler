#
# CP-SAT model to minimize the time of the last scheduled event
# (Get all events done as fast as possible)
#

import math
from ortools.sat.python import cp_model
from data_models import event
from typing import List, Dict
from opt_models.base_scheduler import BaseScheduler
from config.config import Config

class MakespanScheduler(BaseScheduler):
    def __init__(self, events: List[event.Event], config_obj: Config):
        self.__model: cp_model.CpModel = cp_model.CpModel()
        self.__solver: cp_model.CpSolver = cp_model.CpSolver()
        
        # model data
        self.events = events 
        self.block_size = config_obj.block_size
        self.num_blocks = config_obj.num_blocks

        # decision variables to solve for
        self.intervals = {}
        self.start_vars = {}
        self.end_vars = {}

    def build_model(self):
        # optimize for L, the last task's completion time
        last_complete = self.__model.NewIntVar(0, self.num_blocks, "last_complete")

        for e in self.events:
            # if event is infeasible, except

            # convert event times to time blocks (lose granularity)
            window_start_block = math.floor(e.schedulable_window.start / self.block_size)
            window_end_block = math.floor(e.schedulable_window.end / self.block_size)
            duration_blocks =  math.ceil(e.duration  / self.block_size)

            if window_end_block - window_start_block < duration_blocks:
                raise ValueError(f"event's window is smaller than its duration:\n {e}")

            # decision variable for when each event starts
            start_var = self.__model.NewIntVar(
                # can only be started and finished in-window
                window_start_block,
                window_end_block - duration_blocks,
                f"start_{e.id}"
            )
            end_var = self.__model.NewIntVar(0, self.num_blocks, f"end_{e.id}")
                
            self.start_vars[e.id] = start_var
            self.end_vars[e.id] = end_var

            interval_var = self.__model.NewIntervalVar(
                start_var,
                duration_blocks,
                end_var,
                f"interval_{e.id}"
            )

            self.intervals[e.id] = interval_var

            #
            # constraints
            #

            # end time is determined by start time of an interval (duh)
            # maybe this is determined by the IntervalVar implicit constraint?
            # self.__model.Add(end_var == start_var + e.duration)
            
        # events cannot overlap with each other
        self.__model.AddNoOverlap(self.intervals.values())

        # last_complete cannot be smaller than the completion time of the last task
        self.__model.AddMaxEquality(last_complete, self.end_vars.values())

        # 
        # objective
        # 

        # solve for earliest completion time of last task
        self.__model.Minimize(last_complete)

    def solve(self):
        status = self.__solver.Solve(self.__model)

        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            print("LP WAS SOLVEABLE WITH STATUS ", status)
            # create dictionary mapping of ids to events
            for e in self.events:
                e.start_time = self.__solver.value(self.start_vars[e.id]) * self.block_size
                e.end_time = self.__solver.value(self.end_vars[e.id]) * self.block_size
        else:
            print("LP WAS INFEASIBLE WITH STATUS ", status)
            print(self.__model.Validate())

        return status