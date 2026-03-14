"""
DuckDB connection helpers.

The API mixes sync endpoints (threadpool) and async endpoints (event loop). Keeping
cached per-thread connections leaves read-only handles alive across requests, which
causes mode conflicts when another request needs read-write access. To avoid that,
connections are short-lived and guarded by a process-level read/write lock.
"""

import logging
import os
import time
from contextlib import contextmanager
from pathlib import Path
from threading import Condition, RLock
from typing import Generator

import duckdb

from api.dev_sample_db import bootstrap_sample_database

logger = logging.getLogger(__name__)


def _default_db_path() -> str:
    configured = os.getenv("HERMES_DUCKDB_PATH")
    if configured:
        return configured

    environment = os.getenv("ENVIRONMENT", "development").lower()
    if environment == "production":
        return "/data/cnpj.duckdb"

    return str(Path(__file__).resolve().parents[1] / "devdata" / "hermes-dev.duckdb")


DB_PATH = _default_db_path()

DUCKDB_CONFIG = {
    "threads": 1,
    "max_memory": os.getenv("DUCKDB_MAX_MEMORY", "2GB"),
    "temp_directory": os.getenv("DUCKDB_TEMP_DIR", "/tmp"),
}

DUCKDB_WRITE_LOCK_RETRIES = max(1, int(os.getenv("DUCKDB_WRITE_LOCK_RETRIES", "6") or 6))
DUCKDB_WRITE_LOCK_DELAY = max(0.1, float(os.getenv("DUCKDB_WRITE_LOCK_DELAY", "0.35") or 0.35))

_mode_condition = Condition(RLock())
_active_readers = 0
_active_writer = False
_waiting_writers = 0
_open_connections: set[duckdb.DuckDBPyConnection] = set()


def _is_connection_alive(conn: duckdb.DuckDBPyConnection | None) -> bool:
    if conn is None:
        return False
    try:
        conn.execute("SELECT 1")
        return True
    except Exception:
        return False


def _close_connection(conn: duckdb.DuckDBPyConnection | None) -> None:
    if conn is None:
        return
    with _mode_condition:
        _open_connections.discard(conn)
    try:
        conn.close()
    except Exception:
        pass


def _open_connection(read_only: bool) -> duckdb.DuckDBPyConnection:
    if not os.path.exists(DB_PATH):
        environment = os.getenv("ENVIRONMENT", "development").lower()
        if environment != "production":
            bootstrap_sample_database(DB_PATH)

    attempts = 1 if read_only else DUCKDB_WRITE_LOCK_RETRIES
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            conn = duckdb.connect(
                DB_PATH,
                read_only=read_only,
                config=DUCKDB_CONFIG,
            )
            temp_dir = DUCKDB_CONFIG.get("temp_directory", "/tmp")
            conn.execute(f"SET temp_directory='{temp_dir}'")
            logger.debug("Nova conexao DuckDB criada (read_only=%s, temp=%s)", read_only, temp_dir)
            return conn
        except Exception as exc:
            last_error = exc
            message = str(exc).lower()
            lock_conflict = (
                not read_only
                and "could not set lock on file" in message
                and attempt < attempts
            )
            if not lock_conflict:
                raise
            logger.warning(
                "Conflito de lock DuckDB ao abrir escrita (tentativa %s/%s); retry em %.2fs",
                attempt,
                attempts,
                DUCKDB_WRITE_LOCK_DELAY,
            )
            time.sleep(DUCKDB_WRITE_LOCK_DELAY)

    assert last_error is not None
    raise last_error


def _enter_mode(read_only: bool) -> None:
    global _active_readers, _active_writer, _waiting_writers

    with _mode_condition:
        if read_only:
            while _active_writer or _waiting_writers > 0:
                _mode_condition.wait()
            _active_readers += 1
            return

        _waiting_writers += 1
        try:
            while _active_writer or _active_readers > 0:
                _mode_condition.wait()
            _active_writer = True
        finally:
            _waiting_writers -= 1


def _leave_mode(read_only: bool) -> None:
    global _active_readers, _active_writer

    with _mode_condition:
        if read_only:
            _active_readers = max(0, _active_readers - 1)
        else:
            _active_writer = False
        _mode_condition.notify_all()


@contextmanager
def get_connection(read_only: bool = True) -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """
    Open a short-lived DuckDB connection under a process-level read/write guard.
    """
    conn: duckdb.DuckDBPyConnection | None = None
    _enter_mode(read_only)
    try:
        conn = _open_connection(read_only)
        with _mode_condition:
            _open_connections.add(conn)
        yield conn
    except Exception as exc:
        logger.error("Erro na query DuckDB: %s", exc)
        raise
    finally:
        _close_connection(conn)
        _leave_mode(read_only)


def close_all_connections() -> None:
    """
    Close any currently tracked connections.
    """
    with _mode_condition:
        connections = list(_open_connections)
        _open_connections.clear()
    for conn in connections:
        try:
            conn.close()
        except Exception:
            pass
    logger.info("Todas as conexoes DuckDB foram fechadas")


def test_connection() -> bool:
    """
    Test whether the database is reachable.
    """
    try:
        with get_connection(read_only=True) as conn:
            result = conn.execute("SELECT 1 as test").fetchone()
            return result[0] == 1
    except Exception as exc:
        logger.error("Teste de conexao falhou: %s", exc)
        return False


def healthcheck() -> dict:
    """
    Return database health metadata.
    """
    try:
        with get_connection(read_only=True) as conn:
            conn.execute("SELECT 1")
            count = conn.execute("SELECT COUNT(*) FROM cnpj_empresas").fetchone()[0]
            return {
                "status": "healthy",
                "database": DB_PATH,
                "total_empresas": int(count),
                "read_only": True,
            }
    except Exception as exc:
        return {
            "status": "unhealthy",
            "error": str(exc),
        }
