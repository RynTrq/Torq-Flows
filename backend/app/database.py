from __future__ import annotations

import ssl
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Iterable, Optional

import asyncpg

from .config import get_settings

_pool: Optional[asyncpg.Pool] = None
_schema_ready = False

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'draft', 'archived')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'webhook')),
  webhook_path TEXT UNIQUE,
  nodes_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  edges_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  definition_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  validation_errors_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS definition_json JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS validation_errors_json JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  temporal_run_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'webhook')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  node_count INTEGER NOT NULL DEFAULT 0,
  nodes_completed INTEGER NOT NULL DEFAULT 0,
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  final_output JSONB,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS run_logs (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  output TEXT NOT NULL DEFAULT '',
  error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_id ON workflow_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_logs_run_id ON run_logs(run_id, sort_order);
"""


def _get_ssl_config() -> Any:
    settings = get_settings()
    database_url = settings.database_url

    if settings.database_ssl == "false":
        return False
    if settings.database_ssl == "true":
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        return ssl_context
    if "localhost" in database_url or "127.0.0.1" in database_url:
        return False
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    return ssl_context


async def get_pool() -> asyncpg.Pool:
    global _pool

    settings = get_settings()

    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required for the FastAPI backend.")

    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            ssl=_get_ssl_config(),
            min_size=1,
            max_size=10,
        )

    return _pool


async def ensure_schema() -> None:
    global _schema_ready

    if _schema_ready:
        return

    pool = await get_pool()
    async with pool.acquire() as connection:
        await connection.execute(SCHEMA_SQL)

    _schema_ready = True


async def fetch(query: str, *args: Any) -> Iterable[asyncpg.Record]:
    await ensure_schema()
    pool = await get_pool()
    async with pool.acquire() as connection:
        return await connection.fetch(query, *args)


async def fetchrow(query: str, *args: Any) -> Optional[asyncpg.Record]:
    await ensure_schema()
    pool = await get_pool()
    async with pool.acquire() as connection:
        return await connection.fetchrow(query, *args)


async def execute(query: str, *args: Any) -> str:
    await ensure_schema()
    pool = await get_pool()
    async with pool.acquire() as connection:
        return await connection.execute(query, *args)


@asynccontextmanager
async def transaction() -> AsyncIterator[asyncpg.Connection]:
    await ensure_schema()
    pool = await get_pool()
    async with pool.acquire() as connection:
        async with connection.transaction():
            yield connection


async def close_pool() -> None:
    global _pool, _schema_ready

    if _pool is not None:
        await _pool.close()
        _pool = None
    _schema_ready = False
