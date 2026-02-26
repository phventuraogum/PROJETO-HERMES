"""
Serviço de Cache usando Redis
Cacheia resultados de queries para melhorar performance
"""
import json
import hashlib
from typing import Optional, Any
from redis import Redis
import logging
from datetime import timedelta

from config import settings

logger = logging.getLogger(__name__)


class CacheService:
    """Serviço de cache para queries e resultados"""
    
    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or settings.REDIS_URL
        self.enabled = settings.CACHE_ENABLED
        self.default_ttl = settings.CACHE_TTL_SECONDS
        
        self.redis_client = None
        if self.enabled:
            try:
                self.redis_client = Redis.from_url(self.redis_url, decode_responses=True)
                # Testa conexão
                self.redis_client.ping()
                logger.info("Cache Redis habilitado")
            except Exception as e:
                logger.warning(f"Redis não disponível para cache: {e}")
                self.enabled = False
                self.redis_client = None
    
    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Gera chave de cache baseada em parâmetros"""
        # Cria hash dos parâmetros
        key_data = {
            "args": args,
            "kwargs": kwargs
        }
        key_str = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.md5(key_str.encode()).hexdigest()
        return f"hermes:cache:{prefix}:{key_hash}"
    
    def get(self, prefix: str, *args, **kwargs) -> Optional[Any]:
        """
        Obtém valor do cache.
        
        Args:
            prefix: Prefixo da chave (ex: "prospeccao", "empresa")
            *args, **kwargs: Parâmetros para gerar a chave
        
        Returns:
            Valor em cache ou None se não encontrado
        """
        if not self.enabled or not self.redis_client:
            return None
        
        try:
            key = self._generate_key(prefix, *args, **kwargs)
            cached = self.redis_client.get(key)
            
            if cached:
                logger.debug(f"Cache HIT: {prefix}")
                return json.loads(cached)
            
            logger.debug(f"Cache MISS: {prefix}")
            return None
            
        except Exception as e:
            logger.error(f"Erro ao obter cache: {e}")
            return None
    
    def set(self, prefix: str, value: Any, ttl: Optional[int] = None, *args, **kwargs) -> bool:
        """
        Armazena valor no cache.
        
        Args:
            prefix: Prefixo da chave
            value: Valor a ser cacheado (deve ser serializável em JSON)
            ttl: Time to live em segundos (None = usar default)
            *args, **kwargs: Parâmetros para gerar a chave
        
        Returns:
            True se armazenado com sucesso
        """
        if not self.enabled or not self.redis_client:
            return False
        
        try:
            key = self._generate_key(prefix, *args, **kwargs)
            ttl = ttl or self.default_ttl
            
            # Serializa valor
            value_str = json.dumps(value, default=str)
            
            # Armazena no Redis
            self.redis_client.setex(key, ttl, value_str)
            logger.debug(f"Cache SET: {prefix} (TTL: {ttl}s)")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao armazenar cache: {e}")
            return False
    
    def delete(self, prefix: str, *args, **kwargs) -> bool:
        """
        Remove valor do cache.
        
        Args:
            prefix: Prefixo da chave
            *args, **kwargs: Parâmetros para gerar a chave
        
        Returns:
            True se removido com sucesso
        """
        if not self.enabled or not self.redis_client:
            return False
        
        try:
            key = self._generate_key(prefix, *args, **kwargs)
            deleted = self.redis_client.delete(key)
            logger.debug(f"Cache DELETE: {prefix}")
            return deleted > 0
            
        except Exception as e:
            logger.error(f"Erro ao deletar cache: {e}")
            return False
    
    def delete_pattern(self, pattern: str) -> int:
        """
        Remove todas as chaves que correspondem ao padrão.
        
        Args:
            pattern: Padrão Redis (ex: "hermes:cache:prospeccao:*")
        
        Returns:
            Número de chaves removidas
        """
        if not self.enabled or not self.redis_client:
            return 0
        
        try:
            keys = list(self.redis_client.scan_iter(match=pattern))
            if keys:
                deleted = self.redis_client.delete(*keys)
                logger.info(f"Cache DELETE PATTERN: {pattern} ({deleted} chaves)")
                return deleted
            return 0
            
        except Exception as e:
            logger.error(f"Erro ao deletar padrão: {e}")
            return 0
    
    def clear_all(self) -> int:
        """Remove todo o cache do Hermes"""
        return self.delete_pattern("hermes:cache:*")
    
    def get_stats(self) -> dict:
        """Retorna estatísticas do cache"""
        if not self.enabled or not self.redis_client:
            return {"enabled": False}
        
        try:
            # Conta chaves de cache
            keys = list(self.redis_client.scan_iter(match="hermes:cache:*"))
            return {
                "enabled": True,
                "total_keys": len(keys),
                "redis_url": self.redis_url
            }
        except Exception as e:
            return {
                "enabled": True,
                "error": str(e)
            }


# Instância global
cache_service = CacheService()
