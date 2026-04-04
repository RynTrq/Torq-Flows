from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from .config import get_settings
from .database import fetch, fetchrow, transaction
from .graph import WorkflowValidationException, normalize_workflow_graph
from .models import (
    AppShellCounts,
    RunLog,
    ValidationIssue,
    WorkflowDefinitionResponse,
    WorkflowEdgeDefinition,
    WorkflowListItem,
    WorkflowNodeDefinition,
    WorkflowRun,
    WorkflowStatus,
    WorkflowUpsertRequest,
)

settings = get_settings()


class NotFoundError(ValueError):
    pass


class TemporalUnavailableError(RuntimeError):
    pass


def _serialize_model(model: Any) -> Any:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if hasattr(model, "dict"):
        return model.dict()
    return model


def _to_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()


def _format_json_payload(value: Any) -> str:
    return json.dumps(value if value is not None else {}, indent=2, default=str)


def _coerce_json_value(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback

    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback

    return value


def _build_temporal_unavailable_message(error: Exception) -> str:
    settings = get_settings()
    details = str(error).strip() or "Connection to the workflow runtime failed."

    if settings.app_env == "production":
        return (
            "The workflow runtime is unavailable at {0}. Verify the Temporal service, namespace, "
            "and worker deployment are healthy. Original error: {1}"
        ).format(settings.temporal_address, details)

    return (
        "The workflow runtime is unavailable at {0}. Start the Temporal server with "
        "`temporal server start-dev`, then run `npm run backend:worker` so executions can be "
        "processed. Original error: {1}"
    ).format(settings.temporal_address, details)


def _is_temporal_connection_error(error: Exception) -> bool:
    message = str(error)
    temporal_markers = (
        "Failed client connect",
        "Connection refused",
        "Server connection error",
        "tcp connect error",
    )
    return any(marker in message for marker in temporal_markers)


def _map_workflow_record(row: Dict[str, Any]) -> WorkflowDefinitionResponse:
    nodes_json = _coerce_json_value(row.get("nodes_json"), [])
    edges_json = _coerce_json_value(row.get("edges_json"), [])
    nodes = [WorkflowNodeDefinition(**node) for node in nodes_json]
    edges = [WorkflowEdgeDefinition(**edge) for edge in edges_json]
    return WorkflowDefinitionResponse(
        id=str(row["id"]),
        name=row["name"],
        description=row.get("description") or "",
        status=row["status"],
        triggerType=row["trigger_type"],
        webhookPath=row.get("webhook_path"),
        nodes=nodes,
        edges=edges,
        createdAt=_to_iso(row["created_at"]) or datetime.now(timezone.utc).isoformat(),
        updatedAt=_to_iso(row["updated_at"]) or datetime.now(timezone.utc).isoformat(),
    )


def _map_run_log(row: Dict[str, Any]) -> RunLog:
    return RunLog(
        id=str(row["id"]),
        nodeId=row["node_id"],
        nodeType=row["node_type"],
        nodeLabel=row["node_label"],
        status=row["status"],
        startedAt=_to_iso(row["started_at"]) or datetime.now(timezone.utc).isoformat(),
        completedAt=_to_iso(row.get("completed_at")),
        durationMs=row.get("duration_ms"),
        output=row.get("output") or "",
        error=row.get("error"),
    )


def _map_run_record(row: Dict[str, Any], logs: List[RunLog]) -> WorkflowRun:
    input_payload = _coerce_json_value(row.get("input_payload"), {})
    final_output = _coerce_json_value(row.get("final_output"), None)

    return WorkflowRun(
        id=str(row["id"]),
        workflowId=str(row["workflow_id"]),
        workflowName=row["workflow_name"],
        temporalRunId=row["temporal_run_id"],
        status=row["status"],
        triggerType=row["trigger_type"],
        startedAt=_to_iso(row["started_at"]) or datetime.now(timezone.utc).isoformat(),
        completedAt=_to_iso(row.get("completed_at")),
        durationMs=row.get("duration_ms"),
        nodeCount=row.get("node_count") or 0,
        nodesCompleted=row.get("nodes_completed") or 0,
        inputPayload=_format_json_payload(input_payload),
        finalOutput=None if final_output is None else _format_json_payload(final_output),
        errorMessage=row.get("error_message"),
        nodeLogs=logs,
    )


async def get_app_shell_counts(user_id: str) -> AppShellCounts:
    row = await fetchrow(
        """
        SELECT
          (SELECT COUNT(*)::INT FROM workflows WHERE user_id = $1::UUID) AS workflow_count,
          (
            SELECT COUNT(*)::INT
            FROM workflow_runs
            WHERE user_id = $1::UUID
              AND status IN ('queued', 'running')
          ) AS active_run_count
        """,
        user_id,
    )

    return AppShellCounts(
        workflowCount=(row["workflow_count"] if row else 0) or 0,
        activeRunCount=(row["active_run_count"] if row else 0) or 0,
    )


async def list_workflows(user_id: str) -> List[WorkflowListItem]:
    rows = await fetch(
        """
        SELECT
          w.id,
          w.name,
          w.description,
          w.status,
          w.trigger_type,
          w.webhook_path,
          COALESCE(JSONB_ARRAY_LENGTH(w.nodes_json), 0)::INT AS node_count,
          COALESCE(JSONB_ARRAY_LENGTH(w.edges_json), 0)::INT AS edge_count,
          latest_run.status AS last_run_status,
          latest_run.started_at AS last_run_at,
          COALESCE(run_stats.total_runs, 0)::INT AS total_runs,
          COALESCE(run_stats.success_rate, 0)::FLOAT8 AS success_rate,
          w.created_at,
          w.updated_at
        FROM workflows w
        LEFT JOIN LATERAL (
          SELECT wr.status, wr.started_at
          FROM workflow_runs wr
          WHERE wr.workflow_id = w.id
          ORDER BY wr.started_at DESC
          LIMIT 1
        ) latest_run ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::INT AS total_runs,
            COALESCE(
              ROUND(
                100.0 * AVG(CASE WHEN wr.status = 'completed' THEN 1 ELSE 0 END)::NUMERIC,
                1
              ),
              0
            )::FLOAT8 AS success_rate
          FROM workflow_runs wr
          WHERE wr.workflow_id = w.id
        ) run_stats ON TRUE
        WHERE w.user_id = $1::UUID
        ORDER BY w.updated_at DESC
        """,
        user_id,
    )

    workflow_items: List[WorkflowListItem] = []

    for row in rows:
        record = dict(row)
        workflow_items.append(
            WorkflowListItem(
                id=str(record["id"]),
                name=record["name"],
                status=record["status"],
                triggerType=record["trigger_type"],
                webhookPath=record.get("webhook_path"),
                nodeCount=record["node_count"] or 0,
                edgeCount=record["edge_count"] or 0,
                lastRunStatus=record.get("last_run_status"),
                lastRunAt=_to_iso(record.get("last_run_at")),
                totalRuns=record["total_runs"] or 0,
                successRate=float(record["success_rate"] or 0),
                createdAt=_to_iso(record["created_at"]) or datetime.now(timezone.utc).isoformat(),
                updatedAt=_to_iso(record["updated_at"]) or datetime.now(timezone.utc).isoformat(),
                description=record.get("description") or "",
            )
        )

    return workflow_items


async def get_workflow(user_id: str, workflow_id: str) -> Optional[WorkflowDefinitionResponse]:
    row = await fetchrow(
        """
        SELECT
          id,
          name,
          description,
          status,
          trigger_type,
          webhook_path,
          nodes_json,
          edges_json,
          definition_json,
          validation_errors_json,
          created_at,
          updated_at
        FROM workflows
        WHERE user_id = $1::UUID
          AND id = $2::UUID
        LIMIT 1
        """,
        user_id,
        workflow_id,
    )

    if row is None:
        return None

    return _map_workflow_record(dict(row))


async def upsert_workflow(
    user_id: str, payload: WorkflowUpsertRequest, workflow_id: Optional[str] = None
) -> WorkflowDefinitionResponse:
    target_workflow_id = workflow_id or str(uuid4())
    normalized = normalize_workflow_graph(
        workflow_id=target_workflow_id,
        workflow_name=payload.name,
        status=payload.status,
        nodes=payload.nodes,
        edges=payload.edges,
    )

    async with transaction() as connection:
        row = await connection.fetchrow(
            """
            INSERT INTO workflows (
              id,
              user_id,
              name,
              description,
              status,
              trigger_type,
              webhook_path,
              nodes_json,
              edges_json,
              definition_json,
              validation_errors_json,
              updated_at
            )
            VALUES (
              $1::UUID,
              $2::UUID,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8::JSONB,
              $9::JSONB,
              $10::JSONB,
              $11::JSONB,
              NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              status = EXCLUDED.status,
              trigger_type = EXCLUDED.trigger_type,
              webhook_path = EXCLUDED.webhook_path,
              nodes_json = EXCLUDED.nodes_json,
              edges_json = EXCLUDED.edges_json,
              definition_json = EXCLUDED.definition_json,
              validation_errors_json = EXCLUDED.validation_errors_json,
              updated_at = NOW()
            RETURNING
              id,
              name,
              description,
              status,
              trigger_type,
              webhook_path,
              nodes_json,
              edges_json,
              definition_json,
              validation_errors_json,
              created_at,
              updated_at
            """,
            target_workflow_id,
            user_id,
            normalized["name"],
            normalized["description"],
            normalized["status"],
            normalized["triggerType"],
            normalized["webhookPath"],
            json.dumps([_serialize_model(node) for node in normalized["nodes"]]),
            json.dumps([_serialize_model(edge) for edge in normalized["edges"]]),
            json.dumps(_serialize_model(normalized["definition"])),
            json.dumps([_serialize_model(issue) for issue in normalized["validationIssues"]]),
        )

    if row is None:
        raise NotFoundError("Workflow could not be saved.")

    return _map_workflow_record(dict(row))


async def update_workflow_status(
    user_id: str, workflow_id: str, status: WorkflowStatus
) -> WorkflowDefinitionResponse:
    row = await fetchrow(
        """
        UPDATE workflows
        SET status = $3, updated_at = NOW()
        WHERE user_id = $1::UUID
          AND id = $2::UUID
        RETURNING
          id,
          name,
          description,
          status,
          trigger_type,
          webhook_path,
          nodes_json,
          edges_json,
          definition_json,
          validation_errors_json,
          created_at,
          updated_at
        """,
        user_id,
        workflow_id,
        status,
    )

    if row is None:
        raise NotFoundError("Workflow not found.")

    return _map_workflow_record(dict(row))


async def delete_workflows(user_id: str, workflow_ids: List[str]) -> int:
    if not workflow_ids:
        return 0

    row = await fetchrow(
        """
        WITH deleted AS (
          DELETE FROM workflows
          WHERE user_id = $1::UUID
            AND id = ANY($2::UUID[])
          RETURNING id
        )
        SELECT COUNT(*)::INT AS deleted_count FROM deleted
        """,
        user_id,
        workflow_ids,
    )

    return (row["deleted_count"] if row else 0) or 0


async def list_runs(user_id: str) -> List[WorkflowRun]:
    rows = await fetch(
        """
        SELECT
          wr.id,
          wr.workflow_id,
          w.name AS workflow_name,
          wr.temporal_run_id,
          wr.status,
          wr.trigger_type,
          wr.started_at,
          wr.completed_at,
          wr.duration_ms,
          wr.node_count,
          wr.nodes_completed,
          wr.input_payload,
          wr.final_output,
          wr.error_message
        FROM workflow_runs wr
        INNER JOIN workflows w ON w.id = wr.workflow_id
        WHERE wr.user_id = $1::UUID
        ORDER BY wr.started_at DESC
        LIMIT 200
        """,
        user_id,
    )

    run_ids = [str(row["id"]) for row in rows]
    if not run_ids:
        return []

    log_rows = await fetch(
        """
        SELECT
          id,
          run_id,
          node_id,
          node_type,
          node_label,
          status,
          started_at,
          completed_at,
          duration_ms,
          output,
          error,
          sort_order
        FROM run_logs
        WHERE run_id = ANY($1::UUID[])
        ORDER BY sort_order ASC, started_at ASC
        """,
        run_ids,
    )

    logs_by_run_id: Dict[str, List[RunLog]] = {}
    for log_row in log_rows:
        run_id = str(log_row["run_id"])
        logs_by_run_id.setdefault(run_id, []).append(_map_run_log(dict(log_row)))

    return [_map_run_record(dict(row), logs_by_run_id.get(str(row["id"]), [])) for row in rows]


async def get_run(user_id: str, run_id: str) -> Optional[WorkflowRun]:
    row = await fetchrow(
        """
        SELECT
          wr.id,
          wr.workflow_id,
          w.name AS workflow_name,
          wr.temporal_run_id,
          wr.status,
          wr.trigger_type,
          wr.started_at,
          wr.completed_at,
          wr.duration_ms,
          wr.node_count,
          wr.nodes_completed,
          wr.input_payload,
          wr.final_output,
          wr.error_message
        FROM workflow_runs wr
        INNER JOIN workflows w ON w.id = wr.workflow_id
        WHERE wr.user_id = $1::UUID
          AND wr.id = $2::UUID
        LIMIT 1
        """,
        user_id,
        run_id,
    )

    if row is None:
        return None

    log_rows = await fetch(
        """
        SELECT
          id,
          run_id,
          node_id,
          node_type,
          node_label,
          status,
          started_at,
          completed_at,
          duration_ms,
          output,
          error,
          sort_order
        FROM run_logs
        WHERE run_id = $1::UUID
        ORDER BY sort_order ASC, started_at ASC
        """,
        run_id,
    )

    logs = [_map_run_log(dict(log_row)) for log_row in log_rows]
    return _map_run_record(dict(row), logs)


async def _ensure_definition_is_present(row: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_workflow_graph(
        workflow_id=str(row["id"]),
        workflow_name=row["name"],
        status=row["status"],
        nodes=[
            WorkflowNodeDefinition(**node)
            for node in _coerce_json_value(row.get("nodes_json"), [])
        ],
        edges=[
            WorkflowEdgeDefinition(**edge)
            for edge in _coerce_json_value(row.get("edges_json"), [])
        ],
    )

    await fetchrow(
        """
        UPDATE workflows
        SET
          description = $2,
          trigger_type = $3,
          webhook_path = $4,
          nodes_json = $5::JSONB,
          edges_json = $6::JSONB,
          definition_json = $7::JSONB,
          validation_errors_json = $8::JSONB,
          updated_at = NOW()
        WHERE id = $1::UUID
        RETURNING id
        """,
        str(row["id"]),
        normalized["description"],
        normalized["triggerType"],
        normalized["webhookPath"],
        json.dumps([_serialize_model(node) for node in normalized["nodes"]]),
        json.dumps([_serialize_model(edge) for edge in normalized["edges"]]),
        json.dumps(_serialize_model(normalized["definition"])),
        json.dumps([_serialize_model(issue) for issue in normalized["validationIssues"]]),
    )

    return _serialize_model(normalized["definition"])


async def update_temporal_run_id(run_id: str, temporal_run_id: str) -> None:
    await fetchrow(
        """
        UPDATE workflow_runs
        SET temporal_run_id = $2
        WHERE id = $1::UUID
        RETURNING id
        """,
        run_id,
        temporal_run_id,
    )


async def _create_run_record(
    user_id: str,
    workflow_row: Dict[str, Any],
    trigger_type: str,
    input_payload: Any,
) -> Dict[str, Any]:
    run_id = str(uuid4())
    temporal_workflow_id = "torq-flows-run-{0}".format(run_id)
    definition = await _ensure_definition_is_present(workflow_row)
    node_count = len(definition.get("nodes", {}))

    row = await fetchrow(
        """
        INSERT INTO workflow_runs (
          id,
          workflow_id,
          user_id,
          temporal_run_id,
          status,
          trigger_type,
          started_at,
          completed_at,
          duration_ms,
          node_count,
          nodes_completed,
          input_payload,
          final_output,
          error_message
        )
        VALUES (
          $1::UUID,
          $2::UUID,
          $3::UUID,
          $4,
          'queued',
          $5,
          NOW(),
          NULL,
          NULL,
          $6,
          0,
          $7::JSONB,
          NULL,
          NULL
        )
        RETURNING
          id,
          workflow_id,
          temporal_run_id,
          status,
          trigger_type,
          started_at,
          completed_at,
          duration_ms,
          node_count,
          nodes_completed,
          input_payload,
          final_output,
          error_message
        """,
        run_id,
        str(workflow_row["id"]),
        user_id,
        temporal_workflow_id,
        trigger_type,
        node_count,
        json.dumps(input_payload if input_payload is not None else {}),
    )

    if row is None:
        raise RuntimeError("Run record could not be created.")

    return {
        "run": dict(row),
        "definition": definition,
        "temporalWorkflowId": temporal_workflow_id,
    }


async def start_run_for_workflow(
    user_id: str, workflow_id: str, input_payload: Any, source: str
) -> WorkflowRun:
    workflow_row = await fetchrow(
        """
        SELECT
          id,
          user_id,
          name,
          status,
          trigger_type,
          webhook_path,
          nodes_json,
          edges_json,
          definition_json,
          validation_errors_json
        FROM workflows
        WHERE user_id = $1::UUID
          AND id = $2::UUID
        LIMIT 1
        """,
        user_id,
        workflow_id,
    )

    if workflow_row is None:
        raise NotFoundError("Workflow not found.")

    workflow_data = dict(workflow_row)

    if workflow_data["status"] == "archived":
        raise WorkflowValidationException(
            "Archived workflows cannot be executed.",
            [ValidationIssue(message="Archived workflows cannot be executed.", code="archived")],
        )

    run_context = await _create_run_record(
        user_id=user_id,
        workflow_row=workflow_data,
        trigger_type="manual" if source == "manual" else workflow_data["trigger_type"],
        input_payload=input_payload,
    )

    from .temporal_runtime import TASK_QUEUE_NAME, get_temporal_client
    from .temporal_workflow import FlowExecutionWorkflow

    try:
        client = await get_temporal_client()
        handle = await client.start_workflow(
            FlowExecutionWorkflow.run,
            {
                "run_id": str(run_context["run"]["id"]),
                "workflow_id": str(workflow_data["id"]),
                "workflow_name": workflow_data["name"],
                "trigger_type": workflow_data["trigger_type"],
                "source": source,
                "definition": run_context["definition"],
                "input_payload": input_payload if input_payload is not None else {},
                "default_api_timeout_seconds": settings.api_request_timeout_seconds,
            },
            id=run_context["temporalWorkflowId"],
            task_queue=TASK_QUEUE_NAME,
        )
        await update_temporal_run_id(
            str(run_context["run"]["id"]),
            str(handle.run_id or handle.first_execution_run_id or run_context["temporalWorkflowId"]),
        )
    except Exception as error:
        await mark_run_failed(str(run_context["run"]["id"]), str(error), 0)
        if _is_temporal_connection_error(error):
            raise TemporalUnavailableError(_build_temporal_unavailable_message(error)) from error
        raise RuntimeError("Workflow execution could not be started: {0}".format(error)) from error

    run = await get_run(user_id, str(run_context["run"]["id"]))
    if run is None:
        raise NotFoundError("Run not found.")
    return run


async def start_run_from_webhook(workflow_id: str, input_payload: Any) -> WorkflowRun:
    workflow_row = await fetchrow(
        """
        SELECT
          id,
          user_id,
          name,
          status,
          trigger_type,
          webhook_path,
          nodes_json,
          edges_json,
          definition_json,
          validation_errors_json
        FROM workflows
        WHERE webhook_path = $1
          AND trigger_type = 'webhook'
          AND status = 'active'
        LIMIT 1
        """,
        workflow_id,
    )

    if workflow_row is None:
        raise NotFoundError("Webhook workflow not found.")

    workflow_data = dict(workflow_row)
    user_id = str(workflow_data["user_id"])
    run_context = await _create_run_record(
        user_id=user_id,
        workflow_row=workflow_data,
        trigger_type="webhook",
        input_payload=input_payload,
    )

    from .temporal_runtime import TASK_QUEUE_NAME, get_temporal_client
    from .temporal_workflow import FlowExecutionWorkflow

    try:
        client = await get_temporal_client()
        handle = await client.start_workflow(
            FlowExecutionWorkflow.run,
            {
                "run_id": str(run_context["run"]["id"]),
                "workflow_id": str(workflow_data["id"]),
                "workflow_name": workflow_data["name"],
                "trigger_type": "webhook",
                "source": "webhook",
                "definition": run_context["definition"],
                "input_payload": input_payload if input_payload is not None else {},
                "default_api_timeout_seconds": settings.api_request_timeout_seconds,
            },
            id=run_context["temporalWorkflowId"],
            task_queue=TASK_QUEUE_NAME,
        )
        await update_temporal_run_id(
            str(run_context["run"]["id"]),
            str(handle.run_id or handle.first_execution_run_id or run_context["temporalWorkflowId"]),
        )
    except Exception as error:
        await mark_run_failed(str(run_context["run"]["id"]), str(error), 0)
        if _is_temporal_connection_error(error):
            raise TemporalUnavailableError(_build_temporal_unavailable_message(error)) from error
        raise RuntimeError("Workflow execution could not be started: {0}".format(error)) from error

    run = await get_run(user_id, str(run_context["run"]["id"]))
    if run is None:
        raise NotFoundError("Run not found.")
    return run


async def mark_run_running(run_id: str) -> None:
    await fetchrow(
        """
        UPDATE workflow_runs
        SET status = 'running'
        WHERE id = $1::UUID
          AND status = 'queued'
        RETURNING id
        """,
        run_id,
    )


async def append_run_log(
    run_id: str,
    node_id: str,
    node_type: str,
    node_label: str,
    status: str,
    sort_order: int,
    output: str = "",
    error: Optional[str] = None,
    started_at: Optional[datetime] = None,
    completed_at: Optional[datetime] = None,
    duration_ms: Optional[int] = None,
    nodes_completed: Optional[int] = None,
) -> None:
    await fetchrow(
        """
        INSERT INTO run_logs (
          id,
          run_id,
          node_id,
          node_type,
          node_label,
          status,
          started_at,
          completed_at,
          duration_ms,
          output,
          error,
          sort_order
        )
        VALUES (
          $1::UUID,
          $2::UUID,
          $3,
          $4,
          $5,
          $6,
          COALESCE($7, NOW()),
          $8,
          $9,
          $10,
          $11,
          $12
        )
        RETURNING id
        """,
        str(uuid4()),
        run_id,
        node_id,
        node_type,
        node_label,
        status,
        started_at,
        completed_at,
        duration_ms,
        output,
        error,
        sort_order,
    )

    if nodes_completed is not None:
        await fetchrow(
            """
            UPDATE workflow_runs
            SET nodes_completed = GREATEST(nodes_completed, $2),
                status = CASE WHEN status = 'queued' THEN 'running' ELSE status END
            WHERE id = $1::UUID
            RETURNING id
            """,
            run_id,
            nodes_completed,
        )


async def mark_run_completed(run_id: str, final_output: Any, nodes_completed: int) -> None:
    await fetchrow(
        """
        UPDATE workflow_runs
        SET
          status = 'completed',
          completed_at = NOW(),
          duration_ms = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000))::INT,
          nodes_completed = $2,
          final_output = $3::JSONB,
          error_message = NULL
        WHERE id = $1::UUID
        RETURNING id
        """,
        run_id,
        nodes_completed,
        json.dumps(final_output if final_output is not None else {}),
    )


async def mark_run_failed(run_id: str, error_message: str, nodes_completed: int) -> None:
    await fetchrow(
        """
        UPDATE workflow_runs
        SET
          status = 'failed',
          completed_at = NOW(),
          duration_ms = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000))::INT,
          nodes_completed = $2,
          error_message = $3
        WHERE id = $1::UUID
        RETURNING id
        """,
        run_id,
        nodes_completed,
        error_message,
    )
