#
# CP-SAT model to minimize the time of the last scheduled event
# (Get all events done as fast as possible)
#

from ortools.sat.python import cp_model
from data_models import event
from data_models import utils
from typing import List
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

        # per-event optional intervals across windows
        self.interval_options = {}

    def build_model(self):
        # optimize for L, the last task's completion time
        last_complete = self.__model.NewIntVar(0, self.num_blocks, "last_complete")

        all_intervals = []

        for e in self.events:
            duration_blocks = utils.duration_to_blocks(e.duration, self.block_size)

            options = []
            for idx, w in enumerate(e.schedulable_windows):
                window_start_block = utils.to_blocks(w.start, self.block_size)
                window_end_block = utils.to_blocks(w.end, self.block_size)
                latest_start = window_end_block - duration_blocks

                if latest_start < window_start_block:
                    # TODO: maybe this should raise an error
                    continue  # this window too small once blockified

                start_var = self.__model.NewIntVar(
                    window_start_block,
                    latest_start,
                    f"start_{e.id}_{idx}"
                )
                end_var = self.__model.NewIntVar(0, self.num_blocks, f"end_{e.id}_{idx}")
                presence = self.__model.NewBoolVar(f"present_{e.id}_{idx}")

                interval_var = self.__model.NewOptionalIntervalVar(
                    start_var,
                    duration_blocks,
                    end_var,
                    presence,
                    f"interval_{e.id}_{idx}"
                )

                options.append((presence, start_var, end_var, interval_var))
                all_intervals.append(interval_var)

            if not options:
                raise ValueError(f"No feasible window for event {e}")

            # exactly one window chosen per event
            self.__model.Add(sum(p for p, _, _, _ in options) == 1)

            # link last_complete to the chosen end
            for p, _, end_var, _ in options:
                self.__model.Add(last_complete >= end_var).OnlyEnforceIf(p)

            self.interval_options[e.id] = options

        # events cannot overlap with each other
        self.__model.AddNoOverlap(all_intervals)

        # Objective
        # solve for earliest completion time of last task
        self.__model.Minimize(last_complete)

    def solve(self):
        status = self.__solver.Solve(self.__model)

        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            print("LP WAS SOLVEABLE WITH STATUS ", status)
            # create dictionary mapping of ids to events
            for e in self.events:
                options = self.interval_options[e.id]
                chosen = next((opt for opt in options if self.__solver.Value(opt[0])), None)
                if chosen is None:
                    continue
                _, start_var, end_var, _ = chosen
                e.start_time = self.__solver.Value(start_var) * self.block_size
                e.end_time = self.__solver.Value(end_var) * self.block_size
        else:
            print("LP WAS INFEASIBLE WITH STATUS ", status)
            print(self.__model.Validate())

        return status