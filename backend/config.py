"""
Configurações centralizadas do Hermes.
Usa pydantic-settings para validação e type safety.
"""
import os
from typing import Optional
try:
    from pydantic_settings import BaseSettings
except ImportError:
    try:
        from pydantic import BaseSettings
    except ImportError:
        class BaseSettings:
            def __init__(self, **kwargs):
                import os
                for key, value in kwargs.items():
                    setattr(self, key, os.getenv(key, value))
from pydantic import Field
try:
    from pydantic import field_validator
except ImportError:
    from pydantic import validator as field_validator


class Settings(BaseSettings):
    """Configurações do sistema Hermes."""

    # ============================================================
    # DATABASE
    # ============================================================
    HERMES_DUCKDB_PATH: str = Field(
        default="/data/cnpj.duckdb",
        description="Caminho do arquivo DuckDB (default para Docker; override via env para dev local)"
    )

    DUCKDB_MAX_MEMORY: str = Field(
        default="2GB",
        description="Memória máxima para DuckDB"
    )

    DUCKDB_TEMP_DIR: str = Field(
        default="/tmp",
        description="Diretório temporário do DuckDB"
    )

    # ============================================================
    # REDIS
    # ============================================================
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="URL de conexão do Redis"
    )

    # ============================================================
    # AI (OpenAI / OpenRouter)
    # ============================================================
    OPENAI_API_KEY: Optional[str] = Field(
        default=None,
        description="Chave da API OpenAI (prioridade sobre OpenRouter)"
    )

    OPENROUTER_API_KEY: Optional[str] = Field(
        default=None,
        description="Chave da API OpenRouter (fallback se OPENAI_API_KEY ausente)"
    )

    # ============================================================
    # AUTHENTICATION
    # ============================================================
    HERMES_AUTH_REQUIRED: bool = Field(
        default=False,
        description="Se True, requer autenticação em todos os endpoints. OBRIGATÓRIO True em produção."
    )

    SUPABASE_URL: str = Field(
        default="",
        description="URL do projeto Supabase (ex: https://abc.supabase.co)"
    )

    SUPABASE_ANON_KEY: str = Field(
        default="",
        description="Chave anônima (pública) do Supabase"
    )

    SUPABASE_SERVICE_ROLE_KEY: str = Field(
        default="",
        description="Chave de serviço do Supabase (acesso admin total — nunca expor ao cliente)"
    )

    # JWT para validação local (sem round-trip de rede) — mais rápido
    SUPABASE_JWT_SECRET: str = Field(
        default="",
        description="JWT Secret do Supabase — usado para validar tokens localmente sem HTTP"
    )

    SUPABASE_JWT_ISSUER: str = Field(
        default="",
        description="Issuer do JWT Supabase (ex: https://abc.supabase.co/auth/v1)"
    )

    SUPABASE_JWT_AUDIENCE: str = Field(
        default="authenticated",
        description="Audience do JWT Supabase"
    )

    # Senha do Redis (obrigatória em produção)
    REDIS_PASSWORD: str = Field(
        default="",
        description="Senha do Redis. Vazio = sem senha (apenas em dev local)"
    )

    # Token para validar webhooks do Asaas
    ASAAS_WEBHOOK_TOKEN: str = Field(
        default="",
        description="Token secreto para autenticar webhooks recebidos do Asaas"
    )

    ASAAS_API_KEY: str = Field(
        default="",
        description="Chave da API Asaas (sandbox ou producao)"
    )

    ASAAS_SANDBOX: bool = Field(
        default=True,
        description="Se True, usa sandbox do Asaas (testes). False para producao."
    )

    # ============================================================
    # PLOOMES CRM
    # ============================================================
    PLOOMES_API_KEY: str = Field(
        default="",
        description="Chave de API do Ploomes (User-Key). Fallback se nao tiver na tabela organizations."
    )

    PLOOMES_FUNNEL_ID: Optional[int] = Field(
        default=None,
        description="ID do funil padrao no Ploomes para novos deals"
    )

    # ============================================================
    # N8N SDR INTEGRATION
    # ============================================================
    N8N_SDR_API_KEY: str = Field(
        default="",
        description="Chave de API para autenticar chamadas do n8n (alternativa ao JWT)"
    )

    # ============================================================
    # CORS
    # ============================================================
    CORS_ORIGINS: str = Field(
        default="http://localhost:8080,http://localhost:5173,http://localhost:3000",
        description="Origens permitidas para CORS (separadas por vírgula)"
    )

    # ============================================================
    # RATE LIMITING
    # ============================================================
    RATE_LIMIT_ENABLED: bool = Field(
        default=True,
        description="Habilita rate limiting"
    )

    RATE_LIMIT_PER_MINUTE: int = Field(
        default=60,
        description="Requisições permitidas por minuto por IP"
    )

    # ============================================================
    # ENVIRONMENT
    # ============================================================
    ENVIRONMENT: str = Field(
        default="development",
        description="Ambiente: development, staging, production"
    )

    LOG_LEVEL: str = Field(
        default="INFO",
        description="Nível de log: DEBUG, INFO, WARNING, ERROR"
    )

    # ============================================================
    # API
    # ============================================================
    API_HOST: str = Field(
        default="0.0.0.0",
        description="Host da API"
    )

    API_PORT: int = Field(
        default=8000,
        description="Porta da API"
    )

    API_WORKERS: int = Field(
        default=4,
        description="Número de workers do uvicorn"
    )

    # ============================================================
    # QUERY LIMITS
    # ============================================================
    MAX_QUERY_LIMIT: int = Field(
        default=1000,
        description="Limite máximo de resultados por query"
    )

    DEFAULT_QUERY_LIMIT: int = Field(
        default=200,
        description="Limite padrão de resultados"
    )

    # ============================================================
    # CACHE
    # ============================================================
    CACHE_ENABLED: bool = Field(
        default=True,
        description="Habilita cache de respostas"
    )

    CACHE_TTL_SECONDS: int = Field(
        default=300,
        description="TTL do cache em segundos (5 minutos)"
    )

    # ============================================================
    # VALIDATORS
    # ============================================================
    @field_validator('ENVIRONMENT')
    @classmethod
    def validate_environment(cls, v):
        allowed = ['development', 'staging', 'production']
        if v not in allowed:
            raise ValueError(f"ENVIRONMENT deve ser um de: {allowed}")
        return v

    @field_validator('LOG_LEVEL')
    @classmethod
    def validate_log_level(cls, v):
        allowed = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
        if v.upper() not in allowed:
            raise ValueError(f"LOG_LEVEL deve ser um de: {allowed}")
        return v.upper()

    # ============================================================
    # PROPERTIES
    # ============================================================
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == 'production'

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == 'development'

    @property
    def cors_origins_list(self) -> list:
        if isinstance(self.CORS_ORIGINS, str):
            return [o.strip() for o in self.CORS_ORIGINS.split(',') if o.strip()]
        elif isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        return []

    @property
    def ai_api_key(self) -> Optional[str]:
        return self.OPENAI_API_KEY or self.OPENROUTER_API_KEY

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": True, "extra": "ignore"}


