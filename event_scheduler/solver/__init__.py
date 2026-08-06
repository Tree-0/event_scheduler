"""Solver protocols and model factory."""

from __future__ import annotations

from typing import Protocol

from event_scheduler.domain import ScheduleRequest, ScheduleResult

from .makespan import MakespanScheduler


class Scheduler(Protocol):
    def solve(self, request: ScheduleRequest) -> ScheduleResult: ...


def create_scheduler(model: str) -> Scheduler:
    if model.strip().lower() == MakespanScheduler.name:
        return MakespanScheduler()
    # TODO: add more models here
    raise ValueError(f"unknown scheduling model: {model}")


__all__ = ["Scheduler", "MakespanScheduler", "create_scheduler"]