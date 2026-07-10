"""Command-line orchestration for offline and Calendar workflows."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

from event_scheduler.config import RuntimeConfig, load_config
from event_scheduler.json_io import read_request, read_result, write_request, write_result
from event_scheduler.solver import create_scheduler

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_INFEASIBLE = 2
EXIT_PARTIAL = 3


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="event-scheduler")
    commands = parser.add_subparsers(dest="command", required=True)

    solve = commands.add_parser("solve", help="solve a request without Calendar access")
    solve.add_argument("--config", required=True)
    solve.add_argument("--input")
    solve.add_argument("--output")
    solve.add_argument("--model")

    calendar_import = commands.add_parser(
        "calendar-import", help="add Google Calendar events as busy intervals"
    )
    calendar_import.add_argument("--config", required=True)
    calendar_import.add_argument("--input")
    calendar_import.add_argument("--output", required=True)

    calendar_export = commands.add_parser(
        "calendar-export", help="preview and export a solved schedule"
    )
    calendar_export.add_argument("--config", required=True)
    calendar_export.add_argument("--input")
    calendar_export.add_argument("--yes", action="store_true")
    return parser


def _path(override: str | None, configured: Path) -> Path:
    return Path(override).resolve() if override else configured


def _preview(result, display_timezone: str, stream=None) -> None:
    stream = stream or sys.stdout
    timezone = ZoneInfo(display_timezone)
    print(f"Status: {result.status} | Model: {result.model}", file=stream)
    for event in result.events:
        start = event.scheduled_start.astimezone(timezone)
        end = event.scheduled_end.astimezone(timezone)
        print(
            f"- {event.title} [{event.id}] {start.isoformat()} to {end.isoformat()}",
            file=stream,
        )
    for diagnostic in result.diagnostics:
        print(f"! {diagnostic}", file=stream)


def _service(config: RuntimeConfig):
    from event_scheduler.google_calendar import build_google_service

    return build_google_service(
        config.calendar.credentials_file,
        config.calendar.token_file,
    )


def _solve(args, config: RuntimeConfig) -> int:
    request_path = _path(args.input, config.request_file)
    result_path = _path(args.output, config.result_file)
    model = args.model or config.model
    result = create_scheduler(model).solve(read_request(request_path))
    write_result(result_path, result)
    _preview(result, config.display_timezone)
    print(f"Result written to {result_path}")
    if result.status in {"optimal", "feasible"}:
        return EXIT_OK
    return EXIT_INFEASIBLE if result.status == "infeasible" else EXIT_ERROR


def _calendar_import(args, config: RuntimeConfig) -> int:
    from event_scheduler.google_calendar import GoogleCalendarAdapter

    request_path = _path(args.input, config.request_file)
    output_path = Path(args.output).resolve()
    if output_path == request_path:
        raise ValueError("calendar-import output must not overwrite its input")
    request, diagnostics = GoogleCalendarAdapter(_service(config)).import_busy_intervals(
        read_request(request_path), config.calendar.calendar_id
    )
    write_request(output_path, request)
    for diagnostic in diagnostics:
        print(f"! {diagnostic}")
    print(f"Imported {len(request.busy_intervals)} total busy intervals into {output_path}")
    return EXIT_OK


def _calendar_export(args, config: RuntimeConfig) -> int:
    result_path = _path(args.input, config.result_file)
    result = read_result(result_path)
    if result.status not in {"optimal", "feasible"}:
        raise ValueError("only a feasible or optimal result can be exported")
    _preview(result, config.display_timezone)
    if not result.events:
        print("No scheduled events to export.")
        return EXIT_OK
    if not args.yes:
        confirmed = input("Insert these events into Google Calendar? [y/N]: ").strip().lower()
        if confirmed not in {"y", "yes"}:
            print("Calendar export cancelled.")
            return EXIT_OK

    from event_scheduler.google_calendar import GoogleCalendarAdapter

    uploaded, errors = GoogleCalendarAdapter(_service(config)).export_events(
        result, config.calendar.calendar_id
    )
    print(f"Uploaded {uploaded}/{len(result.events)} events.")
    for error in errors:
        print(f"! {error}", file=sys.stderr)
    return EXIT_OK if not errors else EXIT_PARTIAL


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        config = load_config(args.config)

        if args.command == "solve":
            return _solve(args, config)

        if args.command == "calendar-import":
            return _calendar_import(args, config)

        if args.command == "calendar-export":
            return _calendar_export(args, config)

        raise ValueError(f"unknown command: {args.command}")
    except (OSError, ValueError, KeyError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return EXIT_ERROR
    except Exception as exc:
        print(f"Unexpected error: {exc}", file=sys.stderr)
        return EXIT_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
