"""
Webhooks para Integrações (Redis-backed)
Permite receber eventos e notificações de sistemas externos.
Endpoints de gerenciamento requerem autenticação.
"""
import os
import json
import httpx
import asyncio
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Header, BackgroundTasks, Depends
from pydantic import BaseModel
from redis import Redis

from middleware.auth import require_auth

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

def get_redis():
    return Redis.from_url(REDIS_URL, decode_responses=True)

class WebhookSubscription(BaseModel):
    url: str
    description: Optional[str] = None

class WebhookEvent(BaseModel):
    event: str
    data: Dict[str, Any]

# --- Helpers ---

async def _dispatch_to_url(url: str, payload: dict):
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            await client.post(url, json=payload)
        except Exception as e:
            print(f"[WEBHOOK] Falha ao enviar para {url}: {e}")

def _dispatch_background(event: str, data: dict):
    """
    Lê assinantes do Redis e dispara eventos em background.
    """
    try:
        r = get_redis()
        # Pega todas as URLs do set 'hermes:webhooks'
        urls = r.smembers("hermes:webhooks")
        
        payload = {
            "event": event,
            "data": data,
            "timestamp": "TODO_ISO_FORMAT"
        }
        
        # Dispara assincronamente (fire and forget)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        tasks = [_dispatch_to_url(url, payload) for url in urls]
        if tasks:
            loop.run_until_complete(asyncio.gather(*tasks))
        loop.close()
        
    except Exception as e:
        print(f"[WEBHOOK] Erro no dispatch: {e}")

# --- Endpoints ---

@router.post("/register")
def register_webhook(
    sub: WebhookSubscription,
    _user: dict = Depends(require_auth),
    x_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Registra uma nova URL para receber eventos."""
    if WEBHOOK_SECRET and x_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    r = get_redis()
    r.sadd("hermes:webhooks", sub.url)
    return {"status": "registered", "url": sub.url}

@router.delete("/remove")
def remove_webhook(
    sub: WebhookSubscription,
    _user: dict = Depends(require_auth),
    x_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Remove uma URL de webhook."""
    if WEBHOOK_SECRET and x_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    r = get_redis()
    r.srem("hermes:webhooks", sub.url)
    return {"status": "removed", "url": sub.url}

@router.get("/list")
def list_webhooks(
    _user: dict = Depends(require_auth),
    x_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """Lista webhooks cadastrados."""
    if WEBHOOK_SECRET and x_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    r = get_redis()
    urls = r.smembers("hermes:webhooks")
    return {"urls": list(urls)}

@router.post("/test-dispatch")
async def test_dispatch(
    event: WebhookEvent,
    background_tasks: BackgroundTasks,
    _user: dict = Depends(require_auth),
    x_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
):
    """
    Força o disparo de um evento para todas as URLs cadastradas.
    Útil para testar integração com n8n.
    """
    if WEBHOOK_SECRET and x_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Usando BackgroundTasks do FastAPI para não bloquear
    # Nota: _dispatch_background cria seu proprio loop, o que pode ser conflitante.
    # Idealmente, faríamos direto aqui se já estivessemos async.
    
    r = get_redis()
    urls = r.smembers("hermes:webhooks")
    
    for url in urls:
        background_tasks.add_task(_dispatch_to_url, url, event.dict())

    return {"status": "dispatching", "target_count": len(urls)}
