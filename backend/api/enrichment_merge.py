from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

try:
    from api.validation_service import normalizar_whatsapp_br, validar_email, validar_telefone
except ImportError:
    def normalizar_whatsapp_br(numero_raw: str) -> Optional[str]:
        digits = re.sub(r"[^\d]", "", str(numero_raw or ""))
        if digits.startswith("0"):
            digits = digits[1:]
        if digits.startswith("55") and len(digits) >= 12:
            digits = digits[2:]
        if len(digits) == 11 and digits[2] == "9":
            return "55" + digits
        return None

    def validar_email(email: str) -> Dict[str, Any]:
        return {"valido": bool(email and "@" in email and "." in email.split("@")[-1]), "score": 1.0 if email else 0.0}

    def validar_telefone(telefone: str) -> Dict[str, Any]:
        digits = re.sub(r"[^\d]", "", str(telefone or ""))
        return {"valido": len(digits) in (10, 11, 13), "score": 1.0 if digits else 0.0}


EMAIL_GENERICOS = {
    "gmail.com",
    "hotmail.com",
    "yahoo.com",
    "outlook.com",
    "uol.com.br",
    "terra.com.br",
    "bol.com.br",
    "ig.com.br",
    "live.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
}

EMAILS_COMERCIAIS = {
    "contato",
    "comercial",
    "vendas",
    "atendimento",
    "sac",
    "financeiro",
    "suporte",
    "hello",
    "faleconosco",
    "fale-conosco",
}

EMAILS_INSTITUCIONAIS = {
    "imprensa",
    "press",
    "media",
    "news",
    "ri",
    "ir",
    "investor",
    "investors",
    "investorrelations",
    "relacoesinvestidores",
    "relacaoinvestidores",
}

DOMINIOS_CONTATO_DESCARTADOS = {
    "informecadastral.com.br",
    "cadastroempresa.com.br",
    "econodata.com.br",
    "speedio.com.br",
    "cnpj.biz",
    "cnpj.info",
    "cnpja.com",
    "consultascnpj.com",
    "consultasocio.com",
    "solutudo.com.br",
    "aboutcompany.info",
    "procuroacho.com",
    "guiapj.com.br",
    "todosnegocios.com",
    "br.todosnegocios.com",
    "empresascnpj.com",
    "buscacnpj.com.br",
    "portalcnpj.com.br",
    "google.com",
    "google.com.br",
    "dicio.com.br",
    "wikipedia.org",
    "wiktionary.org",
}

TERMOS_EMPRESA_IGNORADOS = {
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "a",
    "o",
    "em",
    "com",
    "para",
    "ltda",
    "sa",
    "s",
    "me",
    "epp",
    "eireli",
    "grupo",
    "holding",
    "empresa",
    "companhia",
    "comercio",
    "industrial",
    "industria",
    "servicos",
}

SUFIXOS_DOMINIO_3_NIVEIS = {
    "com.br",
    "org.br",
    "net.br",
    "gov.br",
    "edu.br",
}


