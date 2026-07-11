"""Versioned JSON serialization for schedule requests and results."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from event_scheduler.domain import (
    SCHEMA_VERSION,
    BusyInterval,
    EventRequest,
    ScheduleRequest,
    ScheduleResult,
    ScheduledEvent,
    TimeWindow,
    format_utc,
    parse_timestamp,
)


def _object(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    return value


def _list(value: Any, field: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{field} must be an array")
    return value


def _string(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    return value


def request_from_dict(payload: dict[str, Any]) -> ScheduleRequest:
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"schema_version must be {SCHEMA_VERSION}")
    horizon = _object(payload.get("horizon"), "horizon")
    start = parse_timestamp(horizon.get("start"), "horizon.start")
    end = parse_timestamp(horizon.get("end"), "horizon.end")
    block_minutes = horizon.get("block_minutes")
    if not isinstance(block_minutes, int) or isinstance(block_minutes, bool):
        raise ValueError("horizon.block_minutes must be an integer")

    events: list[EventRequest] = []
    for index, raw_value in enumerate(_list(payload.get("events"), "events")):
        raw = _object(raw_value, f"events[{index}]")
        event_id = _string(raw.get("id"), f"events[{index}].id")
        windows: list[TimeWindow] = []
        for window_index, window_value in enumerate(
            _list(raw.get("windows"), f"events[{index}].windows")
        ):
            window = _object(window_value, f"events[{index}].windows[{window_index}]")
            prefix = f"events[{index}].windows[{window_index}]"
            windows.append(
                TimeWindow(
                    parse_timestamp(window.get("start"), f"{prefix}.start"),
                    parse_timestamp(window.get("end"), f"{prefix}.end"),
                )
            )
        duration = raw.get("duration_minutes")
        if not isinstance(duration, int) or isinstance(duration, bool):
            raise ValueError(f"events[{index}].duration_minutes must be an integer")
        events.append(
            EventRequest(
                id=event_id,
                title=_string(raw.get("title"), f"events[{index}].title"),
                duration_minutes=duration,
                description=_string(raw.get("description", ""), f"events[{index}].description"),
                windows=tuple(windows),
            )
        )

    busy: list[BusyInterval] = []
    for index, raw_value in enumerate(
        _list(payload.get("busy_intervals", []), "busy_intervals")
    ):
        raw = _object(raw_value, f"busy_intervals[{index}]")
        prefix = f"busy_intervals[{index}]"
        busy.append(
            BusyInterval(
                id=_string(raw.get("id"), f"{prefix}.id"),
                title=_string(raw.get("title", ""), f"{prefix}.title"),
                start=parse_timestamp(raw.get("start"), f"{prefix}.start"),
                end=parse_timestamp(raw.get("end"), f"{prefix}.end"),
            )
        )
    return ScheduleRequest(start, end, block_minutes, tuple(events), tuple(busy))


def request_to_dict(request: ScheduleRequest) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "horizon": {
            "start": format_utc(request.horizon_start),
            "end": format_utc(request.horizon_end),
            "block_minutes": request.block_minutes,
        },
        "events": [
            {
                "id": event.id,
                "title": event.title,
                "duration_minutes": event.duration_minutes,
                **({"description": event.description} if event.description else {}),
                "windows": [
                    {"start": format_utc(window.start), "end": format_utc(window.end)}
                    for window in event.windows
                ],
            }
            for event in request.events
        ],
        "busy_intervals": [
            {
                "id": interval.id,
                **({"title": interval.title} if interval.title else {}),
                "start": format_utc(interval.start),
                "end": format_utc(interval.end),
            }
            for interval in request.busy_intervals
        ],
    }


def result_from_dict(payload: dict[str, Any]) -> ScheduleResult:
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"schema_version must be {SCHEMA_VERSION}")
    status = payload.get("status")
    if status not in {"optimal", "feasible", "infeasible", "error"}:
        raise ValueError("result.status is invalid")
    events: list[ScheduledEvent] = []
    for index, raw_value in enumerate(_list(payload.get("events", []), "events")):
        raw = _object(raw_value, f"events[{index}]")
        prefix = f"events[{index}]"
        duration = raw.get("duration_minutes")
        if not isinstance(duration, int) or isinstance(duration, bool):
            raise ValueError(f"{prefix}.duration_minutes must be an integer")
        events.append(
            ScheduledEvent(
                id=_string(raw.get("id"), f"{prefix}.id"),
                title=_string(raw.get("title"), f"{prefix}.title"),
                description=_string(raw.get("description", ""), f"{prefix}.description"),
                duration_minutes=duration,
                scheduled_start=parse_timestamp(
                    raw.get("scheduled_start"), f"{prefix}.scheduled_start"
                ),
                scheduled_end=parse_timestamp(
                    raw.get("scheduled_end"), f"{prefix}.scheduled_end"
                ),
            )
        )
    objective = _object(payload.get("objective", {}), "objective")
    diagnostics = tuple(
        _string(value, f"diagnostics[{index}]")
        for index, value in enumerate(_list(payload.get("diagnostics", []), "diagnostics"))
    )
    return ScheduleResult(
        model=_string(payload.get("model"), "model"),
        status=status,
        events=tuple(events),
        objective=objective,
        diagnostics=diagnostics,
    )


def result_to_dict(result: ScheduleResult) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "model": result.model,
        "status": result.status,
        "objective": dict(result.objective),
        "diagnostics": list(result.diagnostics),
        "events": [
            {
                "id": event.id,
                "title": event.title,
                "duration_minutes": event.duration_minutes,
                **({"description": event.description} if event.description else {}),
                "scheduled_start": format_utc(event.scheduled_start),
                "scheduled_end": format_utc(event.scheduled_end),
            }
            for event in result.events
        ],
    }


def _read(path: str | Path) -> dict[str, Any]:
    try:
        with Path(path).open(encoding="utf-8") as stream:
            return _object(json.load(stream), "document")
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in {path}: {exc}") from exc


def _write(path: str | Path, payload: dict[str, Any]) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as stream:
        json.dump(payload, stream, indent=2)
        stream.write("\n")


def read_request(path: str | Path) -> ScheduleRequest:
    return request_from_dict(_read(path))


def write_request(path: str | Path, request: ScheduleRequest) -> None:
    _write(path, request_to_dict(request))


def read_result(path: str | Path) -> ScheduleResult:
    return result_from_dict(_read(path))


def write_result(path: str | Path, result: ScheduleResult) -> None:
    _write(path, result_to_dict(result))
