from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict

import httpx
from temporalio import activity

from .config import get_settings
from .service import append_run_log, mark_run_completed, mark_run_failed, mark_run_running
from .temporal_workflow import (
    APPEND_RUN_LOG_ACTIVITY,
    MARK_RUN_COMPLETED_ACTIVITY,
    MARK_RUN_FAILED_ACTIVITY,
    MARK_RUN_RUNNING_ACTIVITY,
    PERFORM_API_CALL_ACTIVITY,
    render_template_string,
)

settings = get_settings()


def _stringify_output(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, default=str)


@activity.defn(name=MARK_RUN_RUNNING_ACTIVITY)
async def mark_run_running_activity(run_id: str) -> None:
    await mark_run_running(run_id)


@activity.defn(name=APPEND_RUN_LOG_ACTIVITY)
async def append_run_log_activity(payload: Dict[str, Any]) -> None:
    started_at = payload.get("started_at")
    completed_at = payload.get("completed_at")

    await append_run_log(
        run_id=str(payload["run_id"]),
        node_id=str(payload["node_id"]),
        node_type=str(payload["node_type"]),
        node_label=str(payload["node_label"]),
        status=str(payload["status"]),
        sort_order=int(payload["sort_order"]),
        output=str(payload.get("output", "")),
        error=payload.get("error"),
        started_at=datetime.fromisoformat(started_at) if isinstance(started_at, str) else None,
        completed_at=datetime.fromisoformat(completed_at)
        if isinstance(completed_at, str)
        else None,
        duration_ms=payload.get("duration_ms"),
        nodes_completed=payload.get("nodes_completed"),
    )


@activity.defn(name=MARK_RUN_COMPLETED_ACTIVITY)
async def mark_run_completed_activity(payload: Dict[str, Any]) -> None:
    await mark_run_completed(
        run_id=str(payload["run_id"]),
        final_output=payload.get("final_output"),
        nodes_completed=int(payload.get("nodes_completed", 0)),
    )


@activity.defn(name=MARK_RUN_FAILED_ACTIVITY)
async def mark_run_failed_activity(payload: Dict[str, Any]) -> None:
    await mark_run_failed(
        run_id=str(payload["run_id"]),
        error_message=str(payload.get("error_message", "Workflow failed.")),
        nodes_completed=int(payload.get("nodes_completed", 0)),
    )


@activity.defn(name=PERFORM_API_CALL_ACTIVITY)
async def perform_api_call_activity(payload: Dict[str, Any]) -> Dict[str, Any]:
    config = payload.get("config", {}) if isinstance(payload.get("config"), dict) else {}
    current_payload = payload.get("current_payload")
    original_input = payload.get("original_input")

    method = str(config.get("method", "GET")).upper()
    url = render_template_string(str(config.get("url", "")), current_payload, original_input)
    headers_raw = str(config.get("headers", "{}") or "{}")
    body_raw = str(config.get("body", "") or "")

    rendered_headers = render_template_string(headers_raw, current_payload, original_input)
    try:
        headers = json.loads(rendered_headers) if rendered_headers.strip() else {}
    except json.JSONDecodeError:
        headers = {}

    body = None
    if body_raw.strip():
        rendered_body = render_template_string(body_raw, current_payload, original_input)
        try:
            body = json.loads(rendered_body)
        except json.JSONDecodeError:
            body = rendered_body

    timeout_seconds = int(config.get("timeout") or settings.api_request_timeout_seconds)

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                json=body if method != "GET" else None,
            )

        try:
            response_body = response.json()
        except ValueError:
            response_body = response.text

        result = {
            "ok": response.status_code < 400,
            "status": response.status_code,
            "method": method,
            "url": url,
            "headers": dict(response.headers),
            "body": response_body,
            "error": None,
        }

        if response.status_code >= 400:
            result["error"] = "HTTP {0}: {1}".format(response.status_code, _stringify_output(response_body))

        return result
    except Exception as error:
        return {
            "ok": False,
            "status": None,
            "method": method,
            "url": url,
            "headers": {},
            "body": None,
            "error": str(error),
        }