def _normalizar_texto(valor: str) -> str:
    texto = unicodedata.normalize("NFKD", str(valor or ""))
    texto = "".join(ch for ch in texto if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", texto.lower())


def _normalizar_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    valor = str(url).strip()
    if not valor:
        return None
    if not valor.startswith("http"):
        valor = "https://" + valor
    return valor.rstrip("/")


def _dominio_site(site: Optional[str]) -> Optional[str]:
    normalizado = _normalizar_url(site)
    if not normalizado:
        return None
    try:
        host = (urlparse(normalizado).hostname or "").lower()
    except Exception:
        return None
    host = host.replace("www.", "")
    return host or None


def _dominio_registravel(host: Optional[str]) -> Optional[str]:
    host_limpo = str(host or "").lower().strip(".")
    if not host_limpo:
        return None

    partes = host_limpo.split(".")
    if len(partes) <= 2:
        return host_limpo

    if ".".join(partes[-2:]) in SUFIXOS_DOMINIO_3_NIVEIS and len(partes) >= 3:
        return ".".join(partes[-3:])

    return ".".join(partes[-2:])


def _dominio_email(email: str) -> str:
    try:
        return email.split("@", 1)[1].lower()
    except Exception:
        return ""


def _dominio_descartado(host_or_domain: Optional[str]) -> bool:
    dominio = _dominio_registravel(str(host_or_domain or "").lower())
    if not dominio:
        return False
    return any(
        dominio == bloqueado or dominio.endswith("." + bloqueado)
        for bloqueado in DOMINIOS_CONTATO_DESCARTADOS
    )


def _origem_diretorio_descartada(origem: str) -> bool:
    origem_norm = str(origem or "").lower()
    if not origem_norm:
        return False
    return any(dominio in origem_norm for dominio in DOMINIOS_CONTATO_DESCARTADOS)


def _tokens_empresa(*nomes: Optional[str]) -> List[str]:
    tokens: List[str] = []
    for nome in nomes:
        texto = unicodedata.normalize("NFKD", str(nome or "")).lower()
        texto = "".join(ch for ch in texto if not unicodedata.combining(ch))
        for token in re.split(r"[^a-z0-9]+", texto):
            if len(token) <= 2 or token in TERMOS_EMPRESA_IGNORADOS or token in tokens:
                continue
            tokens.append(token)
    return tokens[:6]


def _sigla_empresa(tokens: List[str]) -> str:
    if not tokens:
        return ""
    iniciais = "".join(token[0] for token in tokens if token)
    return iniciais[:6] if len(iniciais) >= 2 else ""


def _site_parece_oficial(site: Optional[str], razao_social: Optional[str], nome_fantasia: Optional[str]) -> bool:
    dominio = _dominio_registravel(_dominio_site(site))
    if not dominio or _dominio_descartado(dominio):
        return False

    host_principal = dominio.split(".")[0]
    tokens = _tokens_empresa(nome_fantasia, razao_social)
    if not tokens:
        return True

    sigla = _sigla_empresa(tokens)
    concatenado = "".join(tokens[:2])
    if sigla and sigla in host_principal:
        return True
    if concatenado and concatenado in host_principal:
        return True
    return any(token in host_principal for token in tokens if len(token) >= 4)


def _email_local_tokens(email: str) -> List[str]:
    local = email.split("@", 1)[0].lower()
    normalizado = _normalizar_texto(local)
    tokens = re.split(r"[^a-z0-9]+", local)
    tokens = [token for token in tokens if token]
    if normalizado and normalizado not in tokens:
        tokens.append(normalizado)
    return tokens


def _contato_key(item: Dict[str, Any]) -> str:
    return re.sub(r"\s+", "", str(item.get("valor") or "")).lower()


def _append_unique(items: List[Dict[str, Any]], item: Dict[str, Any]) -> None:
    valor = str(item.get("valor") or "").strip()
    if not valor:
        return
    novo = {k: v for k, v in item.items() if v not in (None, "", [], {})}
    for idx, existente in enumerate(items):
        if _contato_key(existente) != _contato_key(novo):
            continue
        merged = existente.copy()
        for chave, valor_novo in novo.items():
            if chave not in merged or merged[chave] in (None, "", [], {}):
                merged[chave] = valor_novo
        if (novo.get("confianca") or 0) > (existente.get("confianca") or 0):
            for chave in ("origem", "tipo", "confianca"):
                if chave in novo:
                    merged[chave] = novo[chave]
        items[idx] = merged
        return
    items.append(novo)


def _email_tipo(email: str, origem: str = "") -> str:
    local = email.split("@", 1)[0].lower()
    tokens_local = set(_email_local_tokens(email))
    origem_norm = (origem or "").lower()
    if "registro" in origem_norm:
        return "registro"
    if tokens_local & EMAILS_INSTITUCIONAIS:
        return "institucional"
    if local in EMAILS_COMERCIAIS or any(token in local for token in ("contato", "comercial", "vendas", "atendimento")):
        return "comercial"
    if tokens_local & EMAILS_COMERCIAIS:
        return "comercial"
    if _dominio_email(email) in EMAIL_GENERICOS:
        return "pessoal"
    return "empresa"


def _score_email(item: Dict[str, Any], dominio_empresa: Optional[str]) -> float:
    email = str(item.get("valor") or "").lower()
    if not email:
        return -1.0
    validacao = validar_email(email)
    score = float(validacao.get("score") or 0) * 100
    if validacao.get("mx_valido"):
        score += 18
    if validacao.get("smtp_status") == "accepted":
        score += 35
    elif validacao.get("smtp_status") == "rejected":
        score -= 250
    elif validacao.get("dominio_descartavel"):
        score -= 120
    score += min(float(item.get("confianca") or 0), 100.0) * 0.2
    tipo = item.get("tipo") or _email_tipo(email, str(item.get("origem") or ""))
    score += {"comercial": 35, "empresa": 28, "registro": 8, "institucional": 4, "pessoal": 2}.get(str(tipo), 0)
    origem = str(item.get("origem") or "").lower()
    if "scraping" in origem or "site" in origem:
        score += 30
    if "firecrawl" in origem:
        score += 18
    if "hunter" in origem:
        score += 25
    if "receita" in origem or "opencnpj" in origem:
        score += 18
    if "instagram" in origem or "link" in origem:
        score += 10
    if "registro" in origem:
        score += 4
    if _origem_diretorio_descartada(origem):
        score -= 120
    dominio = _dominio_email(email)
    if dominio_empresa and dominio == dominio_empresa:
        score += 28
    elif dominio and dominio not in EMAIL_GENERICOS:
        score -= 8
    if tipo == "institucional":
        score -= 18 if dominio_empresa and dominio == dominio_empresa else 28
    if "firecrawl" in origem and dominio_empresa and dominio and dominio != dominio_empresa:
        score -= 18
    return score


def _score_telefone(item: Dict[str, Any]) -> float:
    telefone = str(item.get("valor") or "")
    if not telefone:
        return -1.0
    validacao = validar_telefone(telefone)
    score = float(validacao.get("score") or 0) * 100
    origem = str(item.get("origem") or "").lower()
    if "site" in origem or "scraping" in origem:
        score += 20
    if "maps" in origem:
        score += 12
    if "receita" in origem or "opencnpj" in origem:
        score += 8
    if _origem_diretorio_descartada(origem):
        score -= 200
    return score


def _score_whatsapp(item: Dict[str, Any]) -> float:
    numero = normalizar_whatsapp_br(str(item.get("valor") or ""))
    if not numero:
        return -1.0
    score = 100.0
    origem = str(item.get("origem") or "").lower()
    if item.get("validado"):
        score += 30
    if "widget" in origem or "site" in origem:
        score += 18
    if "firecrawl" in origem and not item.get("validado"):
        score -= 12
    if "maps" in origem:
        score += 14
    if "instagram" in origem or "linktree" in origem or "link in bio" in origem:
        score += 12
    if "promo" in origem:
        score -= 10
    if _origem_diretorio_descartada(origem):
        score -= 220
    return score


def _primeiro_valor(items: List[Dict[str, Any]], score_fn, min_score: float = 1.0) -> Optional[str]:
    validos = [item for item in items if item.get("valor")]
    if not validos:
        return None
    melhor = max(validos, key=score_fn)
    if score_fn(melhor) < min_score:
        return None
    return str(melhor.get("valor"))


def _extrair_links_existentes(redes_sociais_socios: Any) -> Dict[str, List[str]]:
    resultado: Dict[str, List[str]] = {}
    for item in redes_sociais_socios or []:
        nome = str(item.get("nome") or "").strip()
        links = [str(link).strip() for link in (item.get("links") or []) if str(link).strip()]
        if not nome or not links:
            continue
        resultado[nome] = list(dict.fromkeys(links))
    return resultado


def _match_socio(socios: List[Dict[str, Any]], nome: str) -> int:
    alvo = _normalizar_texto(nome)
    if not alvo:
        return -1
    for idx, socio in enumerate(socios):
        atual = _normalizar_texto(socio.get("nome") or "")
        if atual == alvo:
            return idx
        if atual and (atual.startswith(alvo[:10]) or alvo.startswith(atual[:10])):
            return idx
    return -1


def _upsert_socio(socios: List[Dict[str, Any]], nome: str, **updates: Any) -> Dict[str, Any]:
    idx = _match_socio(socios, nome)
    if idx < 0:
        socio = {"nome": nome}
        socios.append(socio)
    else:
        socio = socios[idx]

    for chave, valor in updates.items():
        if valor in (None, "", [], {}):
            continue
        if chave == "emails_alternativos":
            atuais = [str(v) for v in (socio.get(chave) or []) if v]
            for alt in (valor or []):
                if alt and alt not in atuais:
                    atuais.append(alt)
            if atuais:
                socio[chave] = atuais
            continue
        if chave == "links_sociais":
            atuais = [str(v) for v in (socio.get(chave) or []) if v]
            for link in (valor or []):
                if link and link not in atuais:
                    atuais.append(link)
            if atuais:
                socio[chave] = atuais
            continue
        if chave not in socio or socio.get(chave) in (None, "", [], {}):
            socio[chave] = valor
            continue
        if chave == "fonte_contato":
            atual = str(socio.get(chave))
            if valor not in atual:
                socio[chave] = f"{atual}; {valor}"
    return socio


_RE_CADASTRO_EMPRESA_FONTE = re.compile(r"cadastro da empresa|cadastro empresa", re.I)


def _fonte_socio_eh_so_propagacao_empresa(fonte: Any) -> bool:
    """Legado: contatos da empresa copiados para cada sócio.

    Espelho de src/lib/socioContatoLegado.ts (fonteSocioEhSoPropagacaoEmpresa).
    """
    f = str(fonte or "").strip()
    if not f:
        return False
    if re.search(r"assertiva", f, re.I):
        return False
    return bool(_RE_CADASTRO_EMPRESA_FONTE.search(f))


def _strip_empresa_propagated_socio_contacts(socios: List[Dict[str, Any]]) -> None:
    for socio in socios:
        if not _fonte_socio_eh_so_propagacao_empresa(socio.get("fonte_contato")):
            continue
        for k in ("whatsapp", "telefone", "email"):
            socio.pop(k, None)
        socio.pop("emails_alternativos", None)
        socio.pop("fonte_contato", None)


def _serializar_redes_socios(socios: List[Dict[str, Any]], redes_existentes: Dict[str, List[str]]) -> List[Dict[str, Any]]:
    resultado: List[Dict[str, Any]] = []
    usados = set()
    for socio in socios:
        nome = str(socio.get("nome") or "").strip()
        if not nome:
            continue
        links = list(redes_existentes.get(nome, []))
        for link in socio.get("links_sociais", []) or []:
            if link not in links:
                links.append(link)
        if socio.get("linkedin") and socio["linkedin"] not in links:
            links.append(str(socio["linkedin"]))
        chave = _normalizar_texto(nome)
        if not links or chave in usados:
            continue
        usados.add(chave)
        resultado.append({"nome": nome, "links": links})
    return resultado


def merge_enrichment_payload(existing: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    razao_social = existing.get("razao_social")
    nome_fantasia = existing.get("nome_fantasia")
    site_payload = _normalizar_url(payload.get("site"))
    site_existente = _normalizar_url(existing.get("site"))
    site_payload_valido = _site_parece_oficial(site_payload, razao_social, nome_fantasia)
    site_existente_valido = _site_parece_oficial(site_existente, razao_social, nome_fantasia)
    site = site_payload if site_payload_valido else (site_existente if site_existente_valido else None)
    dominio_empresa = _dominio_registravel(_dominio_site(site))
    existing_site_descartado = not site_existente_valido
    permitir_contatos_scraping_payload = bool(site_payload_valido or (not site_payload and site_existente_valido))

    emails: List[Dict[str, Any]] = []
    telefones: List[Dict[str, Any]] = []
    whatsapps: List[Dict[str, Any]] = []

    for item in existing.get("emails_captados") or []:
        _append_unique(emails, dict(item))
    for item in existing.get("telefones_captados") or []:
        _append_unique(telefones, dict(item))
    for item in existing.get("whatsapps_captados") or []:
        _append_unique(whatsapps, dict(item))

    def add_email(valor: Optional[str], origem: str, tipo: Optional[str] = None, confianca: Optional[float] = None) -> None:
        if not valor:
            return
        email = str(valor).strip().lower()
        if not email:
            return
        dominio_email = _dominio_email(email)
        if _dominio_descartado(dominio_email):
            return
        validacao = validar_email(email)
        if _origem_diretorio_descartada(origem):
            if not dominio_empresa or dominio_email != dominio_empresa:
                return
        _append_unique(
            emails,
            {
                "valor": email,
                "origem": origem,
                "tipo": tipo or _email_tipo(email, origem),
                "confianca": confianca,
                "validado": validacao.get("valido"),
                "score_validacao": validacao.get("score"),
                "metodo_validacao": validacao.get("metodo"),
                "motivo_validacao": validacao.get("motivo"),
                "mx_valido": validacao.get("mx_valido"),
                "smtp_status": validacao.get("smtp_status"),
            },
        )

    def add_telefone(valor: Optional[str], origem: str, tipo: str = "telefone", confianca: Optional[float] = None) -> None:
        if not valor:
            return
        telefone = str(valor).strip()
        if not telefone:
            return
        if _origem_diretorio_descartada(origem):
            return
        _append_unique(
            telefones,
            {
                "valor": telefone,
                "origem": origem,
                "tipo": tipo,
                "confianca": confianca,
            },
        )

    def add_whatsapp(valor: Optional[str], origem: str, tipo: str = "whatsapp", confianca: Optional[float] = None, validado: bool = False) -> None:
        if not valor:
            return
        numero = normalizar_whatsapp_br(str(valor))
        if not numero:
            return
        if _origem_diretorio_descartada(origem):
            return
        _append_unique(
            whatsapps,
            {
                "valor": numero,
                "origem": origem,
                "tipo": tipo,
                "confianca": confianca,
                "validado": validado,
            },
        )

    add_email(existing.get("email_enriquecido"), "Atual")
    add_email(existing.get("email"), "Receita Base")
    if not existing_site_descartado:
        add_telefone(existing.get("telefone_enriquecido"), "Atual")
    add_telefone(existing.get("telefone_padrao"), "Receita Base")
    add_telefone(existing.get("telefone_receita"), "Receita Base")
    add_telefone(existing.get("telefone_estab1"), "Estabelecimento 1")
    add_telefone(existing.get("telefone_estab2"), "Estabelecimento 2")
    if not existing_site_descartado:
        add_whatsapp(existing.get("whatsapp_publico"), "Atual", tipo="publico")
        add_whatsapp(existing.get("whatsapp_enriquecido"), "Atual", tipo="enriquecido")

    origem_payload = str(payload.get("contatos_source") or payload.get("source") or "Scraping Web")
    if permitir_contatos_scraping_payload and payload.get("email"):
        add_email(payload.get("email"), origem_payload)
    if permitir_contatos_scraping_payload and payload.get("telefone"):
        add_telefone(payload.get("telefone"), origem_payload)
    if permitir_contatos_scraping_payload and payload.get("whatsapp_publico"):
        add_whatsapp(payload.get("whatsapp_publico"), origem_payload, tipo="publico")

    contatos_web = payload.get("contatos_web") or {}
    origem_contatos_web = str(contatos_web.get("origem") or origem_payload or "Core Scraper")
    if permitir_contatos_scraping_payload:
        add_email(contatos_web.get("email_enriquecido"), origem_contatos_web)
        add_telefone(contatos_web.get("telefone_enriquecido"), origem_contatos_web)
        add_whatsapp(contatos_web.get("whatsapp_enriquecido"), origem_contatos_web, tipo="publico")

    email_waterfall = payload.get("email_waterfall") or {}
    add_email(
        email_waterfall.get("email"),
        str(email_waterfall.get("fonte") or "Waterfall Email"),
        confianca=float(email_waterfall.get("confianca") or 0),
    )

    dados_receita = payload.get("dados_receita") or {}
    add_email(dados_receita.get("email_receita"), "OpenCNPJ")
    for telefone in dados_receita.get("telefones_receita") or []:
        add_telefone(telefone, "OpenCNPJ")

    instagram = payload.get("instagram") or {}
    add_email(instagram.get("email"), "Instagram", tipo="comercial")

    linkinbio = payload.get("linkinbio") or {}
    add_email(linkinbio.get("email"), "Link in bio", tipo="comercial")
    add_whatsapp(linkinbio.get("whatsapp"), "Link in bio", tipo="publico")

    whatsapp_payload = payload.get("whatsapp") or payload.get("whatsapp_ultra") or {}
    add_whatsapp(
        whatsapp_payload.get("numero"),
        str(whatsapp_payload.get("fonte") or "WhatsApp Ultra"),
        tipo="enriquecido",
        validado=bool(whatsapp_payload.get("validado")),
    )

    dados_registro = payload.get("dados_registro") or {}
    add_email(dados_registro.get("email_proprietario"), "Registro.br", tipo="registro")

    emails.sort(key=lambda item: _score_email(item, dominio_empresa), reverse=True)
    telefones.sort(key=_score_telefone, reverse=True)
    whatsapps.sort(key=_score_whatsapp, reverse=True)

    email_principal = _primeiro_valor(
        [item for item in emails if item.get("tipo") in ("comercial", "empresa")],
        lambda item: _score_email(item, dominio_empresa),
    ) or _primeiro_valor(emails, lambda item: _score_email(item, dominio_empresa))
    telefone_principal = _primeiro_valor(telefones, _score_telefone)
    whatsapp_principal = _primeiro_valor(whatsapps, _score_whatsapp)

    socios: List[Dict[str, Any]] = [dict(socio) for socio in (existing.get("socios_estruturado") or [])]
    for socio in dados_receita.get("socios_qsa") or []:
        _upsert_socio(
            socios,
            str(socio.get("nome") or "").strip(),
            qualificacao=socio.get("qualificacao"),
            cpf_cnpj=socio.get("cpf_cnpj"),
        )

    for socio in payload.get("emails_socios") or []:
        nome = str(socio.get("nome") or "").strip()
        if not nome:
            continue
        _upsert_socio(
            socios,
            nome,
            email=socio.get("email_socio"),
            emails_alternativos=socio.get("emails_alternativos") or [],
            fonte_contato=socio.get("fonte"),
        )

    for rede in (payload.get("redes_socios") or []) + (payload.get("linkedin_ultra") or []) + (payload.get("socios_linkedin") or []):
        nome = str(rede.get("nome") or "").strip()
        if not nome:
            continue
        telefone_linkedin = str(rede.get("telefone_linkedin") or "").strip() or None
        whatsapp_linkedin = normalizar_whatsapp_br(telefone_linkedin or "")
        _upsert_socio(
            socios,
            nome,
            linkedin=rede.get("linkedin"),
            email=rede.get("email_linkedin") or None,
            telefone=telefone_linkedin,
            whatsapp=whatsapp_linkedin,
            cargo_atual=rede.get("cargo_atual"),
            empresa_atual=rede.get("empresa_atual"),
            localizacao=rede.get("localizacao_linkedin"),
            fonte_contato=rede.get("fonte") or rede.get("metodo_descoberta"),
            links_sociais=[rede.get("linkedin")] if rede.get("linkedin") else [],
        )

    assertiva_pack = payload.get("assertiva") if isinstance(payload.get("assertiva"), dict) else {}
    dados_as = assertiva_pack.get("dados_cadastrais") or {}
    for t in dados_as.get("telefones") or []:
        if not isinstance(t, dict):
            continue
        num = str(t.get("numero") or "").strip()
        if not num:
            continue
        if t.get("whatsapp"):
            add_whatsapp(num, "Assertiva", tipo="assertiva_empresa")
        else:
            add_telefone(num, "Assertiva")
    for e in dados_as.get("emails") or []:
        em = e.get("email") if isinstance(e, dict) else e
        em_str = str(em or "").strip()
        if em_str:
            add_email(em_str, "Assertiva", tipo="empresa")

    for dec in assertiva_pack.get("decisores") or []:
        if not isinstance(dec, dict):
            continue
        nome = str(dec.get("nome") or "").strip()
        if not nome:
            continue
        wa_list = [str(w).strip() for w in (dec.get("whatsapp") or []) if str(w).strip()]
        wa_join = " | ".join(dict.fromkeys(wa_list)) if wa_list else None
        tels = [str(x).strip() for x in (dec.get("telefones") or []) if str(x).strip()]
        tel_join = tels[0] if tels else None
        emails_dec = [str(x).strip().lower() for x in (dec.get("emails") or []) if str(x).strip()]
        email_pri = emails_dec[0] if emails_dec else None
        emails_alt = emails_dec[1:] if len(emails_dec) > 1 else []
        fonte_dec = f"assertiva ({dec.get('whatsapp_fonte') or 'decisor'})"
        _upsert_socio(
            socios,
            nome,
            qualificacao=dec.get("cargo"),
            cpf_cnpj=dec.get("cpf_cnpj"),
            whatsapp=wa_join,
            telefone=tel_join,
            email=email_pri,
            emails_alternativos=emails_alt or None,
            fonte_contato=fonte_dec,
        )
        for wa in wa_list:
            add_whatsapp(wa, f"Assertiva sócio ({nome})", tipo="socio_assertiva")
        for tel in tels:
            add_telefone(tel, f"Assertiva sócio ({nome})")
        for em in emails_dec:
            add_email(em, f"Assertiva sócio ({nome})", tipo="socio")

    _strip_empresa_propagated_socio_contacts(socios)

    redes_socios_existentes = _extrair_links_existentes(existing.get("redes_sociais_socios"))
    redes_sociais_socios = _serializar_redes_socios(socios, redes_socios_existentes)

    instagram_payload = payload.get("instagram") or {}
    instagram_url = instagram_payload.get("url") if isinstance(instagram_payload, dict) else instagram_payload
    linkedin_empresa = payload.get("linkedin_empresa") or existing.get("linkedin_empresa")
    instagram_empresa = instagram_url or existing.get("instagram_empresa")
    facebook_empresa = payload.get("facebook") or existing.get("facebook_empresa")

    redes_empresa: List[str] = []
    for origem in (
        existing.get("redes_sociais_empresa") or [],
        payload.get("redes_sociais_empresa") or [],
        [linkedin_empresa, instagram_empresa, facebook_empresa],
    ):
        for link in origem:
            url = _normalizar_url(link)
            if url and url not in redes_empresa:
                redes_empresa.append(url)

    if not linkedin_empresa:
        linkedin_empresa = next((link for link in redes_empresa if "linkedin.com" in link.lower()), None)
    if not instagram_empresa:
        instagram_empresa = next((link for link in redes_empresa if "instagram.com" in link.lower()), None)
    if not facebook_empresa:
        facebook_empresa = next((link for link in redes_empresa if "facebook.com" in link.lower()), None)

    resumo_ia = payload.get("resumo_ia_empresa") or (payload.get("enriquecimento_ia") or {}).get("resumo_empresa") or existing.get("resumo_ia_empresa")

    notas: List[str] = []
    for trecho in (
        existing.get("outras_informacoes"),
        payload.get("outras_info"),
    ):
        texto = str(trecho or "").strip()
        if texto and texto not in notas:
            notas.append(texto)
    if dados_registro.get("proprietario"):
        notas.append(f"Registro.br: {dados_registro['proprietario']}")
    if linkinbio.get("telegram"):
        notas.append(f"Telegram: {linkinbio['telegram']}")
    outras_info = " | ".join(dict.fromkeys(notas)) if notas else None

    fonte_prioritaria = None
    if emails:
        fonte_prioritaria = str(emails[0].get("origem") or "")
    elif whatsapps:
        fonte_prioritaria = str(whatsapps[0].get("origem") or "")
    elif telefone_principal:
        fonte_prioritaria = str(telefones[0].get("origem") or "")

    return {
        "site": site,
        "email_enriquecido": email_principal,
        "telefone_enriquecido": telefone_principal,
        "whatsapp_enriquecido": whatsapp_principal,
        "whatsapp_publico": existing.get("whatsapp_publico") or whatsapp_principal,
        "resumo_ia_empresa": resumo_ia,
        "outras_informacoes": outras_info,
        "redes_sociais_empresa": redes_empresa or None,
        "redes_sociais_socios": redes_sociais_socios or None,
        "socios_estruturado": socios or None,
        "registro_dono": dados_registro.get("proprietario") or existing.get("registro_dono"),
        "registro_email": dados_registro.get("email_proprietario") or existing.get("registro_email"),
        "fonte_dados_prioritaria": fonte_prioritaria or existing.get("fonte_dados_prioritaria"),
        "linkedin_empresa": _normalizar_url(linkedin_empresa),
        "instagram_empresa": _normalizar_url(instagram_empresa),
        "facebook_empresa": _normalizar_url(facebook_empresa),
        "emails_captados": emails or None,
        "telefones_captados": telefones or None,
        "whatsapps_captados": whatsapps or None,
    }
