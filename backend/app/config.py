from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


def _load_environment() -> None:
    project_root = Path(__file__).resolve().parents[2]
    dotenv_files = [
        project_root / ".env",
        project_root / ".env.local",
    ]

    for dotenv_file in dotenv_files:
        if dotenv_file.exists():
            load_dotenv(dotenv_path=dotenv_file, override=False)


_load_environment()


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    database_ssl: str
    temporal_address: str
    temporal_namespace: str
    temporal_api_key: str
    temporal_tls_server_name: str
    temporal_tls_server_root_ca_cert_data: str
    temporal_tls_server_root_ca_cert_path: str
    temporal_tls_client_cert_data: str
    temporal_tls_client_cert_path: str
    temporal_tls_client_key_data: str
    temporal_tls_client_key_path: str
    temporal_task_queue: str
    api_request_timeout_seconds: int


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        app_env=os.getenv("APP_ENV", "development").strip().lower(),
        database_url=os.getenv("DATABASE_URL", "").strip(),
        database_ssl=os.getenv("DATABASE_SSL", "false").strip().lower(),
        temporal_address=os.getenv("TEMPORAL_ADDRESS", "localhost:7233").strip(),
        temporal_namespace=os.getenv("TEMPORAL_NAMESPACE", "default").strip(),
        temporal_api_key=os.getenv("TEMPORAL_API_KEY", "").strip(),
        temporal_tls_server_name=os.getenv("TEMPORAL_TLS_SERVER_NAME", "").strip(),
        temporal_tls_server_root_ca_cert_data=os.getenv(
            "TEMPORAL_TLS_SERVER_ROOT_CA_CERT_DATA", ""
        ).strip(),
        temporal_tls_server_root_ca_cert_path=os.getenv(
            "TEMPORAL_TLS_SERVER_ROOT_CA_CERT_PATH", ""
        ).strip(),
        temporal_tls_client_cert_data=os.getenv("TEMPORAL_TLS_CLIENT_CERT_DATA", "").strip(),
        temporal_tls_client_cert_path=os.getenv("TEMPORAL_TLS_CLIENT_CERT_PATH", "").strip(),
        temporal_tls_client_key_data=os.getenv("TEMPORAL_TLS_CLIENT_KEY_DATA", "").strip(),
        temporal_tls_client_key_path=os.getenv("TEMPORAL_TLS_CLIENT_KEY_PATH", "").strip(),
        temporal_task_queue=os.getenv("TEMPORAL_TASK_QUEUE", "torq-flows-workflows").strip(),
        api_request_timeout_seconds=int(os.getenv("API_REQUEST_TIMEOUT_SECONDS", "30")),
    )


def validate_settings(settings: Settings) -> None:
    errors = []

    if not settings.database_url:
        errors.append("DATABASE_URL is required.")

    if not settings.temporal_address:
        errors.append("TEMPORAL_ADDRESS is required.")

    if not settings.temporal_namespace:
        errors.append("TEMPORAL_NAMESPACE is required.")

    has_client_cert = bool(
        settings.temporal_tls_client_cert_data or settings.temporal_tls_client_cert_path
    )
    has_client_key = bool(
        settings.temporal_tls_client_key_data or settings.temporal_tls_client_key_path
    )

    if has_client_cert != has_client_key:
        errors.append(
            "TEMPORAL_TLS_CLIENT_CERT_* and TEMPORAL_TLS_CLIENT_KEY_* must be configured together."
        )

    if settings.app_env == "production":
        placeholder_markers = (
            "your-",
            "change-me",
            "example.com",
        )

        if any(marker in settings.database_url for marker in placeholder_markers):
            errors.append("DATABASE_URL contains placeholder values.")

        if any(marker in settings.temporal_address for marker in placeholder_markers):
            errors.append("TEMPORAL_ADDRESS contains placeholder values.")

        if any(marker in settings.temporal_namespace for marker in placeholder_markers):
            errors.append("TEMPORAL_NAMESPACE contains placeholder values.")

        if settings.temporal_api_key and any(
            marker in settings.temporal_api_key for marker in placeholder_markers
        ):
            errors.append("TEMPORAL_API_KEY contains placeholder values.")

        uses_temporal_cloud = ".tmprl.cloud" in settings.temporal_address

        if uses_temporal_cloud and settings.temporal_namespace == "default":
            errors.append(
                "Temporal Cloud requires TEMPORAL_NAMESPACE to use the full <namespace>.<account_id> value."
            )

        if uses_temporal_cloud and not (settings.temporal_api_key or has_client_cert):
            errors.append(
                "Temporal Cloud requires TEMPORAL_API_KEY or mTLS client certificate credentials."
            )

    if errors:
        raise RuntimeError("Invalid backend configuration: {0}".format(" ".join(errors)))
