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
    Converte o payload normalizado da Assertiva para um schema focado em decisores.

    Retorna apenas contatos efetivamente atrelados ao sócio/decisor no payload da Assertiva
    (não faz fallback com WhatsApp geral da empresa).
    """
    raw_root = normalizado.get("raw") or {}
    resposta = raw_root.get("resposta", raw_root)
    socios_raw = resposta.get("socios") or normalizado.get("socios") or []

    decisores: List[Dict[str, Any]] = []
    seen_socios = set()

    limite_iter = len(socios_raw) if max_decisores is None else max_decisores * 3
    for s in socios_raw[:limite_iter]:
        nome = s.get("nome") or ""
        if not _looks_like_person(nome):
            continue

        cargo = s.get("cargo") or s.get("qualificacao")
        cpf_cnpj = s.get("cpfCnpj") or s.get("cpf_cnpj")

        socio_phone_candidates = _collect_phone_candidates(s)
        socio_whats = _normalize_whatsapp_numbers(socio_phone_candidates)

        whatsapp_fonte = "assertiva_socio" if socio_whats else "sem_whatsapp_vinculado"

        key = str(nome).strip().lower()
        if key in seen_socios:
            continue
        seen_socios.add(key)

        decisores.append(
            {
                "nome": str(nome).strip(),
                "cargo": str(cargo).strip() if cargo else None,
                "cpf_cnpj": str(cpf_cnpj).strip() if cpf_cnpj else None,
                "whatsapp": socio_whats,
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

