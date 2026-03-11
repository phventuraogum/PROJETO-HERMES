"""
Pool de conexoes DuckDB para producao.
Gerencia conexoes thread-local com upgrade seguro de modo leitura -> escrita.
"""

import logging
import os
import time
from contextlib import contextmanager
from pathlib import Path
from threading import local
from typing import Generator

import duckdb

from api.dev_sample_db import bootstrap_sample_database

logger = logging.getLogger(__name__)

_thread_local = local()


def _connection_attrs() -> tuple[str, str]:
    return ("connection_True", "connection_False")


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


def _drop_connection_attr(attr_name: str) -> None:
    conn = getattr(_thread_local, attr_name, None)
    if conn is None:
        return
    try:
        conn.close()
    except Exception:
        pass
    try:
        delattr(_thread_local, attr_name)
    except Exception:
        pass


def _drop_connection_handle(conn: duckdb.DuckDBPyConnection) -> None:
    for attr_name in _connection_attrs():
        if getattr(_thread_local, attr_name, None) is conn:
            _drop_connection_attr(attr_name)


def _is_connection_alive(conn: duckdb.DuckDBPyConnection | None) -> bool:
    if conn is None:
        return False
    try:
        conn.execute("SELECT 1")
        return True
    except Exception:
        return False


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


def _get_connection(read_only: bool = True) -> duckdb.DuckDBPyConnection:
    """
    Obtem ou cria uma conexao DuckDB thread-local.
    Se ja existir uma conexao read-write na thread, ela e reutilizada para leituras.
    Se for necessario escrever e houver uma conexao read-only, ela e reciclada.
    """
    connection_key = f"connection_{read_only}"
    opposite_key = f"connection_{not read_only}"

    existing = getattr(_thread_local, connection_key, None)
    if _is_connection_alive(existing):
        return existing
    if existing is not None:
        _drop_connection_attr(connection_key)

    opposite = getattr(_thread_local, opposite_key, None)
    if _is_connection_alive(opposite):
        if read_only:
            return opposite
        _drop_connection_attr(opposite_key)
    elif opposite is not None:
        _drop_connection_attr(opposite_key)

    try:
        conn = _open_connection(read_only)
    except Exception as exc:
        logger.error("Erro ao criar conexao DuckDB: %s", exc)
        raise

    setattr(_thread_local, connection_key, conn)
    return conn


@contextmanager
def get_connection(read_only: bool = True) -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """
    Context manager para conexoes DuckDB.
    """
    conn = _get_connection(read_only)
    try:
        yield conn
    except Exception as exc:
        logger.error("Erro na query DuckDB: %s", exc)
        _drop_connection_handle(conn)
        raise


def close_all_connections() -> None:
    """
    Fecha todas as conexoes thread-local.
    """
    for attr_name in _connection_attrs():
        _drop_connection_attr(attr_name)
    logger.info("Todas as conexoes DuckDB foram fechadas")


def test_connection() -> bool:
    """
    Testa se a conexao esta funcionando.
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
    Retorna status de saude do banco de dados.
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
