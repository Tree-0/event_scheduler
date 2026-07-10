"""Google Calendar adapter isolated from the scheduling core."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from event_scheduler.domain import BusyInterval, ScheduleRequest, ScheduleResult, ScheduledEvent, format_utc

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


def build_google_service(credentials_file: Path, token_file: Path):
    """Authenticate and build a Calendar service. Imports Google libraries lazily."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build

    credentials = None
    if token_file.exists():
        credentials = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), SCOPES)
            credentials = flow.run_local_server(port=0)
        token_file.parent.mkdir(parents=True, exist_ok=True)
        token_file.write_text(credentials.to_json(), encoding="utf-8")
    return build("calendar", "v3", credentials=credentials)


def _google_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Google Calendar returned a timestamp without a timezone")
    return parsed.astimezone(timezone.utc)


class GoogleCalendarAdapter:
    def __init__(self, service: Any):
        self.service = service

    def import_busy_intervals(
        self, request: ScheduleRequest, calendar_id: str
    ) -> tuple[ScheduleRequest, tuple[str, ...]]:
        intervals = list(request.busy_intervals)
        diagnostics: list[str] = []
        known_ids = {interval.id for interval in intervals}
        page_token = None
        while True:
            response = (
                self.service.events()
                .list(
                    calendarId=calendar_id,
                    timeMin=format_utc(request.horizon_start),
                    timeMax=format_utc(request.horizon_end),
                    singleEvents=True,
                    orderBy="startTime",
                    pageToken=page_token,
                )
                .execute()
            )
            for raw in response.get("items", []):
                raw_start = raw.get("start", {}).get("dateTime")
                raw_end = raw.get("end", {}).get("dateTime")
                title = raw.get("summary", "")
                if not raw_start or not raw_end:
                    diagnostics.append(f"skipped all-day or incomplete event: {title or '(untitled)'}")
                    continue
                event_id = str(raw.get("id", "")).strip()
                if not event_id:
                    diagnostics.append(f"skipped calendar event without an id: {title or '(untitled)'}")
                    continue
                if event_id in known_ids:
                    diagnostics.append(f"skipped duplicate calendar event id: {event_id}")
                    continue
                start = max(_google_datetime(raw_start), request.horizon_start)
                end = min(_google_datetime(raw_end), request.horizon_end)
                if end <= start:
                    continue
                intervals.append(BusyInterval(event_id, start, end, title))
                known_ids.add(event_id)
            page_token = response.get("nextPageToken")
            if not page_token:
                break
        return replace(request, busy_intervals=tuple(intervals)), tuple(diagnostics)

    def export_events(
        self, result: ScheduleResult, calendar_id: str
    ) -> tuple[int, tuple[str, ...]]:
        uploaded = 0
        errors: list[str] = []
        for event in result.events:
            body = self._event_body(event)
            try:
                self.service.events().insert(calendarId=calendar_id, body=body).execute()
                uploaded += 1
            except Exception as exc:  # API client exceptions vary by transport
                errors.append(f"failed to upload {event.id!r}: {exc}")
        return uploaded, tuple(errors)

    @staticmethod
    def _event_body(event: ScheduledEvent) -> dict[str, Any]:
        return {
            "summary": event.title,
            "description": event.description,
            "extendedProperties": {"private": {"eventSchedulerId": event.id}},
            "start": {"dateTime": format_utc(event.scheduled_start), "timeZone": "UTC"},
            "end": {"dateTime": format_utc(event.scheduled_end), "timeZone": "UTC"},
        }
