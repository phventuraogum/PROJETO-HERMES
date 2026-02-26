"""
Middleware de API Key para Autenticação
Permite autenticação via API Key para integrações
"""
from fastapi import Security, HTTPException, Header
from fastapi.security import APIKeyHeader
from typing import Optional
import os

from config import settings

# Header para API Key
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def get_api_key(api_key: Optional[str] = Security(api_key_header)) -> str:
    """
    Valida API Key do header.
    
    Uso:
        @app.get("/endpoint")
        async def endpoint(api_key: str = Depends(get_api_key)):
            ...
    """
    # API Key esperada (configurar no .env)
    expected_key = os.getenv("HERMES_API_KEY")
    
    # Se não tem API Key configurada, permite acesso (dev)
    if not expected_key:
        if settings.is_development:
            return "dev-key"
        raise HTTPException(
            status_code=500,
            detail="API Key não configurada no servidor"
        )
    
    # Valida API Key
    if not api_key or api_key != expected_key:
        raise HTTPException(
            status_code=401,
            detail="API Key inválida ou ausente"
        )
    
    return api_key


def optional_api_key(api_key: Optional[str] = Security(api_key_header)) -> Optional[str]:
    """
    API Key opcional (não falha se não fornecido).
    Útil para endpoints que funcionam com ou sem autenticação.
    """
    expected_key = os.getenv("HERMES_API_KEY")
    
    if not expected_key:
        return None
    
    if api_key and api_key == expected_key:
        return api_key
    
    return None
