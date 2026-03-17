"""
Pool de Conexões DuckDB para Produção

Dois bancos separados:
  - cnpj.duckdb  → dados da Receita Federal (read-only)
  - app.duckdb   → dados de aplicação: lead_lists, pipeline, etc. (read-write)

Quando read_only=True  → conecta em cnpj.duckdb (somente leitura)
Quando read_only=False → conecta em app.duckdb  (leitura e escrita)
"""
import os
import duckdb
from contextlib import contextmanager
from threading import local, Lock
from typing import Generator
import logging

logger = logging.getLogger(__name__)

# Thread-local storage para conexões
_thread_local = local()

# Caminhos dos bancos
CNPJ_DB_PATH = os.getenv("HERMES_DUCKDB_PATH", "/data/cnpj.duckdb")
APP_DB_PATH = os.getenv("HERMES_APP_DB_PATH", "/data/app.duckdb")

# Lock global para escrita no app.duckdb (DuckDB só permite 1 writer por vez)
_app_write_lock = Lock()

DUCKDB_CONFIG_READ = {
    'threads': 2,
    'max_memory': os.getenv('DUCKDB_MAX_MEMORY', '2GB'),
}

DUCKDB_CONFIG_WRITE = {
    'threads': 1,
    'max_memory': '256MB',
}


def _get_connection(read_only: bool = True) -> duckdb.DuckDBPyConnection:
    """
    Obtém ou cria uma conexão DuckDB thread-local.

    read_only=True  → cnpj.duckdb (Receita Federal, somente leitura)
    read_only=False → app.duckdb  (dados de aplicação, leitura/escrita)
    """
    connection_key = f'conn_{"ro" if read_only else "rw"}'

    existing = getattr(_thread_local, connection_key, None)
    if existing is not None:
        try:
            existing.execute("SELECT 1")
            return existing
        except Exception:
            try:
                existing.close()
            except Exception:
                pass
            try:
                delattr(_thread_local, connection_key)
            except AttributeError:
                pass

    db_path = CNPJ_DB_PATH if read_only else APP_DB_PATH
    config = DUCKDB_CONFIG_READ if read_only else DUCKDB_CONFIG_WRITE

    try:
        conn = duckdb.connect(db_path, read_only=read_only, config=config)
        if not read_only:
            temp_dir = os.getenv('DUCKDB_TEMP_DIR', '/tmp')
            conn.execute(f"SET temp_directory='{temp_dir}'")
        setattr(_thread_local, connection_key, conn)
        logger.debug(f"Nova conexão DuckDB criada (db={db_path}, read_only={read_only})")
    except Exception as e:
        logger.error(f"Erro ao criar conexão DuckDB (db={db_path}): {e}")
        raise

    return getattr(_thread_local, connection_key)


@contextmanager
def get_connection(read_only: bool = True) -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """
    Context manager para conexões DuckDB.

    read_only=True  → cnpj.duckdb (Receita Federal)
    read_only=False → app.duckdb  (dados de aplicação)
    """
    if not read_only:
        with _app_write_lock:
            conn = _get_connection(read_only=False)
            try:
                yield conn
            except Exception as e:
                logger.error(f"Erro na query DuckDB (app.duckdb): {e}")
                try:
                    conn.close()
                except Exception:
                    pass
                try:
                    delattr(_thread_local, 'conn_rw')
                except AttributeError:
                    pass
                raise
    else:
        conn = _get_connection(read_only=True)
        try:
            yield conn
        except Exception as e:
            logger.error(f"Erro na query DuckDB (cnpj.duckdb): {e}")
            try:
                conn.close()
            except Exception:
                pass
            try:
                delattr(_thread_local, 'conn_ro')
            except AttributeError:
                pass
            raise


def close_all_connections():
    """Fecha todas as conexões thread-local."""
    for key in ('conn_ro', 'conn_rw'):
        conn = getattr(_thread_local, key, None)
        if conn:
            try:
                conn.close()
            except Exception:
                pass
        try:
            delattr(_thread_local, key)
        except AttributeError:
            pass
    logger.info("Todas as conexões DuckDB foram fechadas")


def test_connection() -> bool:
    """Testa se a conexão read-only está funcionando."""
    try:
        with get_connection(read_only=True) as conn:
            result = conn.execute("SELECT 1 as test").fetchone()
            return result[0] == 1
    except Exception as e:
        logger.error(f"Teste de conexão falhou: {e}")
        return False


def healthcheck() -> dict:
    """Retorna status de saúde do banco de dados."""
    try:
        with get_connection(read_only=True) as conn:
            conn.execute("SELECT 1")
            count = conn.execute("SELECT COUNT(*) FROM cnpj_empresas").fetchone()[0]
            return {
                "status": "healthy",
                "database": CNPJ_DB_PATH,
                "total_empresas": int(count),
                "read_only": True,
            }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
        }
