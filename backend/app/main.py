from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .config import get_settings, validate_settings
from .database import close_pool, ensure_schema
from .graph import WorkflowValidationException
from .healthcheck import get_readiness_checks
from .models import BulkDeleteRequest, RunStartRequest, WorkflowUpsertRequest
from .service import (
    NotFoundError,
    TemporalUnavailableError,
    delete_workflows,
    get_app_shell_counts,
    get_run,
    get_workflow,
    list_runs,
    list_workflows,
    start_run_for_workflow,
    start_run_from_webhook,
    update_workflow_status,
    upsert_workflow,
)


def _to_payload(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if isinstance(value, list):
        return [_to_payload(item) for item in value]
    if isinstance(value, dict):
        return {key: _to_payload(item) for key, item in value.items()}
    return value


async def require_user_id(x_user_id: str = Header(default="", alias="X-User-Id")) -> str:
    if not x_user_id.strip():
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_user_id.strip()


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_settings(get_settings())
    await ensure_schema()
    try:
        yield
    finally:
        await close_pool()


app = FastAPI(title="Torq Flows Backend", lifespan=lifespan)


@app.exception_handler(WorkflowValidationException)
async def handle_validation_error(_: Request, error: WorkflowValidationException):
    return JSONResponse(
        status_code=422,
        content={
            "error": str(error),
            "validationErrors": _to_payload(error.issues),
        },
    )


@app.exception_handler(NotFoundError)
async def handle_not_found(_: Request, error: NotFoundError):
    return JSONResponse(status_code=404, content={"error": str(error)})


@app.exception_handler(TemporalUnavailableError)
async def handle_temporal_unavailable(_: Request, error: TemporalUnavailableError):
    return JSONResponse(
        status_code=503,
        content={
            "error": str(error),
            "code": "temporal_unavailable",
        },
    )


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/health/live")
async def health_live() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    status_code, checks = await get_readiness_checks()

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if status_code == 200 else "error",
            "checks": checks,
        },
    )


@app.get("/api/dashboard/summary")
async def dashboard_summary(user_id: str = Depends(require_user_id)):
    return {"counts": _to_payload(await get_app_shell_counts(user_id))}


@app.get("/api/workflows")
async def workflows_index(user_id: str = Depends(require_user_id)):
    workflows = await list_workflows(user_id)
    return {"workflows": _to_payload(workflows)}


@app.post("/api/workflows", status_code=201)
async def workflows_create(payload: WorkflowUpsertRequest, user_id: str = Depends(require_user_id)):
    workflow = await upsert_workflow(user_id, payload)
    return {"workflow": _to_payload(workflow)}


@app.get("/api/workflows/{workflow_id}")
async def workflows_show(workflow_id: str, user_id: str = Depends(require_user_id)):
    workflow = await get_workflow(user_id, workflow_id)
    if workflow is None:
        raise NotFoundError("Workflow not found.")
    return {"workflow": _to_payload(workflow)}


async def _update_workflow_from_request(
    workflow_id: str, request: Request, user_id: str
) -> JSONResponse:
    body = await request.json()

    if (
        isinstance(body, dict)
        and isinstance(body.get("status"), str)
        and "nodes" not in body
        and "edges" not in body
        and "name" not in body
    ):
        workflow = await update_workflow_status(user_id, workflow_id, body["status"])
        return JSONResponse(content={"workflow": _to_payload(workflow)})

    payload = WorkflowUpsertRequest(**body)
    workflow = await upsert_workflow(user_id, payload, workflow_id=workflow_id)
    return JSONResponse(content={"workflow": _to_payload(workflow)})


@app.patch("/api/workflows/{workflow_id}")
async def workflows_update_patch(
    workflow_id: str, request: Request, user_id: str = Depends(require_user_id)
):
    return await _update_workflow_from_request(workflow_id, request, user_id)


@app.put("/api/workflows/{workflow_id}")
async def workflows_update_put(
    workflow_id: str, request: Request, user_id: str = Depends(require_user_id)
):
    return await _update_workflow_from_request(workflow_id, request, user_id)


@app.delete("/api/workflows")
async def workflows_destroy_many(
    payload: BulkDeleteRequest, user_id: str = Depends(require_user_id)
):
    deleted_count = await delete_workflows(user_id, payload.ids)
    return {"deletedCount": deleted_count}


@app.delete("/api/workflows/{workflow_id}")
async def workflows_destroy_one(workflow_id: str, user_id: str = Depends(require_user_id)):
    deleted_count = await delete_workflows(user_id, [workflow_id])
    return {"deletedCount": deleted_count}


@app.post("/api/workflows/{workflow_id}/run", status_code=201)
async def workflows_run(
    workflow_id: str,
    payload: RunStartRequest,
    user_id: str = Depends(require_user_id),
):
    run = await start_run_for_workflow(user_id, workflow_id, payload.inputPayload, source="manual")
    return {"run": _to_payload(run)}


@app.get("/api/runs")
async def runs_index(user_id: str = Depends(require_user_id)):
    runs = await list_runs(user_id)
    return {"runs": _to_payload(runs)}


@app.get("/api/runs/{run_id}")
async def runs_show(run_id: str, user_id: str = Depends(require_user_id)):
    run = await get_run(user_id, run_id)
    if run is None:
        raise NotFoundError("Run not found.")
    return {"run": _to_payload(run)}


@app.post("/api/webhooks/{workflow_id}", status_code=201)
async def webhook_run(workflow_id: str, payload: Any = Body(default_factory=dict)):
    run = await start_run_from_webhook(workflow_id, payload)
    return {"run": _to_payload(run)}
