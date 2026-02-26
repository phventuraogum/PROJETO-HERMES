"""
Health Check e Status da API
"""
from fastapi import APIRouter, Depends
from datetime import datetime
from typing import Dict, Any

from api.db_pool import healthcheck as db_healthcheck
from api.cache_service import cache_service
from config import settings
from middleware.auth import require_auth

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
def health_check() -> Dict[str, Any]:
    """
    Health check básico da API.
    Usado por n8n, Kommo e outros para verificar se API está online.
    """
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }


@router.get("/detailed")
def detailed_health(_user: dict = Depends(require_auth)) -> Dict[str, Any]:
    """
    Health check detalhado com status de todos os serviços.
    """
    db_status = db_healthcheck()
    cache_stats = cache_service.get_stats()
    
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "services": {
            "database": {
                "status": db_status.get("status", "unknown"),
                "total_empresas": db_status.get("total_empresas", 0)
            },
            "cache": {
                "enabled": cache_stats.get("enabled", False),
                "total_keys": cache_stats.get("total_keys", 0)
            },
            "environment": settings.ENVIRONMENT
        }
    }
