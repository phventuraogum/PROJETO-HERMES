from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional

from api.assertiva_service import get_assertiva_service
from api.cache_service import cache_service
from api.validation_service import normalizar_whatsapp_br


def _looks_like_person(name: str) -> bool:
    text = str(name or "").strip()
    if not text or any(ch.isdigit() for ch in text):
        return False
    tokens = [t for t in re.split(r"\s+", text) if len(t) > 1]
    return len(tokens) >= 2


def _collect_phone_candidates(value: Any) -> List[str]:
    out: List[str] = []

    if value is None:
        return out

    if isinstance(value, (str, int, float)):
        raw = str(value)
        for m in re.findall(r"[+]?[\d][\d\s().-]{8,18}\d", raw):
            out.append(m)
        return out

    if isinstance(value, dict):
        for v in value.values():
            out.extend(_collect_phone_candidates(v))
        return out

    if isinstance(value, list):
        for item in value:
            out.extend(_collect_phone_candidates(item))
        return out

    return out


def _collect_email_candidates(value: Any) -> List[str]:
    out: List[str] = []
    email_re = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

    if value is None:
        return out

    if isinstance(value, (str, int, float)):
        raw = str(value).strip()
        if "@" in raw:
            for m in email_re.findall(raw):
                out.append(m.lower())
        return out

    if isinstance(value, dict):
        for k, v in value.items():
            lk = str(k).lower()
            if lk in {"email", "e-mail", "enderecoemail", "endereco_email"} and isinstance(v, str) and "@" in v:
                out.extend(email_re.findall(v.lower()))
            else:
                out.extend(_collect_email_candidates(v))
        return out

    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                em = item.get("email") or item.get("enderecoEmail") or item.get("endereco_email")
                if isinstance(em, str) and "@" in em:
                    out.extend(email_re.findall(em.lower()))
                else:
                    out.extend(_collect_email_candidates(item))
            else:
                out.extend(_collect_email_candidates(item))
        return out

    return out


def _socio_tem_contato_direto(s: Dict[str, Any]) -> bool:
    return bool(_collect_phone_candidates(s) or _collect_email_candidates(s))


def _nome_exibicao_socio(s: Dict[str, Any]) -> str:
    nome = str(s.get("nome") or "").strip()
    if nome:
        return nome
    cpf = s.get("cpfCnpj") or s.get("cpf_cnpj")
    if cpf:
        digits = re.sub(r"\D", "", str(cpf))
        if len(digits) >= 4:
            return f"Sócio (doc …{digits[-4:]})"
    return ""


def _looks_like_person_or_partner(name: str) -> bool:
    if _looks_like_person(name):
        return True
    upper = str(name or "").strip().upper()
    if len(upper) < 6:
        return False
    pj_markers = (" LTDA", " S.A", " S/A", " SA ", " EIRELI", " ME ", " EPP", " SIMPLES")
    return any(m in f" {upper} " for m in pj_markers)


def _normalize_whatsapp_numbers(values: List[str]) -> List[str]:
    normalized: List[str] = []
    seen = set()

    for v in values:
        wa = normalizar_whatsapp_br(str(v or ""))
        if not wa or wa in seen:
            continue
        seen.add(wa)
        normalized.append(wa)

    return normalized


def extract_decisores_from_assertiva_normalizado(
    normalizado: Dict[str, Any],
    *,
    max_decisores: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Converte o payload normalizado da Assertiva para decisores com o máximo de contatos
    por sócio (WhatsApp, telefones, e-mails) vindos do objeto do sócio na Assertiva.

    Não propaga WhatsApp genérico da empresa para o sócio sem vínculo no payload.
    """
    raw_root = normalizado.get("raw") or {}
    resposta = raw_root.get("resposta", raw_root)
    socios_raw = list(resposta.get("socios") or normalizado.get("socios") or [])

    decisores: List[Dict[str, Any]] = []
    seen_keys: set[str] = set()

    limite_iter = len(socios_raw) if max_decisores is None else max(max_decisores * 4, max_decisores)
    for s in socios_raw[:limite_iter]:
        if not isinstance(s, dict):
            continue

        nome_ui = _nome_exibicao_socio(s)
        nome_cmp = str(s.get("nome") or "").strip()
        if not nome_ui:
            continue
        if not (
            _looks_like_person(nome_cmp)
            or _looks_like_person_or_partner(nome_cmp)
            or _socio_tem_contato_direto(s)
        ):
            continue

        cargo = s.get("cargo") or s.get("qualificacao")
        cpf_cnpj = s.get("cpfCnpj") or s.get("cpf_cnpj")

        socio_phone_candidates = _collect_phone_candidates(s)
        socio_emails_raw = list(dict.fromkeys(_collect_email_candidates(s)))
        socio_whats = _normalize_whatsapp_numbers(socio_phone_candidates)
        socio_telefones: List[str] = []
        seen_tel_raw: set[str] = set()
        for raw_num in socio_phone_candidates:
            raw_str = str(raw_num).strip()
            if not raw_str or raw_str in seen_tel_raw:
                continue
            seen_tel_raw.add(raw_str)
            if normalizar_whatsapp_br(raw_str):
                continue
            digits = re.sub(r"\D", "", raw_str)
            if len(digits) >= 10:
                socio_telefones.append(raw_str)

        whatsapp_fonte = "assertiva_socio" if socio_whats else "sem_whatsapp_vinculado"

        dedup_key = str(nome_cmp or nome_ui).strip().lower() or str(cpf_cnpj or "")
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        decisores.append(
            {
                "nome": nome_ui,
                "cargo": str(cargo).strip() if cargo else None,
                "cpf_cnpj": str(cpf_cnpj).strip() if cpf_cnpj else None,
                "whatsapp": socio_whats,
                "telefones": socio_telefones,
                "emails": socio_emails_raw,
                "whatsapp_fonte": whatsapp_fonte,
            }
        )

        if max_decisores is not None and len(decisores) >= max_decisores:
            break

    return {
        "cnpj": normalizado.get("cnpj"),
        "encontrado": bool(normalizado.get("encontrado")),
        "decisores": decisores,
    }


async def consultar_decisores_cnpj(
    cnpj: str,
    *,
    id_finalidade: int = 5,
    max_decisores: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Consulta Assertiva e retorna decisores com foco em nome + WhatsApp (normalizados).
    """
    cnpj_limpo = "".join(filter(str.isdigit, cnpj))
    if len(cnpj_limpo) != 14:
        raise ValueError(f"CNPJ inválido: '{cnpj}'")

    ttl = max(
        60,
        int(
            os.getenv(
                "HERMES_ASSERTIVA_DECISORES_CACHE_TTL",
                str(cache_service.default_ttl),
            )
            or cache_service.default_ttl
        ),
    )

    cached = cache_service.get(
        "assertiva_decisores",
        cnpj=cnpj_limpo,
        id_finalidade=id_finalidade,
        max_decisores=max_decisores,
    )
    if cached:
        return cached

    service = get_assertiva_service()
    normalizado = await service.consultar_cnpj(cnpj_limpo, id_finalidade=id_finalidade)
    resultado = extract_decisores_from_assertiva_normalizado(
        normalizado,
        max_decisores=max_decisores,
    )

    cache_service.set(
        "assertiva_decisores",
        resultado,
        ttl=ttl,
        cnpj=cnpj_limpo,
        id_finalidade=id_finalidade,
        max_decisores=max_decisores,
    )
    return resultado