settings = Settings()


def validate_production_settings():
    """Valida se as configurações estão corretas para produção."""
    errors = []
    if settings.is_production:
        if not settings.HERMES_AUTH_REQUIRED:
            errors.append("HERMES_AUTH_REQUIRED deve ser True em produção")
        if not settings.SUPABASE_URL:
            errors.append("SUPABASE_URL é obrigatório em produção")
        if not settings.SUPABASE_SERVICE_ROLE_KEY:
            errors.append("SUPABASE_SERVICE_ROLE_KEY é obrigatório em produção")
        if not settings.SUPABASE_JWT_SECRET:
            errors.append("SUPABASE_JWT_SECRET é obrigatório em produção (validação local de tokens)")
        if not settings.SUPABASE_ANON_KEY:
            errors.append("SUPABASE_ANON_KEY é obrigatório em produção (fallback de validação)")
        if not settings.REDIS_PASSWORD:
            errors.append("REDIS_PASSWORD é obrigatório em produção (Redis sem senha é inseguro)")
        if not settings.CORS_ORIGINS or "localhost" in settings.CORS_ORIGINS:
            errors.append("CORS_ORIGINS deve apontar para domínio de produção (sem localhost)")
        if not settings.ASAAS_WEBHOOK_TOKEN:
            errors.append("ASAAS_WEBHOOK_TOKEN é obrigatório em produção (valida webhooks)")
    if errors:
        raise ValueError("Erros de configuração para produção:\n" + "\n".join(f"  - {e}" for e in errors))
    return True
