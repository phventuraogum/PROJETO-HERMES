"""
Serviço de integração com a API Assertiva v3.
Autenticação OAuth2 (client_credentials) com cache de token.
Consulta de CNPJ (PJ) e CPF (PF) via Assertiva Localize.
"""
import logging
import re
import time
import unicodedata
from typing import Optional, Dict, Any
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

ASSERTIVA_TOKEN_URL = "https://api.assertivasolucoes.com.br/oauth2/v3/token"
ASSERTIVA_CNPJ_URL  = "https://api.assertivasolucoes.com.br/localize/v3/cnpj"
ASSERTIVA_CPF_URL   = "https://api.assertivasolucoes.com.br/localize/v3/cpf"

# Fontes genéricas comuns (não representam canal oficial da empresa consultada)
_GENERIC_CONTACT_MARKERS = (
    "informecadastral",
    "consulta cadastral",
    "consultacadastral",
    "situação cadastral",
    "situacao cadastral",
    "consulta cnpj",
    "consultacnpj",
)

_SUSPICIOUS_DOMAIN_MARKERS = (
    "cadastral",
    "consulta",
    "consultacnpj",
    "consultacpf",
    "informecadastral",
    "dados",
)

_COMPANY_STOPWORDS = {
    "ltda", "me", "epp", "eireli", "sa", "s", "a", "de", "da", "do", "das", "dos",
    "e", "comercio", "servicos", "industria", "empresa", "grupo", "holding", "brasil",
}


def _text_has_generic_marker(value: Optional[str]) -> bool:
    if not value:
        return False
    txt = str(value).strip().lower()
    if not txt:
        return False
    return any(marker in txt for marker in _GENERIC_CONTACT_MARKERS)


def _normalize_text(value: Optional[str]) -> str:
    if not value:
        return ""
    txt = unicodedata.normalize("NFKD", str(value).lower())
    txt = "".join(ch for ch in txt if not unicodedata.combining(ch))
    return txt


def _extract_domain(value: Optional[str]) -> str:
    if not value:
        return ""
    raw = str(value).strip().lower()
    if not raw:
        return ""
    candidate = raw if "://" in raw else f"https://{raw}"
    try:
        host = urlparse(candidate).netloc.lower()
    except Exception:
        host = ""
    if not host:
        return raw
    if host.startswith("www."):
        host = host[4:]
    return host


def _company_tokens(razao_social: Optional[str], nome_fantasia: Optional[str]) -> set[str]:
    base = f"{_normalize_text(razao_social)} {_normalize_text(nome_fantasia)}"
    parts = re.findall(r"[a-z0-9]+", base)
    tokens = {p for p in parts if len(p) >= 4 and p not in _COMPANY_STOPWORDS}
    return tokens


def _has_company_domain_signal(domains: list[str], company_tokens: set[str]) -> bool:
    if not domains or not company_tokens:
        return False
    for domain in domains:
        dom = _normalize_text(domain)
        if any(tok in dom for tok in company_tokens):
            return True
    return False


