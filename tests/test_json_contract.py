from datetime import datetime, timezone

import pytest

from event_scheduler.domain import format_utc, parse_timestamp
from event_scheduler.json_io import request_from_dict, request_to_dict


def payload():
    return {
        "schema_version": 1,
        "horizon": {
            "start": "2026-01-01T00:00:00Z",
            "end": "2026-01-02T00:00:00Z",
            "block_minutes": 15,
        },
        "events": [
            {
                "id": "one",
                "title": "One",
                "duration_minutes": 30,
                "windows": [
                    {"start": "2026-01-01T01:00:00Z", "end": "2026-01-01T03:00:00Z"}
                ],
            }
        ],
        "busy_intervals": [],
    }


def test_timestamp_contract_accepts_offsets_and_rejects_naive_values():
    expected = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert parse_timestamp("2026-01-01T00:00:00Z") == expected
    assert parse_timestamp("2025-12-31T18:00:00-06:00") == expected
    assert parse_timestamp("2026-01-01T00:00:00+00:00") == expected
    with pytest.raises(ValueError, match="UTC offset"):
        parse_timestamp("2026-01-01T00:00:00")
    with pytest.raises(ValueError, match="naive"):
        format_utc(datetime(2026, 1, 1))


def test_request_with_offsets_is_normalized_to_utc():
    raw = payload()
    raw["horizon"]["start"] = "2025-12-31T18:00:00-06:00"
    normalized = request_to_dict(request_from_dict(raw))
    assert normalized["horizon"]["start"] == "2026-01-01T00:00:00Z"


def test_request_round_trip():
    raw = payload()
    assert request_to_dict(request_from_dict(raw)) == raw


def test_wrong_schema_and_duplicate_ids_are_rejected():
    raw = payload()
    raw["schema_version"] = 2
    with pytest.raises(ValueError, match="schema_version"):
        request_from_dict(raw)

    raw = payload()
    raw["events"].append(dict(raw["events"][0]))
    with pytest.raises(ValueError, match="unique"):
        request_from_dict(raw)


def test_out_of_horizon_window_is_rejected():
    raw = payload()
    raw["events"][0]["windows"][0]["start"] = "2025-12-31T23:00:00Z"
    with pytest.raises(ValueError, match="horizon"):
        request_from_dict(raw)
