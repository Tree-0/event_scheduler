import json
from pathlib import Path

from datetime import datetime, timedelta, timezone

from event_scheduler import cli
from event_scheduler.cli import EXIT_INFEASIBLE, EXIT_OK, EXIT_PARTIAL, main
from event_scheduler.domain import ScheduleResult, ScheduledEvent
from event_scheduler.json_io import write_result


def write_config(tmp_path: Path, request: dict) -> Path:
    (tmp_path / "request.json").write_text(json.dumps(request), encoding="utf-8")
    config = tmp_path / "config.yaml"
    config.write_text(
        "request_file: request.json\n"
        "result_file: result.json\n"
        "model: makespan\n"
        "display_timezone: America/Chicago\n",
        encoding="utf-8",
    )
    return config


def raw_request(window_end="2026-01-01T03:00:00Z"):
    return {
        "schema_version": 1,
        "horizon": {
            "start": "2026-01-01T00:00:00Z",
            "end": "2026-01-01T12:00:00Z",
            "block_minutes": 15,
        },
        "events": [{
            "id": "one", "title": "One", "duration_minutes": 30,
            "windows": [{"start": "2026-01-01T01:00:00Z", "end": window_end}],
        }],
        "busy_intervals": [],
    }


def test_solve_writes_result_and_uses_display_timezone(tmp_path, capsys):
    config = write_config(tmp_path, raw_request())
    assert main(["solve", "--config", str(config)]) == EXIT_OK
    result = json.loads((tmp_path / "result.json").read_text(encoding="utf-8"))
    assert result["status"] == "optimal"
    assert result["events"][0]["scheduled_start"].endswith("Z")
    assert "-06:00" in capsys.readouterr().out


def test_solve_returns_distinct_infeasible_exit(tmp_path):
    raw = raw_request("2026-01-01T01:15:00Z")
    raw["events"][0]["duration_minutes"] = 30
    config = write_config(tmp_path, raw)
    assert main(["solve", "--config", str(config)]) == EXIT_INFEASIBLE


class ExportResource:
    def __init__(self, fail=False):
        self.fail = fail
        self.inserted = []

    def insert(self, **kwargs):
        self.inserted.append(kwargs)
        resource = self

        class Call:
            def execute(self):
                if resource.fail:
                    raise RuntimeError("denied")
                return {}

        return Call()


class ExportService:
    def __init__(self, resource):
        self.resource = resource

    def events(self):
        return self.resource


def calendar_result():
    start = datetime(2026, 1, 1, 1, tzinfo=timezone.utc)
    return ScheduleResult(
        "makespan",
        "optimal",
        (ScheduledEvent("one", "One", 30, start, start + timedelta(minutes=30)),),
    )


def test_calendar_export_cancels_before_authentication(tmp_path, monkeypatch):
    config = write_config(tmp_path, raw_request())
    write_result(tmp_path / "result.json", calendar_result())
    monkeypatch.setattr("builtins.input", lambda _: "n")
    monkeypatch.setattr(cli, "_service", lambda _: (_ for _ in ()).throw(AssertionError("authenticated")))
    assert main(["calendar-export", "--config", str(config)]) == EXIT_OK


def test_calendar_export_reports_partial_failure(tmp_path, monkeypatch):
    config = write_config(tmp_path, raw_request())
    write_result(tmp_path / "result.json", calendar_result())
    service = ExportService(ExportResource(fail=True))
    monkeypatch.setattr(cli, "_service", lambda _: service)
    assert main(["calendar-export", "--config", str(config), "--yes"]) == EXIT_PARTIAL
