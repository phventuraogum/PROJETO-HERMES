"""
Serviço de integração com a API Assertiva v3.
Autenticação OAuth2 (client_credentials) com cache de token.
Consulta de CNPJ para prospecção e enriquecimento de leads.
"""
import logging
import time
import asyncio
from typing import Optional, Dict, Any

import httpx

logger = logging.getLogger(__name__)

ASSERTIVA_TOKEN_URL = "https://api.assertivasolucoes.com.br/oauth2/v3/token"
ASSERTIVA_CNPJ_URL = "https://api.assertivasolucoes.com.br/localize/v3/cnpj"


class AssertivaCNPJService:
    """
    Integração com Assertiva Localize para consulta de pessoa jurídica por CNPJ.
    Gerencia token OAuth2 com renovação automática (TTL 60s).
    """

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0

    # ------------------------------------------------------------------
    # Autenticação
    # ------------------------------------------------------------------

    async def _get_token(self) -> str:
        """Retorna token válido, renovando se necessário."""
        now = time.monotonic()
        # Renova com 5s de margem antes do vencimento
        if self._token and now < self._token_expires_at - 5:
            return self._token

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                ASSERTIVA_TOKEN_URL,
                data={"grant_type": "client_credentials"},
                auth=(self.client_id, self.client_secret),
            )

        if resp.status_code != 200:
            logger.error(
                "Assertiva auth falhou: %s — %s", resp.status_code, resp.text[:300]
            )
            raise RuntimeError(
                f"Falha ao autenticar na Assertiva: HTTP {resp.status_code}"
            )

        data = resp.json()
        self._token = data["access_token"]
        expires_in = int(data.get("expires_in", 60))
        self._token_expires_at = now + expires_in
        logger.debug("Token Assertiva renovado, expira em %ds", expires_in)
        return self._token

    # ------------------------------------------------------------------
    # Consulta CNPJ
    # ------------------------------------------------------------------

    async def consultar_cnpj(
        self,
        cnpj: str,
        id_finalidade: int = 5,
    ) -> Dict[str, Any]:
        """
        Consulta dados cadastrais de um CNPJ na Assertiva Localize.

        Args:
            cnpj: CNPJ com ou sem formatação.
            id_finalidade: Finalidade LGPD (1=Confirmação identidade,
                2=Ciclo crédito, 4=Execução contrato, 5=Legítimo interesse).

        Retorna dict normalizado ou lança RuntimeError em caso de falha.
        """
        cnpj_limpo = "".join(filter(str.isdigit, cnpj))
        if len(cnpj_limpo) != 14:
            raise ValueError(f"CNPJ inválido: '{cnpj}'")

        max_attempts = 4
        resp: Optional[httpx.Response] = None

        for attempt in range(1, max_attempts + 1):
            token = await self._get_token()
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    ASSERTIVA_CNPJ_URL,
                    params={"cnpj": cnpj_limpo, "idFinalidade": id_finalidade},
                    headers={"Authorization": f"Bearer {token}"},
                )

            if resp.status_code != 429:
                break

            if attempt >= max_attempts:
                break

            retry_after_raw = resp.headers.get("Retry-After", "").strip()
            try:
                retry_after = float(retry_after_raw) if retry_after_raw else 0.0
            except ValueError:
                retry_after = 0.0
            backoff = retry_after if retry_after > 0 else min(2 ** (attempt - 1), 8)
            logger.warning(
                "Assertiva rate limit (429) para CNPJ %s. Tentativa %s/%s. Aguardando %.1fs",
                cnpj_limpo,
                attempt,
                max_attempts,
                backoff,
            )
            await asyncio.sleep(backoff)

        if resp.status_code == 404:
            logger.info("CNPJ %s não encontrado na Assertiva", cnpj_limpo)
            return {"encontrado": False, "cnpj": cnpj_limpo}

        if resp.status_code == 429:
            logger.warning("Assertiva limitou requisições para CNPJ %s", cnpj_limpo)
            raise RuntimeError(
                "Limite temporário da Assertiva atingido (HTTP 429). "
                "Aguarde alguns segundos e tente novamente."
            )

        if resp.status_code != 200:
            logger.error(
                "Assertiva CNPJ %s falhou: %s — %s",
                cnpj_limpo,
                resp.status_code,
                resp.text[:300],
            )
            raise RuntimeError(
                f"Assertiva retornou HTTP {resp.status_code} para CNPJ {cnpj_limpo}"
            )

        raw = resp.json()
        return self._normalizar(cnpj_limpo, raw)

    # ------------------------------------------------------------------
    # Normalização da resposta
    # ------------------------------------------------------------------

    def _normalizar(self, cnpj: str, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Mapeia o payload bruto da Assertiva (estrutura cabecalho + resposta)
        para o schema interno do Hermes.
        """
        cabecalho = raw.get("cabecalho", {})
        resposta = raw.get("resposta", raw)  # fallback se vier sem envelope

        dados = resposta.get("dadosCadastrais", {})
        enderecos = resposta.get("enderecos", [])
        telefones_raw = resposta.get("telefones", {})
        emails_raw = resposta.get("emails", [])
        socios_raw = resposta.get("socios", [])

        def _nome_socio_assertiva(s: Dict[str, Any]) -> Any:
            if not isinstance(s, dict):
                return None
            for key in ("nome", "nomeSocio", "nomeCompleto", "razaoSocial", "nomeRazao", "razao_social"):
                val = s.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()
            nested = s.get("dados") or s.get("pessoa") or s.get("pessoaFisica") or s.get("socio")
            if isinstance(nested, dict):
                for key in ("nome", "nomeCompleto", "razaoSocial", "nomeSocio"):
                    val = nested.get(key)
                    if isinstance(val, str) and val.strip():
                        return val.strip()
            return s.get("nome")
        cnaes_sec = resposta.get("cnaesSecundarias", [])
        redes_sociais = resposta.get("redesSociais", [])

        # Telefones: fixos + móveis em lista plana
        telefones: list = []
        for t in telefones_raw.get("fixos", []):
            telefones.append({
                "numero": t.get("numero"),
                "tipo": "fixo",
                "whatsapp": t.get("aplicativos", {}).get("whatsAppBusiness", False),
                "nao_perturbe": t.get("naoPerturbe", False),
                "ultimo_contato": t.get("ultimoContato"),
            })
        for t in telefones_raw.get("moveis", []):
            telefones.append({
                "numero": t.get("numero"),
                "tipo": "movel",
                "whatsapp": (
                    t.get("aplicativos", {}).get("whatsApp", False)
                    or t.get("aplicativos", {}).get("whatsAppBusiness", False)
                ),
                "nao_perturbe": t.get("naoPerturbe", False),
                "ultimo_contato": t.get("ultimoContato"),
            })

        # Endereço principal
        endereco_principal = enderecos[0] if enderecos else {}

        normalizado: Dict[str, Any] = {
            "encontrado": True,
            "fonte": "assertiva",
            "protocolo": cabecalho.get("protocolo"),
            "cnpj": cnpj,
            "razao_social": dados.get("razaoSocial"),
            "nome_fantasia": dados.get("nomeFantasia"),
            "situacao": dados.get("situacaoCadastral"),
            "data_abertura": dados.get("dataAbertura"),
            "idade_empresa": dados.get("idadeEmpresa"),
            "porte": dados.get("porteEmpresa"),
            "natureza_juridica": dados.get("naturezaJuridica"),
            "site": dados.get("site"),
            "tem_google_meu_negocio": dados.get("temGoogleMeuNegocio", False),
            "cnae_principal": {
                "codigo": str(dados.get("cnae", "")),
                "descricao": dados.get("cnaeDescricao"),
                "grupo": dados.get("cnaeGrupo"),
                "subgrupo": dados.get("cnaeSubgrupo"),
            },
            "cnaes_secundarios": [
                {
                    "codigo": c.get("cnae"),
                    "descricao": c.get("descricao"),
                    "grupo": c.get("grupo"),
                }
                for c in cnaes_sec
            ],
            "funcionarios": dados.get("quantidadeFuncionarios"),
            "endereco": {
                "logradouro": endereco_principal.get("logradouro"),
                "numero": endereco_principal.get("numero"),
                "complemento": endereco_principal.get("complemento"),
                "bairro": endereco_principal.get("bairro"),
                "municipio": endereco_principal.get("municipio"),
                "uf": endereco_principal.get("uf"),
                "cep": endereco_principal.get("cep"),
            },
            "telefones": telefones,
            "emails": [
                {
                    "email": e.get("email") if isinstance(e, dict) else e,
                    "tipo": e.get("tipo") if isinstance(e, dict) else None,
                }
                for e in emails_raw
            ],
            "socios": [
                {
                    "nome": _nome_socio_assertiva(s) if isinstance(s, dict) else None,
                    "cpf_cnpj": s.get("cpfCnpj") if isinstance(s, dict) else None,
                    "cargo": (s.get("cargo") or s.get("qualificacao")) if isinstance(s, dict) else None,
                    "data_entrada": s.get("dataEntrada") if isinstance(s, dict) else None,
                }
                for s in socios_raw
            ],
            "redes_sociais": redes_sociais,
            "raw": raw,
        }
        return normalizado


# ------------------------------------------------------------------
# Instância singleton — inicializada sob demanda via get_assertiva_service()
# ------------------------------------------------------------------

_instance: Optional[AssertivaCNPJService] = None


def get_assertiva_service() -> AssertivaCNPJService:
    """
    Retorna a instância singleton do serviço.
    Lança RuntimeError se as credenciais não estiverem configuradas.
    """
    global _instance
    if _instance is not None:
        return _instance

    try:
        from config import settings
        client_id = settings.ASSERTIVA_CLIENT_ID
        client_secret = settings.ASSERTIVA_CLIENT_SECRET
    except AttributeError:
        import os
        client_id = os.getenv("ASSERTIVA_CLIENT_ID", "")
        client_secret = os.getenv("ASSERTIVA_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        raise RuntimeError(
            "Credenciais da Assertiva não configuradas. "
            "Defina ASSERTIVA_CLIENT_ID e ASSERTIVA_CLIENT_SECRET no .env"
        )

    _instance = AssertivaCNPJService(client_id=client_id, client_secret=client_secret)
    return _instance
