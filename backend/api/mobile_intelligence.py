from __future__ import annotations

import asyncio
import ast
import html
import json
import logging
import re
from urllib.parse import unquote
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from api.db_pool import get_connection
from api.lead_registry import lead_registry_service
from api.validation_service import (
    is_ddd_valido,
    normalizar_whatsapp_br,
    verificar_whatsapp_lote,
)

logger = logging.getLogger(__name__)

WHATSAPP_LINK_PATTERN = re.compile(
    r"(?i)(?:wa\.me/|api\.whatsapp\.com/(?:send|message)/?\?phone=|whatsapp\.com/send\?phone=)(\+?\d{10,15})"
)
KEYED_PHONE_PATTERN = re.compile(
    r"(?i)(whatsapp|whats|zap|chatbot|telefone|celular|mobile|contato|atendimento|comercial|vendas)[^0-9]{0,24}(\+?\d[\d\s().-]{8,18}\d)"
)
FORMATTED_PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?(?:9?\d{4})[\s.-]?\d{4}(?!\d)"
)
WHATSAPP_CONTEXT_TERMS = {
    "whatsapp",
    "whats",
    "zap",
    "chatbot",
    "fale conosco",
    "converse",
    "atendimento",
    "sac",
}
COMMERCIAL_CONTEXT_TERMS = {
    "contato",
    "telefone",
    "ligue",
    "comercial",
    "vendas",
    "suporte",
    "central",
    "fale",
    "delivery",
}
DECISION_MAKER_TERMS = {
    "socio",
    "sócio",
    "fundador",
    "diretor",
    "gerente",
    "ceo",
    "cfo",
    "coo",
    "proprietario",
    "proprietário",
    "responsavel",
    "responsável",
}
FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "yahoo.com",
    "icloud.com",
    "live.com",
    "uol.com.br",
    "terra.com.br",
    "bol.com.br",
}
URL_PATTERN = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_cnpj(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())[:14]


def _normalize_phone(value: Any) -> Optional[str]:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not digits:
        return None
    if digits.startswith("55") and len(digits) in {12, 13}:
        return digits
    if len(digits) in {10, 11}:
        return f"55{digits}"
    return digits if len(digits) >= 10 else None


def _is_mobile_br(phone: Optional[str]) -> bool:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if digits.startswith("55"):
        digits = digits[2:]
    return len(digits) == 11 and digits[2] == "9"


def _is_landline_br(phone: Optional[str]) -> bool:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if digits.startswith("55"):
        digits = digits[2:]
    return len(digits) == 10


