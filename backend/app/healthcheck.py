from __future__ import annotations

import asyncio
import sys
from typing import Dict, Tuple

from .config import get_settings, validate_settings
from .database import close_pool, fetchrow
from .temporal_runtime import get_temporal_client


def _error_message(error: Exception) -> str:
    return str(error).strip() or error.__class__.__name__


async def get_database_health() -> Dict[str, str]:
    try:
        await fetchrow("SELECT 1 AS ok")
        return {"status": "ok"}
    except Exception as error:
        return {
            "status": "error",
            "error": _error_message(error),
        }


async def get_temporal_health() -> Dict[str, str]:
    try:
        await asyncio.wait_for(get_temporal_client(), timeout=5)
        return {"status": "ok"}
    except Exception as error:
        return {
            "status": "error",
            "error": _error_message(error),
        }


async def get_readiness_checks() -> Tuple[int, Dict[str, Dict[str, str]]]:
    checks = {
        "database": await get_database_health(),
        "temporal": await get_temporal_health(),
    }
    status_code = 200 if all(check["status"] == "ok" for check in checks.values()) else 503
    return status_code, checks


async def run_healthcheck(mode: str) -> int:
    validate_settings(get_settings())

    if mode not in {"api", "worker"}:
        raise ValueError("Healthcheck mode must be either 'api' or 'worker'.")

    status_code, _ = await get_readiness_checks()
    return 0 if status_code == 200 else 1


def main(argv: list[str]) -> int:
    mode = argv[1].strip().lower() if len(argv) > 1 else "api"
    return asyncio.run(run_healthcheck(mode))


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv))
    finally:
        asyncio.run(close_pool())
