"""Makespan scheduling model implementation."""

from __future__ import annotations

import math
from datetime import timedelta

from ortools.sat.python import cp_model

from event_scheduler.domain import ScheduleRequest, ScheduleResult, ScheduledEvent


def _minutes(value, origin) -> float:
    return (value - origin).total_seconds() / 60


class MakespanScheduler:
    """Schedule all requested events while minimizing the last reserved block."""

    name = "makespan"

    def solve(self, request: ScheduleRequest) -> ScheduleResult:
        model = cp_model.CpModel()
        solver = cp_model.CpSolver()

        # CP-SAT uses integer time units. Represent the horizon as block indexes
        # relative to horizon_start, discarding any incomplete trailing block.
        block = request.block_minutes
        horizon_minutes = _minutes(request.horizon_end, request.horizon_start)
        num_blocks = math.floor(horizon_minutes / block)
        if num_blocks <= 0:
            return ScheduleResult(self.name, "error", diagnostics=("horizon has no complete blocks",))

        all_intervals = []
        choices: dict[str, list[tuple[object, object, object]]] = {}
        last_complete = model.NewIntVar(0, num_blocks, "last_complete")

        for busy in request.busy_intervals:
            # Round the start/end time of the pre-existing event outwards.
            # We can't overlap with these.
            start = math.floor(_minutes(busy.start, request.horizon_start) / block)
            end = math.ceil(_minutes(busy.end, request.horizon_start) / block)
            start = max(0, start)
            end = min(num_blocks, end)
            if end > start:
                all_intervals.append(
                    model.NewFixedSizeIntervalVar(start, end - start, f"busy_{busy.id}")
                )

        for event in request.events:
            # An event must reserve enough whole blocks to cover its actual duration.
            duration_blocks = math.ceil(event.duration_minutes / block)
            options = []
            for index, window in enumerate(event.windows):
                # Round allowed windows inward so the entire reserved interval remains
                # inside the event's original window. Skip windows too short after block alignment.
                first_start = math.ceil(_minutes(window.start, request.horizon_start) / block)
                last_end = math.floor(_minutes(window.end, request.horizon_start) / block)
                latest_start = last_end - duration_blocks
                if latest_start < first_start:
                    continue
                start_var = model.NewIntVar(first_start, latest_start, f"start_{event.id}_{index}")
                end_var = model.NewIntVar(
                    first_start + duration_blocks, last_end, f"end_{event.id}_{index}"
                )

                # Events have multiple windows in which they can be scheduled.
                # `present` represents whether a particular window was chosen.
                present = model.NewBoolVar(f"present_{event.id}_{index}")
                interval = model.NewOptionalIntervalVar(
                    start_var, duration_blocks, end_var, present, f"event_{event.id}_{index}"
                )

                # Our objective is to minimize the last event's completion time,
                # so we must enforce this constraint against every scheduled interval
                model.Add(last_complete >= end_var).OnlyEnforceIf(present)
                options.append((present, start_var, end_var))
                all_intervals.append(interval)
            # If there were no potential windows large enough to schedule this event
            if not options:
                return ScheduleResult(
                    self.name,
                    "infeasible",
                    diagnostics=(f"event {event.id!r} has no block-aligned feasible window",),
                )
            # Only one of this event's windows can be used to schedule the event
            model.AddExactlyOne(option[0] for option in options)
            choices[event.id] = options

        model.AddNoOverlap(all_intervals)
        model.Minimize(last_complete) # objective func

        raw_status = solver.Solve(model)

        if raw_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            status = "infeasible" if raw_status == cp_model.INFEASIBLE else "error"
            return ScheduleResult(
                self.name,
                status,
                diagnostics=(f"OR-Tools status: {solver.StatusName(raw_status)}",),
            )

        scheduled = []
        # Translate the selected block placement back to real UTC timestamps.
        # Report the requested duration, even though the model may reserve extra
        # space because duration_blocks was rounded upward.
        for event in request.events:
            selected = next(option for option in choices[event.id] if solver.Value(option[0]))
            start_block = solver.Value(selected[1])
            start = request.horizon_start + timedelta(minutes=start_block * block)
            scheduled.append(
                ScheduledEvent(
                    id=event.id,
                    title=event.title,
                    description=event.description,
                    duration_minutes=event.duration_minutes,
                    scheduled_start=start,
                    scheduled_end=start + timedelta(minutes=event.duration_minutes),
                )
            )
        scheduled.sort(key=lambda event: (event.scheduled_start, event.id))
        status = "optimal" if raw_status == cp_model.OPTIMAL else "feasible"
        return ScheduleResult(
            self.name,
            status,
            tuple(scheduled),
            objective={"makespan_reserved_minutes": solver.Value(last_complete) * block},
        )