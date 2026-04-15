from __future__ import annotations

import asyncio

from .config import get_settings, validate_settings
from .database import close_pool, ensure_schema
from .temporal_runtime import run_worker


async def main() -> None:
    validate_settings(get_settings())
    await ensure_schema()
    try:
        await run_worker()
    finally:
        await close_pool()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