def _coerce_jsonish(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    if isinstance(value, (list, dict)):
        return value
    raw = str(value).strip()
    if not raw:
        return default
    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(raw)
            if parsed is None:
                return default
            return parsed
        except Exception:
            continue
    return default


def _has_valid_brazilian_ddd(phone: Optional[str]) -> bool:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if digits.startswith("55"):
        digits = digits[2:]
    if len(digits) not in {10, 11}:
        return False
    return is_ddd_valido(digits[:2])


def _decode_loose_text(value: Any) -> str:
    raw = str(value or "")
    if not raw:
        return ""
    text = raw
    for _ in range(3):
        decoded = unquote(text)
        if decoded == text:
            break
        text = decoded
    return html.unescape(text)


def _text_context_window(text: str, start: int, end: int, radius: int = 80) -> str:
    return text[max(0, start - radius): min(len(text), end + radius)].lower()


def _match_contains_phone_formatting(value: str) -> bool:
    return any(token in value for token in ("(", ")", "-", ".", " ", "+"))


def _normalize_site_candidate(value: Any) -> Optional[str]:
    text = _decode_loose_text(value).strip().strip(".,);]")
    if not text:
        return None
    if text.startswith("www."):
        text = f"https://{text}"
    if not text.startswith(("http://", "https://")):
        if re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", text, re.IGNORECASE):
            text = f"https://{text}"
        else:
            return None
    return text


def _corporate_domain_from_email(value: Any) -> Optional[str]:
    raw = str(value or "").strip().lower()
    if "@" not in raw:
        return None
    domain = raw.split("@", 1)[1].strip().strip(".,);]")
    if not domain or domain in FREE_EMAIL_DOMAINS:
        return None
    if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", domain, re.IGNORECASE):
        return None
    return domain


def _collect_site_candidates(snapshot: Dict[str, Any]) -> List[str]:
    seen: set[str] = set()
    candidates: List[str] = []

    def add(value: Any) -> None:
        normalized = _normalize_site_candidate(value)
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    add(snapshot.get("site"))
    add(_corporate_domain_from_email(snapshot.get("email_final")))
    add(_corporate_domain_from_email(snapshot.get("email_enriquecido")))
    add(_corporate_domain_from_email(snapshot.get("email_receita")))

    for url in URL_PATTERN.findall(_decode_loose_text(snapshot.get("outras_informacoes"))):
        add(url)
        if len(candidates) >= 4:
            break

    return candidates[:4]


async def _probe_site_contacts(site_url: str) -> Dict[str, Any]:
    try:
        from core_scraper import extrair_contatos_site

        return await asyncio.wait_for(extrair_contatos_site(site_url, modo_rapido=True), timeout=18.0)
    except Exception:
        return {}


async def _probe_external_whatsapp_search(company_name: str, city: str, cnpj: str) -> Dict[str, Any]:
    try:
        from whatsapp_linkedin_ultra import (
            buscar_google_maps,
            buscar_whatsapp_direto,
            buscar_whatsapp_redes_sociais,
        )
    except Exception:
        return {}

    result: Dict[str, Any] = {}

    try:
        maps = await asyncio.wait_for(buscar_google_maps(company_name, city or "", cnpj or ""), timeout=18.0)
        if isinstance(maps, dict):
            if maps.get("whatsapp_maps"):
                result["whatsapp"] = maps.get("whatsapp_maps")
                result["whatsapp_source"] = "Google Maps"
            if maps.get("telefone_maps"):
                result["phone"] = maps.get("telefone_maps")
                result["phone_source"] = "Google Maps"
    except Exception:
        pass

    if not result.get("whatsapp"):
        try:
            direct = await asyncio.wait_for(buscar_whatsapp_direto(company_name, city or ""), timeout=18.0)
            if direct:
                result["whatsapp"] = direct
                result["whatsapp_source"] = "Busca direta"
        except Exception:
            pass

    if not result.get("whatsapp"):
        try:
            social = await asyncio.wait_for(buscar_whatsapp_redes_sociais(company_name), timeout=18.0)
            if isinstance(social, dict):
                if social.get("whats_instagram"):
                    result["whatsapp"] = social.get("whats_instagram")
                    result["whatsapp_source"] = "Instagram Bio"
                elif social.get("whats_facebook"):
                    result["whatsapp"] = social.get("whats_facebook")
                    result["whatsapp_source"] = "Facebook Page"
        except Exception:
            pass

    return result


def _extract_contextual_phones(raw_text: Any) -> List[Dict[str, Any]]:
    text = _decode_loose_text(raw_text)
    if not text:
        return []

    results: List[Dict[str, Any]] = []
    seen: set[str] = set()

    def register(
        raw_phone: Any,
        *,
        source_label: str,
        kind: str,
        contact_level: str = "company",
        confidence: float = 0.72,
    ) -> None:
        normalized_phone = _normalize_phone(raw_phone)
        if not normalized_phone or normalized_phone in seen:
            return
        if not _has_valid_brazilian_ddd(normalized_phone):
            return
        seen.add(normalized_phone)
        results.append(
            {
                "phone": raw_phone,
                "source_label": source_label,
                "kind": kind,
                "contact_level": contact_level,
                "confidence": confidence,
            }
        )

    for match in WHATSAPP_LINK_PATTERN.finditer(text):
        register(
            match.group(1),
            source_label="Outras informacoes (link WhatsApp)",
            kind="whatsapp",
            confidence=0.88,
        )

    for match in KEYED_PHONE_PATTERN.finditer(text):
        keyword = str(match.group(1) or "").lower()
        raw_phone = match.group(2)
        context = _text_context_window(text, match.start(), match.end())
        kind = "whatsapp" if keyword in WHATSAPP_CONTEXT_TERMS else "phone"
        contact_level = "decision_maker" if any(term in context for term in DECISION_MAKER_TERMS) else "company"
        confidence = 0.82 if kind == "whatsapp" else 0.74
        register(
            raw_phone,
            source_label=f"Outras informacoes ({keyword})",
            kind=kind,
            contact_level=contact_level,
            confidence=confidence,
        )

    for match in FORMATTED_PHONE_PATTERN.finditer(text):
        raw_phone = match.group(0)
        if not _match_contains_phone_formatting(raw_phone):
            continue
        context = _text_context_window(text, match.start(), match.end())
        has_whatsapp_context = any(term in context for term in WHATSAPP_CONTEXT_TERMS)
        has_commercial_context = any(term in context for term in COMMERCIAL_CONTEXT_TERMS)
        if not has_whatsapp_context and not has_commercial_context:
            continue
        register(
            raw_phone,
            source_label="Outras informacoes (contexto comercial)",
            kind="whatsapp" if has_whatsapp_context else "phone",
            contact_level="decision_maker" if any(term in context for term in DECISION_MAKER_TERMS) else "company",
            confidence=0.78 if has_whatsapp_context else 0.68,
        )

    return results


def _score_source(source_label: str) -> float:
    source = str(source_label or "").lower()
    score = 0.56
    if "evolution" in source:
        score += 0.34
    if "google maps" in source:
        score += 0.16
    if "instagram" in source or "link in bio" in source or "linktree" in source:
        score += 0.18
    if "facebook" in source:
        score += 0.14
    if "site" in source or "widget" in source or "whatsapp" in source:
        score += 0.16
    if "site fallback" in source or "scrapling" in source:
        score += 0.10
    if "busca direta" in source:
        score += 0.12
    if "receita" in source:
        score += 0.06
    if "telefone captado" in source or "opencnpj" in source:
        score += 0.08
    if "socio" in source:
        score += 0.12
    if "final" in source:
        score += 0.08
    if "outras informacoes" in source or "contexto comercial" in source:
        score += 0.08
    if "chatbot" in source or "comercial" in source or "vendas" in source:
        score += 0.06
    return min(score, 0.98)


def _phone_type(contact_level: str, *, likely_whatsapp: bool, verified_whatsapp: bool, is_mobile: bool) -> str:
    if verified_whatsapp:
        return "whatsapp_verified"
    if likely_whatsapp and contact_level == "decision_maker":
        return "decision_maker_whatsapp_likely"
    if likely_whatsapp:
        return "company_whatsapp_likely"
    if is_mobile and contact_level == "decision_maker":
        return "decision_maker_mobile"
    if is_mobile:
        return "company_mobile"
    return "company_phone"


def _candidate_stats(candidates: Dict[str, Dict[str, Any]]) -> Dict[str, int]:
    current = list(candidates.values())
    return {
        "mobile_candidates": sum(1 for item in current if _is_mobile_br(item.get("normalized_phone"))),
        "likely_whatsapp_candidates": sum(1 for item in current if item.get("likely_whatsapp")),
        "verified_whatsapp_candidates": sum(1 for item in current if item.get("verified_whatsapp")),
    }


def _needs_deep_mobile_probe(candidates: Dict[str, Dict[str, Any]]) -> bool:
    stats = _candidate_stats(candidates)
    return stats["verified_whatsapp_candidates"] == 0 and (
        stats["likely_whatsapp_candidates"] == 0 or stats["mobile_candidates"] < 2
    )


class MobileIntelligenceService:
    def ensure_schema(self) -> None:
        lead_registry_service.ensure_schema()
        with get_connection(read_only=False) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS company_mobile_summaries (
                    cnpj VARCHAR PRIMARY KEY,
                    summary_json VARCHAR NOT NULL,
                    generated_at TIMESTAMP NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS contact_phone_candidates (
                    id VARCHAR PRIMARY KEY,
                    cnpj VARCHAR NOT NULL,
                    contact_name VARCHAR,
                    contact_role VARCHAR,
                    contact_level VARCHAR NOT NULL,
                    phone VARCHAR NOT NULL,
                    normalized_phone VARCHAR NOT NULL,
                    source_label VARCHAR,
                    source_url VARCHAR,
                    phone_type VARCHAR,
                    kind VARCHAR,
                    score_total DOUBLE,
                    confidence DOUBLE,
                    likely_whatsapp BOOLEAN,
                    verified_whatsapp BOOLEAN,
                    validation_status VARCHAR,
                    validation_source VARCHAR,
                    is_primary BOOLEAN,
                    generated_at TIMESTAMP NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_contact_phone_candidates_cnpj
                ON contact_phone_candidates(cnpj, score_total DESC)
                """
            )

    def _get_columns(self, conn: Any, table_name: str) -> Dict[str, str]:
        try:
            rows = conn.execute(f"PRAGMA table_info('{table_name}')").fetchall()
        except Exception:
            return {}
        mapping: Dict[str, str] = {}
        for row in rows:
            if len(row) > 1 and row[1]:
                mapping[str(row[1]).lower()] = str(row[1])
        return mapping

    def _select_expr(self, columns: Dict[str, str], choices: List[str], alias: str) -> str:
        for choice in choices:
            actual = columns.get(choice.lower())
            if actual:
                return f"{actual} AS {alias}"
        return f"NULL AS {alias}"

    def _load_company_snapshot(self, cnpj: str) -> Dict[str, Any]:
        with get_connection(read_only=True) as conn:
            columns = self._get_columns(conn, "vw_prospeccao_base")
            if not columns:
                raise LookupError("View vw_prospeccao_base indisponivel para mobile intelligence.")

            cnpj_column = columns.get("cnpj") or columns.get("cnpj_completo")
            if not cnpj_column:
                raise LookupError("Coluna de CNPJ nao encontrada na view de prospeccao.")

            query = f"""
                SELECT
                    {self._select_expr(columns, ['cnpj', 'cnpj_completo'], 'cnpj')},
                    {self._select_expr(columns, ['razao_social'], 'razao_social')},
                    {self._select_expr(columns, ['nome_fantasia'], 'nome_fantasia')},
                    {self._select_expr(columns, ['cidade_nome', 'cidade', 'nome_municipio'], 'cidade')},
                    {self._select_expr(columns, ['uf'], 'uf')},
                    {self._select_expr(columns, ['site'], 'site')},
                    {self._select_expr(columns, ['email_receita'], 'email_receita')},
                    {self._select_expr(columns, ['email_enriquecido'], 'email_enriquecido')},
                    {self._select_expr(columns, ['email_final'], 'email_final')},
                    {self._select_expr(columns, ['telefone_padrao', 'telefone_receita', 'telefone1'], 'telefone_base')},
                    {self._select_expr(columns, ['telefone_final'], 'telefone_final')},
                    {self._select_expr(columns, ['telefone_enriquecido'], 'telefone_enriquecido')},
                    {self._select_expr(columns, ['whatsapp_publico'], 'whatsapp_publico')},
                    {self._select_expr(columns, ['whatsapp_enriquecido'], 'whatsapp_enriquecido')},
                    {self._select_expr(columns, ['whatsapp_final'], 'whatsapp_final')},
                    {self._select_expr(columns, ['outras_informacoes'], 'outras_informacoes')},
                    {self._select_expr(columns, ['telefones_captados'], 'telefones_captados')},
                    {self._select_expr(columns, ['whatsapps_captados'], 'whatsapps_captados')},
                    {self._select_expr(columns, ['socios_estruturado'], 'socios_estruturado')}
                FROM vw_prospeccao_base
                WHERE {cnpj_column} = ?
                LIMIT 1
            """
            row = conn.execute(query, [cnpj]).fetchone()
            if not row:
                raise LookupError("Empresa nao encontrada para mobile intelligence.")

        return {
            "cnpj": str(row[0] or cnpj),
            "razao_social": str(row[1] or ""),
            "nome_fantasia": str(row[2]) if row[2] else None,
            "cidade": str(row[3]) if row[3] else None,
            "uf": str(row[4]) if row[4] else None,
            "site": str(row[5]) if row[5] else None,
            "email_receita": str(row[6]) if row[6] else None,
            "email_enriquecido": str(row[7]) if row[7] else None,
            "email_final": str(row[8]) if row[8] else None,
            "telefone_base": str(row[9]) if row[9] else None,
            "telefone_final": str(row[10]) if row[10] else None,
            "telefone_enriquecido": str(row[11]) if row[11] else None,
            "whatsapp_publico": str(row[12]) if row[12] else None,
            "whatsapp_enriquecido": str(row[13]) if row[13] else None,
            "whatsapp_final": str(row[14]) if row[14] else None,
            "outras_informacoes": str(row[15]) if row[15] else None,
            "telefones_captados": _coerce_jsonish(row[16], []),
            "whatsapps_captados": _coerce_jsonish(row[17], []),
            "socios_estruturado": _coerce_jsonish(row[18], []),
        }

    def get_cached_mobile_waterfall(self, cnpj: str) -> Optional[Dict[str, Any]]:
        self.ensure_schema()
        cnpj_clean = _normalize_cnpj(cnpj)
        if not cnpj_clean:
            return None

        with get_connection(read_only=True) as conn:
            summary_row = conn.execute(
                """
                SELECT summary_json, generated_at
                FROM company_mobile_summaries
                WHERE cnpj = ?
                LIMIT 1
                """,
                [cnpj_clean],
            ).fetchone()

            candidate_rows = conn.execute(
                """
                SELECT
                    contact_name,
                    contact_role,
                    contact_level,
                    phone,
                    normalized_phone,
                    source_label,
                    source_url,
                    phone_type,
                    kind,
                    score_total,
                    confidence,
                    likely_whatsapp,
                    verified_whatsapp,
                    validation_status,
                    validation_source,
                    is_primary,
                    generated_at
                FROM contact_phone_candidates
                WHERE cnpj = ?
                ORDER BY is_primary DESC, score_total DESC, phone ASC
                """,
                [cnpj_clean],
            ).fetchall()

        if not summary_row:
            return None

        summary = _coerce_jsonish(summary_row[0], {})
        generated_at = str(summary_row[1]) if summary_row[1] else None
        candidates = [
            {
                "contact_name": str(row[0]) if row[0] else None,
                "contact_role": str(row[1]) if row[1] else None,
                "contact_level": str(row[2]),
                "phone": str(row[3]),
                "normalized_phone": str(row[4]),
                "source_label": str(row[5]) if row[5] else None,
                "source_url": str(row[6]) if row[6] else None,
                "phone_type": str(row[7]) if row[7] else None,
                "kind": str(row[8]) if row[8] else None,
                "score_total": float(row[9]) if row[9] is not None else None,
                "confidence": float(row[10]) if row[10] is not None else None,
                "likely_whatsapp": bool(row[11]),
                "verified_whatsapp": bool(row[12]),
                "validation_status": str(row[13]) if row[13] else None,
                "validation_source": str(row[14]) if row[14] else None,
                "is_primary": bool(row[15]),
                "generated_at": str(row[16]) if row[16] else generated_at,
            }
            for row in candidate_rows
        ]
        return {
            "cnpj": cnpj_clean,
            "summary": summary,
            "generated_at": generated_at,
            "candidates": candidates,
        }

    async def resolve_company_mobile_waterfall(
        self,
        cnpj: str,
        *,
        refresh: bool = False,
        verify_whatsapp: bool = True,
    ) -> Dict[str, Any]:
        self.ensure_schema()
        cnpj_clean = _normalize_cnpj(cnpj)
        if not cnpj_clean:
            raise LookupError("CNPJ invalido para mobile waterfall.")

        if not refresh:
            cached = self.get_cached_mobile_waterfall(cnpj_clean)
            if cached:
                return cached

        snapshot = self._load_company_snapshot(cnpj_clean)
        candidates: Dict[str, Dict[str, Any]] = {}

        def add_candidate(
            raw_phone: Any,
            source_label: str,
            *,
            contact_name: Optional[str] = None,
            contact_role: Optional[str] = None,
            contact_level: str = "company",
            source_url: Optional[str] = None,
            kind: str = "phone",
            validado: bool = False,
            confidence: Optional[float] = None,
        ) -> None:
            normalized_phone = _normalize_phone(raw_phone)
            if not normalized_phone:
                return

            normalized_whatsapp = normalizar_whatsapp_br(raw_phone or "")
            is_mobile = _is_mobile_br(normalized_phone)
            likely_whatsapp = bool(normalized_whatsapp or kind == "whatsapp" or validado)
            verified_whatsapp = bool(validado)

            score = _score_source(source_label)
            if is_mobile:
                score += 0.10
            if contact_level == "decision_maker":
                score += 0.08
            if likely_whatsapp:
                score += 0.10
            if verified_whatsapp:
                score += 0.16
            if confidence is not None:
                try:
                    score += max(0.0, min(float(confidence), 1.0)) * 0.10
                except (TypeError, ValueError):
                    pass

            entry = {
                "contact_name": contact_name,
                "contact_role": contact_role,
                "contact_level": contact_level,
                "phone": str(raw_phone),
                "normalized_phone": normalized_whatsapp or normalized_phone,
                "source_label": source_label,
                "source_url": source_url,
                "kind": kind,
                "confidence": round(min(score, 1.0), 4),
                "score_total": round(min(score, 1.0), 4),
                "likely_whatsapp": likely_whatsapp,
                "verified_whatsapp": verified_whatsapp,
                "validation_status": "verified" if verified_whatsapp else ("likely_whatsapp" if likely_whatsapp else "pending"),
                "validation_source": "existing_validation" if verified_whatsapp else None,
            }
            current = candidates.get(entry["normalized_phone"])
            if current is None or (entry["score_total"] or 0) > (current.get("score_total") or 0):
                candidates[entry["normalized_phone"]] = entry

        add_candidate(snapshot.get("whatsapp_final"), "WhatsApp final", kind="whatsapp", validado=False)
        add_candidate(snapshot.get("whatsapp_enriquecido"), "WhatsApp enriquecido", kind="whatsapp", validado=False)
        add_candidate(snapshot.get("whatsapp_publico"), "WhatsApp publico", kind="whatsapp", validado=False)
        add_candidate(snapshot.get("telefone_final"), "Telefone final", kind="phone")
        add_candidate(snapshot.get("telefone_enriquecido"), "Telefone enriquecido", kind="phone")
        add_candidate(snapshot.get("telefone_base"), "Telefone base", kind="phone")

        for item in snapshot.get("whatsapps_captados") or []:
            if not isinstance(item, dict):
                continue
            add_candidate(
                item.get("valor"),
                str(item.get("origem") or "WhatsApp captado"),
                source_url=item.get("source_url"),
                kind=str(item.get("tipo") or "whatsapp"),
                validado=bool(item.get("validado")),
                confidence=item.get("confianca"),
            )

        for item in snapshot.get("telefones_captados") or []:
            if not isinstance(item, dict):
                continue
            add_candidate(
                item.get("valor"),
                str(item.get("origem") or "Telefone captado"),
                source_url=item.get("source_url"),
                kind=str(item.get("tipo") or "phone"),
                confidence=item.get("confianca"),
            )

        for partner in snapshot.get("socios_estruturado") or []:
            if not isinstance(partner, dict):
                continue
            partner_name = str(partner.get("nome") or "").strip() or None
            partner_role = str(partner.get("qualificacao") or "").strip() or None
            add_candidate(
                partner.get("whatsapp"),
                f"Socio {partner_name or 'decisor'}",
                contact_name=partner_name,
                contact_role=partner_role,
                contact_level="decision_maker",
                kind="whatsapp",
                validado=bool(partner.get("whatsapp_validado")),
            )
            add_candidate(
                partner.get("telefone"),
                f"Socio {partner_name or 'decisor'} telefone",
                contact_name=partner_name,
                contact_role=partner_role,
                contact_level="decision_maker",
                kind="phone",
            )

        for item in _extract_contextual_phones(snapshot.get("outras_informacoes")):
            add_candidate(
                item.get("phone"),
                str(item.get("source_label") or "Outras informacoes"),
                contact_level=str(item.get("contact_level") or "company"),
                kind=str(item.get("kind") or "phone"),
                confidence=float(item.get("confidence") or 0.0),
            )

        if _needs_deep_mobile_probe(candidates):
            for site_candidate in _collect_site_candidates(snapshot)[:2]:
                site_data = await _probe_site_contacts(site_candidate)
                if not isinstance(site_data, dict) or not site_data:
                    continue
                site_source_url = str(site_data.get("site") or site_candidate)
                add_candidate(
                    site_data.get("whatsapp"),
                    str(site_data.get("source") or "Site fallback"),
                    source_url=site_source_url,
                    kind="whatsapp",
                    confidence=0.78,
                )
                add_candidate(
                    site_data.get("telefone"),
                    str(site_data.get("source") or "Site fallback telefone"),
                    source_url=site_source_url,
                    kind="phone",
                    confidence=0.66,
                )
                if not _needs_deep_mobile_probe(candidates):
                    break

        stats_after_site_probe = _candidate_stats(candidates)
        if (
            stats_after_site_probe["verified_whatsapp_candidates"] == 0
            and stats_after_site_probe["likely_whatsapp_candidates"] == 0
        ):
            search_result = await _probe_external_whatsapp_search(
                str(snapshot.get("nome_fantasia") or snapshot.get("razao_social") or ""),
                str(snapshot.get("cidade") or ""),
                str(snapshot.get("cnpj") or cnpj_clean),
            )
            if isinstance(search_result, dict) and search_result:
                add_candidate(
                    search_result.get("whatsapp"),
                    str(search_result.get("whatsapp_source") or "Busca externa"),
                    kind="whatsapp",
                    confidence=0.76,
                )
                add_candidate(
                    search_result.get("phone"),
                    str(search_result.get("phone_source") or "Busca externa telefone"),
                    kind="phone",
                    confidence=0.62,
                )

        ordered = sorted(candidates.values(), key=lambda item: item.get("score_total") or 0, reverse=True)
        if verify_whatsapp:
            to_verify = [item["normalized_phone"] for item in ordered if _is_mobile_br(item["normalized_phone"])][:10]
            if to_verify:
                results = await verificar_whatsapp_lote(to_verify, max_batch=10)
                for item in ordered:
                    result = results.get(item["normalized_phone"])
                    if not result:
                        continue
                    if result.get("valido"):
                        item["verified_whatsapp"] = True
                        item["likely_whatsapp"] = True
                        item["validation_status"] = "verified"
                        item["validation_source"] = str(result.get("metodo") or "evolution_api")
                        item["score_total"] = round(min((item.get("score_total") or 0) + 0.18, 1.0), 4)
                    elif item["likely_whatsapp"]:
                        item["validation_status"] = "checked_not_found"
                        item["validation_source"] = str(result.get("metodo") or "evolution_api")

        for item in ordered:
            item["phone_type"] = _phone_type(
                item.get("contact_level") or "company",
                likely_whatsapp=bool(item.get("likely_whatsapp")),
                verified_whatsapp=bool(item.get("verified_whatsapp")),
                is_mobile=_is_mobile_br(item.get("normalized_phone")),
            )

        ordered.sort(key=lambda item: item.get("score_total") or 0, reverse=True)
        for index, item in enumerate(ordered):
            item["is_primary"] = index == 0
            item["generated_at"] = _utcnow_iso()

        primary = ordered[0] if ordered else None
        summary = {
            "company_name": snapshot.get("nome_fantasia") or snapshot.get("razao_social"),
            "mobile_candidates": sum(1 for item in ordered if _is_mobile_br(item.get("normalized_phone"))),
            "phone_candidates": len(ordered),
            "verified_whatsapp_candidates": sum(1 for item in ordered if item.get("verified_whatsapp")),
            "likely_whatsapp_candidates": sum(1 for item in ordered if item.get("likely_whatsapp")),
            "decision_maker_mobile_candidates": sum(
                1
                for item in ordered
                if item.get("contact_level") == "decision_maker" and _is_mobile_br(item.get("normalized_phone"))
            ),
            "primary_phone": primary.get("normalized_phone") if primary else None,
            "primary_phone_type": primary.get("phone_type") if primary else None,
            "generated_at": _utcnow_iso(),
        }

        payload = {
            "cnpj": cnpj_clean,
            "company": {
                "cnpj": snapshot["cnpj"],
                "razao_social": snapshot.get("razao_social"),
                "nome_fantasia": snapshot.get("nome_fantasia"),
                "cidade": snapshot.get("cidade"),
                "uf": snapshot.get("uf"),
                "site": snapshot.get("site"),
            },
            "summary": summary,
            "generated_at": summary["generated_at"],
            "candidates": ordered,
        }
        self._persist(cnpj_clean, payload)
        return payload

    def _persist(self, cnpj: str, payload: Dict[str, Any]) -> None:
        generated_at = payload.get("generated_at") or _utcnow_iso()
        summary_json = json.dumps(payload.get("summary") or {}, ensure_ascii=False, default=str)

        with get_connection(read_only=False) as conn:
            conn.execute("DELETE FROM contact_phone_candidates WHERE cnpj = ?", [cnpj])
            conn.execute("DELETE FROM company_mobile_summaries WHERE cnpj = ?", [cnpj])
            conn.execute(
                """
                INSERT INTO company_mobile_summaries (cnpj, summary_json, generated_at)
                VALUES (?, ?, ?)
                """,
                [cnpj, summary_json, generated_at],
            )
            for candidate in payload.get("candidates") or []:
                conn.execute(
                    """
                    INSERT INTO contact_phone_candidates (
                        id, cnpj, contact_name, contact_role, contact_level, phone, normalized_phone,
                        source_label, source_url, phone_type, kind, score_total, confidence,
                        likely_whatsapp, verified_whatsapp, validation_status, validation_source,
                        is_primary, generated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        str(uuid4()),
                        cnpj,
                        candidate.get("contact_name"),
                        candidate.get("contact_role"),
                        candidate.get("contact_level") or "company",
                        candidate.get("phone"),
                        candidate.get("normalized_phone"),
                        candidate.get("source_label"),
                        candidate.get("source_url"),
                        candidate.get("phone_type"),
                        candidate.get("kind"),
                        candidate.get("score_total"),
                        candidate.get("confidence"),
                        bool(candidate.get("likely_whatsapp")),
                        bool(candidate.get("verified_whatsapp")),
                        candidate.get("validation_status"),
                        candidate.get("validation_source"),
                        bool(candidate.get("is_primary")),
                        candidate.get("generated_at") or generated_at,
                    ],
                )

    def get_health_center(self, org_id: str, limit: int = 20) -> Dict[str, Any]:
        self.ensure_schema()
        with get_connection(read_only=True) as conn:
            watch_exists = conn.execute(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_name = 'company_watchlist'
                """
            ).fetchone()[0]
            if not watch_exists:
                return {
                    "summary": {
                        "watchlist_total": 0,
                        "without_mobile": 0,
                        "without_verified_whatsapp": 0,
                        "without_decision_maker_mobile": 0,
                        "stale_records": 0,
                    },
                    "items": [],
                }

            rows = conn.execute(
                """
                SELECT
                    w.cnpj,
                    w.razao_social,
                    w.nome_fantasia,
                    w.cidade,
                    w.uf,
                    s.summary_json,
                    s.generated_at
                FROM company_watchlist w
                LEFT JOIN company_mobile_summaries s
                    ON s.cnpj = w.cnpj
                WHERE w.org_id = ?
                ORDER BY COALESCE(w.updated_at, w.created_at) DESC
                """,
                [org_id],
            ).fetchall()

        now = datetime.now(timezone.utc)
        items: List[Dict[str, Any]] = []
        summary = {
            "watchlist_total": len(rows),
            "without_mobile": 0,
            "without_verified_whatsapp": 0,
            "without_decision_maker_mobile": 0,
            "stale_records": 0,
        }

        for row in rows:
            cnpj = str(row[0])
            snapshot = _coerce_jsonish(row[5], {})
            generated_at = row[6]
            generated_dt: Optional[datetime] = None
            if generated_at:
                try:
                    generated_dt = datetime.fromisoformat(str(generated_at).replace("Z", "+00:00"))
                    if generated_dt.tzinfo is None:
                        generated_dt = generated_dt.replace(tzinfo=timezone.utc)
                except Exception:
                    generated_dt = None
            stale = generated_dt is None or generated_dt < (now - timedelta(days=14))
            mobile_candidates = int(snapshot.get("mobile_candidates") or 0)
            verified_whatsapp = int(snapshot.get("verified_whatsapp_candidates") or 0)
            decisor_mobile = int(snapshot.get("decision_maker_mobile_candidates") or 0)

            if mobile_candidates == 0:
                summary["without_mobile"] += 1
            if verified_whatsapp == 0:
                summary["without_verified_whatsapp"] += 1
            if decisor_mobile == 0:
                summary["without_decision_maker_mobile"] += 1
            if stale:
                summary["stale_records"] += 1

            gap_score = (
                (2 if mobile_candidates == 0 else 0)
                + (2 if verified_whatsapp == 0 else 0)
                + (1 if decisor_mobile == 0 else 0)
                + (1 if stale else 0)
            )
            items.append(
                {
                    "cnpj": cnpj,
                    "razao_social": str(row[1]) if row[1] else None,
                    "nome_fantasia": str(row[2]) if row[2] else None,
                    "cidade": str(row[3]) if row[3] else None,
                    "uf": str(row[4]) if row[4] else None,
                    "mobile_candidates": mobile_candidates,
                    "verified_whatsapp_candidates": verified_whatsapp,
                    "decision_maker_mobile_candidates": decisor_mobile,
                    "stale": stale,
                    "generated_at": str(generated_at) if generated_at else None,
                    "gap_score": gap_score,
                }
            )

        items.sort(key=lambda item: (item["gap_score"], item["stale"]), reverse=True)
        return {"summary": summary, "items": items[: max(1, min(limit, 50))]}


mobile_intelligence_service = MobileIntelligenceService()
