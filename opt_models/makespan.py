#
# CP-SAT model to minimize the time of the last scheduled event
# (Get all events done as fast as possible)
#

from ortools.sat.python import cp_model

model: cp_model.CpModel = cp_model.CpModel()

# sets
events = []

solver: cp_model.CpSolver = cp_model.CpSolver()
status = solver.solve(model)