def _is_generic_contact_source(
    site: Optional[str],
    emails: list,
    razao_social: Optional[str],
    nome_fantasia: Optional[str],
    has_whatsapp: bool = False,
) -> bool:
    if _text_has_generic_marker(razao_social) or _text_has_generic_marker(nome_fantasia):
        return True

    site_domain = _extract_domain(site)
    if _text_has_generic_marker(site_domain):
        return True

    email_domains: list[str] = []
    for e in emails or []:
        if isinstance(e, dict):
            email = (e.get("email") or "").strip().lower()
        else:
            email = str(e or "").strip().lower()
        if not email:
            continue
        if _text_has_generic_marker(email):
            return True
        if "@" in email:
            email_domain = email.split("@", 1)[1]
            email_domains.append(email_domain)
            if _text_has_generic_marker(email_domain):
                return True

    # Heurística extra: se houver WhatsApp, mas domínio/e-mail não têm
    # qualquer sinal de vínculo com a marca e o domínio parece "agregador",
    # trata como contato genérico.
    domains = [d for d in [site_domain, *email_domains] if d]
    company_tokens = _company_tokens(razao_social, nome_fantasia)
    has_brand_signal = _has_company_domain_signal(domains, company_tokens)
    domain_looks_suspicious = any(
        marker in _normalize_text(d) for d in domains for marker in _SUSPICIOUS_DOMAIN_MARKERS
    )
    if has_whatsapp and domains and not has_brand_signal and domain_looks_suspicious:
        return True

    return False


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

        token = await self._get_token()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                ASSERTIVA_CNPJ_URL,
                params={"cnpj": cnpj_limpo, "idFinalidade": id_finalidade},
                headers={"Authorization": f"Bearer {token}"},
            )

        if resp.status_code == 404:
            logger.info("CNPJ %s não encontrado na Assertiva", cnpj_limpo)
            return {"encontrado": False, "cnpj": cnpj_limpo}

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
    # Consulta CPF (Pessoa Física)
    # ------------------------------------------------------------------

    async def consultar_cpf(
        self,
        cpf: str,
        id_finalidade: int = 5,
    ) -> Dict[str, Any]:
        """
        Consulta dados de uma Pessoa Física por CPF via Assertiva Localize.
        Mesmo token OAuth2 usado para CNPJ — sem credenciais extras.

        Retorna dict normalizado com telefones (WhatsApp), e-mails,
        empresas vinculadas e histórico profissional.
        """
        cpf_limpo = "".join(filter(str.isdigit, cpf))
        if len(cpf_limpo) != 11:
            raise ValueError(f"CPF inválido: '{cpf}'")

        token = await self._get_token()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                ASSERTIVA_CPF_URL,
                params={"cpf": cpf_limpo, "idFinalidade": id_finalidade},
                headers={"Authorization": f"Bearer {token}"},
            )

        if resp.status_code == 404:
            logger.info("CPF %s não encontrado na Assertiva", cpf_limpo)
            return {"encontrado": False, "cpf": cpf_limpo}

        if resp.status_code != 200:
            logger.error(
                "Assertiva CPF %s falhou: %s — %s",
                cpf_limpo,
                resp.status_code,
                resp.text[:300],
            )
            raise RuntimeError(
                f"Assertiva retornou HTTP {resp.status_code} para CPF {cpf_limpo}"
            )

        raw = resp.json()
        return self._normalizar_pf(cpf_limpo, raw)

    # ------------------------------------------------------------------
    # Normalização da resposta PF
    # ------------------------------------------------------------------

    def _normalizar_pf(self, cpf: str, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Mapeia payload bruto da Assertiva PF para schema interno."""
        cabecalho = raw.get("cabecalho", {})
        resposta  = raw.get("resposta", raw)

        dados    = resposta.get("dadosCadastrais", {})
        tel_raw  = resposta.get("telefones", {})
        emails_r = resposta.get("emails", [])
        empresas = resposta.get("empresas", [])
        redes    = resposta.get("redesSociais", [])

        telefones: list = []
        for t in tel_raw.get("fixos", []):
            telefones.append({
                "numero":        t.get("numero"),
                "tipo":          "fixo",
                "whatsapp":      t.get("aplicativos", {}).get("whatsAppBusiness", False),
                "nao_perturbe":  t.get("naoPerturbe", False),
                "ultimo_contato": t.get("ultimoContato"),
            })
        for t in tel_raw.get("moveis", []):
            telefones.append({
                "numero": t.get("numero"),
                "tipo":   "movel",
                "whatsapp": (
                    t.get("aplicativos", {}).get("whatsApp", False)
                    or t.get("aplicativos", {}).get("whatsAppBusiness", False)
                ),
                "nao_perturbe":  t.get("naoPerturbe", False),
                "ultimo_contato": t.get("ultimoContato"),
            })

        return {
            "encontrado":    True,
            "fonte":         "assertiva",
            "protocolo":     cabecalho.get("protocolo"),
            "cpf":           cpf,
            "nome":          dados.get("nome"),
            "data_nascimento": dados.get("dataNascimento"),
            "sexo":          dados.get("sexo"),
            "obito":         dados.get("obito", False),
            "telefones":     telefones,
            "emails": [
                {
                    "email": e.get("email") if isinstance(e, dict) else e,
                    "tipo":  e.get("tipo")  if isinstance(e, dict) else None,
                }
                for e in emails_r
            ],
            "empresas": [
                {
                    "cnpj":          emp.get("cnpj"),
                    "razao_social":  emp.get("razaoSocial"),
                    "cargo":         emp.get("cargo") or emp.get("qualificacao"),
                    "data_entrada":  emp.get("dataEntrada"),
                    "situacao":      emp.get("situacaoCadastral"),
                }
                for emp in empresas
            ],
            "redes_sociais": redes,
            "raw": raw,
        }

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

        # Se a Assertiva trouxe fonte genérica de consulta cadastral,
        # descartamos contatos para evitar falso WhatsApp da empresa.
        source_is_generic = _is_generic_contact_source(
            site=dados.get("site"),
            emails=emails_raw,
            razao_social=dados.get("razaoSocial"),
            nome_fantasia=dados.get("nomeFantasia"),
            has_whatsapp=any(bool(t.get("whatsapp")) for t in telefones),
        )
        if source_is_generic:
            telefones = []
            emails_raw = []

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
                    "nome": s.get("nome"),
                    "cpf_cnpj": s.get("cpfCnpj"),
                    "cargo": s.get("cargo") or s.get("qualificacao"),
                    "data_entrada": s.get("dataEntrada"),
                }
                for s in socios_raw
            ],
            "redes_sociais": redes_sociais,
            "raw": raw,
            "contatos_filtrados": source_is_generic,
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
