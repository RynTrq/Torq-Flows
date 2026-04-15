from __future__ import annotations

from pathlib import Path
from typing import Optional

from temporalio.client import Client
from temporalio.service import TLSConfig
from temporalio.worker import Worker

from .config import Settings, get_settings
from .temporal_activities import (
    append_run_log_activity,
    mark_run_completed_activity,
    mark_run_failed_activity,
    mark_run_running_activity,
    perform_api_call_activity,
)
from .temporal_workflow import FlowExecutionWorkflow

settings = get_settings()
TASK_QUEUE_NAME = settings.temporal_task_queue
_temporal_client: Optional[Client] = None


def _read_tls_value(data: str, path: str) -> Optional[bytes]:
    if data:
        return data.encode("utf-8")

    if path:
        return Path(path).expanduser().read_bytes()

    return None


def build_temporal_tls_config(settings: Settings) -> bool | TLSConfig:
    server_root_ca_cert = _read_tls_value(
        settings.temporal_tls_server_root_ca_cert_data,
        settings.temporal_tls_server_root_ca_cert_path,
    )
    client_cert = _read_tls_value(
        settings.temporal_tls_client_cert_data,
        settings.temporal_tls_client_cert_path,
    )
    client_private_key = _read_tls_value(
        settings.temporal_tls_client_key_data,
        settings.temporal_tls_client_key_path,
    )

    needs_tls = any(
        (
            settings.temporal_api_key,
            server_root_ca_cert,
            client_cert,
            client_private_key,
            ".tmprl.cloud" in settings.temporal_address,
        )
    )

    if not needs_tls:
        return False

    if any(
        (
            server_root_ca_cert,
            client_cert,
            client_private_key,
            settings.temporal_tls_server_name,
        )
    ):
        return TLSConfig(
            server_root_ca_cert=server_root_ca_cert,
            domain=settings.temporal_tls_server_name or None,
            client_cert=client_cert,
            client_private_key=client_private_key,
        )

    return True


def build_temporal_client_connect_kwargs(settings: Settings) -> dict[str, object]:
    return {
        "namespace": settings.temporal_namespace,
        "api_key": settings.temporal_api_key or None,
        "tls": build_temporal_tls_config(settings),
    }


async def get_temporal_client() -> Client:
    global _temporal_client

    if _temporal_client is None:
        _temporal_client = await Client.connect(
            settings.temporal_address,
            **build_temporal_client_connect_kwargs(settings),
        )

    return _temporal_client


async def run_worker() -> None:
    client = await get_temporal_client()
    worker = Worker(
        client,
        task_queue=TASK_QUEUE_NAME,
        workflows=[FlowExecutionWorkflow],
        activities=[
            mark_run_running_activity,
            append_run_log_activity,
            mark_run_completed_activity,
            mark_run_failed_activity,
            perform_api_call_activity,
        ],
    )
    await worker.run()
