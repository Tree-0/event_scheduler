# Event Scheduler

An offline-first event scheduling experiment built with Python and Google OR-Tools CP-SAT. The current `makespan` model places every requested event without overlap while minimizing the completion time of the last reserved time block.

The scheduling core does not require Google credentials or network access. Google Calendar is an optional input/output adapter around the same versioned JSON interface.

## Install

Python 3.11 or 3.12 is recommended.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
```

Install the optional Google Calendar dependencies when needed:

```bash
python -m pip install -e '.[dev,calendar]'
```

## Offline quickstart

The example YAML points to a scheduling request in `examples/`. Paths in YAML are resolved relative to the YAML file.

```bash
event-scheduler solve --config config/example_config.yaml
```

This command validates the request, prints the proposed schedule in the configured display timezone, and writes a result JSON file. It never imports the Google client or requests credentials.

Command-line values can override YAML paths and the model:

```bash
event-scheduler solve \
  --config config/example_config.yaml \
  --input examples/weekend.request.json \
  --output /tmp/weekend.result.json \
  --model makespan
```

Exit status is `0` for a schedule, `2` for an infeasible request, and `1` for invalid input or an execution error.

## JSON boundary

Request and result documents use `schema_version: 1`. Every timestamp must be UTC ISO 8601 ending in `Z`; local timezones are presentation-only.

A request contains:

- A scheduling horizon and block size.
- Movable events with durations and one or more allowed windows.
- Immutable busy intervals that scheduled events must avoid.

See [`examples/weekend.request.json`](examples/weekend.request.json) for a complete document. Allowed windows are rounded inward to block boundaries, busy intervals are rounded outward, and durations reserve a whole number of blocks. This conservative policy prevents a generated event from starting outside its window or colliding with an existing calendar event.

## Google Calendar workflow

Place a Google OAuth desktop-client secret at the location configured by `calendar.credentials_file`. Tokens are created at `calendar.token_file` only when a Calendar command is run.

Use explicit stages so every intermediate document is inspectable:

```bash
event-scheduler calendar-import \
  --config config/example_config.yaml \
  --output examples/weekend.with-calendar.json

event-scheduler solve \
  --config config/example_config.yaml \
  --input examples/weekend.with-calendar.json

event-scheduler calendar-export \
  --config config/example_config.yaml
```

Import adds timed Calendar events as busy intervals and never overwrites its input. All-day events are skipped with a diagnostic. Export previews every insertion and asks for confirmation; `--yes` is available for deliberate automation.

## Tests

```bash
python -m pytest
```

The suite covers the UTC JSON contract, block rounding, solver feasibility and non-overlap, CLI outputs and exit codes, and Calendar import/export through mock services. Tests never authenticate or access Google.

## Architecture

```text
YAML runtime config ──> JSON request ──> pure Scheduler ──> JSON result
                              ▲                             │
                              │                             ▼
                      Calendar import              Calendar export
```

- `event_scheduler/domain.py` defines immutable request and result contracts.
- `event_scheduler/solver.py` contains the solver protocol and makespan model.
- `event_scheduler/json_io.py` owns the versioned exchange format.
- `event_scheduler/google_calendar.py` owns optional Google API behavior.
- `event_scheduler/cli.py` orchestrates commands without putting I/O in the solver.

## Current model limitations

Makespan is a baseline objective, not a general measure of personal schedule quality. It tends to place work as early as possible and does not yet model priorities, preferred hours, breaks, daily workload balance, task dependencies, or penalties for fragmentation. Those are intended as subsequent optimization experiments rather than hidden heuristics in the first model.

The installable `event_scheduler` package and `event-scheduler` command are the project's supported interfaces.
