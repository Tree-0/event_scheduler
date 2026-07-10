"""Runtime YAML configuration."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass(frozen=True)
class CalendarConfig:
    calendar_id: str = "primary"
    credentials_file: Path = Path("config/client_secret.json")
    token_file: Path = Path("config/token.json")


@dataclass(frozen=True)
class RuntimeConfig:
    request_file: Path
    result_file: Path
    model: str = "makespan"
    display_timezone: str = "UTC"
    calendar: CalendarConfig = field(default_factory=CalendarConfig)


def load_config(path: str | Path) -> RuntimeConfig:
    config_path = Path(path).resolve()
    with config_path.open(encoding="utf-8") as stream:
        payload = yaml.safe_load(stream)
    if not isinstance(payload, dict):
        raise ValueError("config must be a YAML object")
    base = config_path.parent

    def required_path(key: str) -> Path:
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"config.{key} must be a path string")
        candidate = Path(value)
        return candidate if candidate.is_absolute() else (base / candidate).resolve()

    calendar_raw = payload.get("calendar", {})
    if not isinstance(calendar_raw, dict):
        raise ValueError("config.calendar must be an object")

    def calendar_path(key: str, default: str) -> Path:
        value = calendar_raw.get(key, default)
        if not isinstance(value, str):
            raise ValueError(f"config.calendar.{key} must be a path string")
        candidate = Path(value)
        return candidate if candidate.is_absolute() else (base / candidate).resolve()

    model = payload.get("model", "makespan")
    display_timezone = payload.get("display_timezone", "UTC")
    calendar_id = calendar_raw.get("calendar_id", "primary")
    if not all(isinstance(value, str) for value in (model, display_timezone, calendar_id)):
        raise ValueError("model, display_timezone, and calendar_id must be strings")
    return RuntimeConfig(
        request_file=required_path("request_file"),
        result_file=required_path("result_file"),
        model=model,
        display_timezone=display_timezone,
        calendar=CalendarConfig(
            calendar_id=calendar_id,
            credentials_file=calendar_path("credentials_file", "client_secret.json"),
            token_file=calendar_path("token_file", "token.json"),
        ),
    )
