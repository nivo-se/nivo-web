"""Database service factory for SQLite access."""
from __future__ import annotations

import logging
import os
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, List, Optional

logger = logging.getLogger(__name__)


class DatabaseService:
    """Lightweight wrapper around SQLite with convenience helpers."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        if not self.db_path.exists():
            logger.warning("SQLite database not found at %s", self.db_path)

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def run_raw_query(self, sql: str, params: Optional[Iterable[Any]] = None) -> List[dict]:
        """Execute a raw SQL query and return dict rows."""
        params = list(params or [])
        with self._get_connection() as conn:
            cursor = conn.execute(sql, params)
            rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def run_query_with_count(
        self, query_sql: str, count_sql: str, params: Optional[Iterable[Any]] = None
    ) -> tuple[List[dict], int]:
        params = list(params or [])
        with self._get_connection() as conn:
            result_rows = conn.execute(query_sql, params).fetchall()
            count_rows = conn.execute(count_sql, params[: -2] if len(params) >= 2 else params).fetchone()
        rows = [dict(row) for row in result_rows]
        total = int(count_rows[0]) if count_rows else 0
        return rows, total


@lru_cache()
def get_database_service() -> DatabaseService:
    db_path = os.getenv("LOCAL_SQLITE_PATH") or os.getenv("DATABASE_URL") or "allabolag.db"
    return DatabaseService(Path(db_path))


__all__ = ["DatabaseService", "get_database_service"]
