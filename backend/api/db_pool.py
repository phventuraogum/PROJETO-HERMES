"""
Pool de Conexões DuckDB para Produção
Gerencia conexões de forma thread-safe e eficiente
"""
import os
import duckdb
from contextlib import contextmanager
from threading import local
from typing import Generator
import logging

logger = logging.getLogger(__name__)

# Thread-local storage para conexões
_thread_local = local()

# Configuração do DuckDB
DB_PATH = os.getenv("HERMES_DUCKDB_PATH", r"G:\icp_radar\dados_receita\cnpj.duckdb")

# Configurações de conexão otimizadas
DUCKDB_CONFIG = {
    'threads': 1,  # Thread-safe (1 thread por conexão)
    'max_memory': os.getenv('DUCKDB_MAX_MEMORY', '2GB'),
    'temp_directory': os.getenv('DUCKDB_TEMP_DIR', '/tmp'),
}


def _get_connection(read_only: bool = True) -> duckdb.DuckDBPyConnection:
    """
    Obtém ou cria uma conexão DuckDB thread-local.
    Reutiliza conexões na mesma thread para melhor performance.
    """
    connection_key = f'connection_{read_only}'
    
    existing = getattr(_thread_local, connection_key, None)
    if existing is not None:
        # Verifica se a conexão ainda está viva (foi fechada explicitamente?)
        try:
            existing.execute("SELECT 1")
            return existing
        except Exception:
            # Conexão fechada ou corrompida — recria
            try:
                existing.close()
            except Exception:
                pass
            delattr(_thread_local, connection_key)

    try:
        conn = duckdb.connect(
            DB_PATH,
            read_only=read_only,
            config=DUCKDB_CONFIG
        )
        setattr(_thread_local, connection_key, conn)
        logger.debug(f"Nova conexão DuckDB criada (read_only={read_only})")
    except Exception as e:
        logger.error(f"Erro ao criar conexão DuckDB: {e}")
        raise

    return getattr(_thread_local, connection_key)


@contextmanager
def get_connection(read_only: bool = True) -> Generator[duckdb.DuckDBPyConnection, None, None]:
    """
    Context manager para conexões DuckDB.
    
    Uso:
        with get_connection(read_only=True) as conn:
            result = conn.execute("SELECT * FROM empresas LIMIT 10").fetchdf()
    
    Args:
        read_only: Se True, abre conexão somente leitura (padrão)
    
    Yields:
        Conexão DuckDB thread-safe
    """
    conn = _get_connection(read_only)
    
    try:
        yield conn
    except Exception as e:
        logger.error(f"Erro na query DuckDB: {e}")
        # Em caso de erro, fecha a conexão para forçar recriação
        if hasattr(_thread_local, f'connection_{read_only}'):
            try:
                conn.close()
            except:
                pass
            delattr(_thread_local, f'connection_{read_only}')
        raise


def close_all_connections():
    """
    Fecha todas as conexões thread-local.
    Útil para cleanup ou testes.
    """
    for attr_name in dir(_thread_local):
        if attr_name.startswith('connection_'):
            conn = getattr(_thread_local, attr_name, None)
            if conn:
                try:
                    conn.close()
                except:
                    pass
            delattr(_thread_local, attr_name, None)
    
    logger.info("Todas as conexões DuckDB foram fechadas")


def test_connection() -> bool:
    """
    Testa se a conexão está funcionando.
    Retorna True se OK, False caso contrário.
    """
    try:
        with get_connection(read_only=True) as conn:
            result = conn.execute("SELECT 1 as test").fetchone()
            return result[0] == 1
    except Exception as e:
        logger.error(f"Teste de conexão falhou: {e}")
        return False


# Healthcheck helper
def healthcheck() -> dict:
    """
    Retorna status de saúde do banco de dados.
    """
    try:
        with get_connection(read_only=True) as conn:
            # Testa conexão
            conn.execute("SELECT 1")
            
            # Conta empresas (query simples para testar performance)
            count = conn.execute("SELECT COUNT(*) FROM cnpj_empresas").fetchone()[0]
            
            return {
                "status": "healthy",
                "database": DB_PATH,
                "total_empresas": int(count),
                "read_only": True
            }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }
