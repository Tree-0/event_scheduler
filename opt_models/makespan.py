#
# CP-SAT model to minimize the time of the last scheduled event
# (Get all events done as fast as possible)
#

from ortools.sat.python import cp_model
from data_models import event
from typing import List
from base_scheduler import BaseScheduler

class MakespanScheduler(BaseScheduler):
    def __init__(self, events: List[event.Event], block_size, num_blocks):
        self.__model: cp_model.CpModel = cp_model.CpModel()
        self.__solver: cp_model.CpSolver = cp_model.CpSolver()
        self.events = events
        self.block_size = block_size
        self.num_blocks = num_blocks

    def build_model(self):
        # TODO: construct ortools cp sat model by adding variables and constraints
        pass

    def solve(self):
        status = self.__solver.solve(self.__model)
        return status