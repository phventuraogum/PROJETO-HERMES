"""
Routers da API Hermes
Estrutura modular para facilitar integrações
"""
from .prospeccao import router as prospeccao_router
from .empresas import router as empresas_router
from .webhooks import router as webhooks_router
from .integrations import router as integrations_router
from .health import router as health_router
from .sdr import router as sdr_router

__all__ = [
    "prospeccao_router",
    "empresas_router",
    "webhooks_router",
    "integrations_router",
    "health_router",
    "sdr_router",
]
