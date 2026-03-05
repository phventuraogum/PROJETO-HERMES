"""
Middleware de autenticação para produção.
Valida tokens JWT do Supabase:
  1. Primeiro tenta validação local via JWT_SECRET (rápido, sem rede)
  2. Fallback para validação via Supabase HTTP (mais lento, mais confiável)
"""
from fastapi import HTTPException, Depends, Header
from typing import Optional
import logging
import hashlib
import hmac

logger = logging.getLogger(__name__)

# Import condicional do PyJWT (não obrigatório, mas preferido)
try:
    import jwt as pyjwt  # PyJWT
    PYJWT_AVAILABLE = True
except ImportError:
    PYJWT_AVAILABLE = False
    logger.warning("PyJWT não instalado — usando validação via Supabase HTTP. Instale: pip install PyJWT")


def _validate_jwt_local(token: str, secret: str, issuer: str, audience: str) -> Optional[dict]:
    """
    Valida token JWT localmente usando o JWT_SECRET do Supabase.
    Muito mais rápido que validar via HTTP (sem round-trip de rede).
    """
    if not PYJWT_AVAILABLE or not secret:
        return None
    try:
        decode_opts = {"verify_exp": True}
        if not issuer:
            decode_opts["verify_iss"] = False

        payload = pyjwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=audience,
            issuer=issuer or None,
            options=decode_opts,
        )
        return {
            "id": payload.get("sub"),
            "email": payload.get("email"),
            "role": payload.get("role", "authenticated"),
            "raw": payload,
        }
    except pyjwt.ExpiredSignatureError:
        logger.warning("Token JWT expirado")
        return None
    except pyjwt.InvalidTokenError as e:
        logger.warning(f"Token JWT inválido: {e}")
        return None


def _validate_via_supabase_http(token: str, supabase_url: str, anon_key: str) -> Optional[dict]:
    """
    Valida token consultando a API do Supabase.
    Usado como fallback quando a validação local não é possível.
    Usa httpx síncrono para não bloquear o event loop quando chamado em contexto sync.
    """
    try:
        import httpx
        response = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=10,
        )
        if response.status_code == 200:
            user_data = response.json()
            return {
                "id": user_data.get("id"),
                "email": user_data.get("email"),
                "role": "authenticated",
                "raw": user_data,
            }
        logger.warning("Supabase rejeitou token: HTTP %d", response.status_code)
        return None
    except Exception as e:
        logger.error("Erro ao validar token via Supabase: %s", e)
        return None


async def verify_token_async(token: str) -> Optional[dict]:
    """
    Verifica um token JWT (versão async).
    Tenta validação local primeiro, depois fallback para HTTP.
    """
    from config import settings
    import asyncio

    if settings.SUPABASE_JWT_SECRET and PYJWT_AVAILABLE:
        issuer = settings.SUPABASE_JWT_ISSUER
        if not issuer and settings.SUPABASE_URL:
            issuer = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"
        user = _validate_jwt_local(
            token,
            secret=settings.SUPABASE_JWT_SECRET,
            issuer=issuer,
            audience=settings.SUPABASE_JWT_AUDIENCE,
        )
        if user:
            return user

    if settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
        return await asyncio.to_thread(
            _validate_via_supabase_http, token, settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY
        )

    logger.error("Nenhum método de validação configurado (JWT_SECRET e SUPABASE_URL ausentes)")
    return None


def verify_token(token: str) -> Optional[dict]:
    """
    Verifica um token JWT (versão sync — para uso em contextos não-async).
    Tenta validação local primeiro, depois fallback para HTTP.
    """
    from config import settings

    # Tenta validação local (rápida)
    if settings.SUPABASE_JWT_SECRET and PYJWT_AVAILABLE:
        issuer = settings.SUPABASE_JWT_ISSUER
        if not issuer and settings.SUPABASE_URL:
            issuer = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"
        user = _validate_jwt_local(
            token,
            secret=settings.SUPABASE_JWT_SECRET,
            issuer=issuer,
            audience=settings.SUPABASE_JWT_AUDIENCE,
        )
        if user:
            return user

    # Fallback: valida via HTTP do Supabase
    if settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
        return _validate_via_supabase_http(token, settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

    logger.error("Nenhum método de validação configurado (JWT_SECRET e SUPABASE_URL ausentes)")
    return None


async def require_auth(
    authorization: Optional[str] = Header(None, alias="Authorization")
) -> dict:
    """
    Dependency FastAPI para endpoints que exigem autenticação.

    Uso:
        @app.post("/endpoint-protegido")
        async def meu_endpoint(user: dict = Depends(require_auth)):
            ...
    """
    from config import settings

    # Modo desenvolvimento: auth desabilitada (nunca em produção)
    if not settings.HERMES_AUTH_REQUIRED:
        return {"id": "anonymous", "email": None, "role": "anonymous"}

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Autenticação obrigatória. Envie o header: Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token deve estar no formato: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Token vazio",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await verify_token_async(token)

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def optional_auth(
    authorization: Optional[str] = Header(None, alias="Authorization")
) -> Optional[dict]:
    """
    Dependency para endpoints com autenticação opcional.
    Retorna None se não autenticado, sem retornar erro.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    return verify_token(token)


def validate_asaas_webhook_token(token: str, expected: str) -> bool:
    """
    Valida o token de autenticação enviado pelo Asaas nos webhooks.
    Usa comparação segura (timing-safe) para evitar timing attacks.
    """
    if not token or not expected:
        return False
    return hmac.compare_digest(token.strip(), expected.strip())
