"""
Rate Limiting para API
Protege contra abuso e DDoS usando Redis
"""
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import redis
import time
import logging
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware de rate limiting usando Redis.
    
    Limita requisições por IP:
    - Por minuto (sliding window)
    - Por hora (opcional)
    """
    
    def __init__(self, app, redis_url: Optional[str] = None):
        super().__init__(app)
        self.enabled = settings.RATE_LIMIT_ENABLED
        self.limit_per_minute = settings.RATE_LIMIT_PER_MINUTE
        self.redis_url = redis_url or settings.REDIS_URL
        
        # Conecta ao Redis
        self.redis_client = None
        if self.enabled:
            try:
                self.redis_client = redis.from_url(self.redis_url)
                # Testa conexão
                self.redis_client.ping()
                logger.info("Rate limiting habilitado com Redis")
            except Exception as e:
                logger.warning(f"Redis não disponível para rate limiting: {e}")
                logger.warning("Rate limiting desabilitado")
                self.enabled = False
    
    def get_client_ip(self, request: Request) -> str:
        """Obtém IP do cliente (considera proxies)"""
        # Verifica headers de proxy
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            # Pega o primeiro IP (cliente original)
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fallback para IP direto
        if request.client:
            return request.client.host
        
        return "unknown"
    
    def check_rate_limit(self, ip: str) -> tuple[bool, int, int]:
        """
        Verifica se IP excedeu o limite.
        
        Returns:
            (allowed, remaining, reset_after)
        """
        if not self.enabled or not self.redis_client:
            return True, self.limit_per_minute, 60
        
        try:
            # Chave Redis: rate_limit:{ip}:{minute}
            current_minute = int(time.time() / 60)
            key = f"rate_limit:{ip}:{current_minute}"
            
            # Incrementa contador
            count = self.redis_client.incr(key)
            
            # Define TTL (expira em 2 minutos)
            if count == 1:
                self.redis_client.expire(key, 120)
            
            # Verifica limite
            remaining = max(0, self.limit_per_minute - count)
            reset_after = 60 - (int(time.time()) % 60)
            
            allowed = count <= self.limit_per_minute
            
            return allowed, remaining, reset_after
            
        except Exception as e:
            logger.error(f"Erro ao verificar rate limit: {e}")
            # Em caso de erro, permite (fail open)
            return True, self.limit_per_minute, 60
    
    async def dispatch(self, request: Request, call_next):
        """Processa requisição com rate limiting"""
        
        # Pula rate limiting para healthcheck
        if request.url.path in ["/health", "/docs", "/openapi.json"]:
            return await call_next(request)
        
        # Obtém IP
        ip = self.get_client_ip(request)
        
        # Verifica rate limit
        allowed, remaining, reset_after = self.check_rate_limit(ip)
        
        # Adiciona headers de rate limit
        response = await call_next(request) if allowed else None
        
        if not allowed:
            # Rate limit excedido
            logger.warning(f"Rate limit excedido para IP: {ip}")
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit excedido",
                    "message": f"Máximo de {self.limit_per_minute} requisições por minuto",
                    "retry_after": reset_after
                },
                headers={
                    "X-RateLimit-Limit": str(self.limit_per_minute),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + reset_after),
                    "Retry-After": str(reset_after)
                }
            )
        
        # Adiciona headers de rate limit na resposta
        if response:
            response.headers["X-RateLimit-Limit"] = str(self.limit_per_minute)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(int(time.time()) + reset_after)
        
        return response


def setup_rate_limiting(app):
    """Configura rate limiting no app FastAPI"""
    if settings.RATE_LIMIT_ENABLED:
        app.add_middleware(RateLimitMiddleware)
        logger.info("Rate limiting configurado")
