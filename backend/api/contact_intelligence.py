from __future__ import annotations

import asyncio
import json
import logging
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

from api.db_pool import get_connection
from api.enrichment_merge import merge_enrichment_payload
from api.validation_service import validar_email, verificar_dominio_registrobr

try:
    from core_scraper import processar_empresa_google
except ImportError:
    processar_empresa_google = None  # type: ignore


logger = logging.getLogger(__name__)

GENERIC_INBOX_LOCALS = {
    "admin",
    "ajuda",
    "atendimento",
    "comercial",
    "compras",
    "contato",
    "contatos",
    "financeiro",
    "fiscal",
    "hello",
    "imprensa",
    "info",
    "juridico",
    "marketing",
    "naoresponder",
    "noreply",
    "no-reply",
    "oi",
    "ouvidoria",
    "privacidade",
    "rh",
    "sac",
    "suporte",
    "vendas",
}

PERSON_NAME_BLACKLIST = {
    "administradora",
    "associacao",
    "comercio",
    "construtora",
    "consultoria",
    "empresa",
    "empreendimentos",
    "engenharia",
    "grupo",
    "holding",
    "industria",
    "instituto",
    "ltda",
    "me",
    "eireli",
    "sa",
    "s.a",
    "servicos",
    "transportes",
}

ROLE_SCORE_HINTS = {
    "administrador": 0.95,
    "socio-administrador": 1.0,
    "socio administrador": 1.0,
    "diretor": 0.92,
    "diretor presidente": 0.98,
    "presidente": 0.98,
    "ceo": 1.0,
    "proprietario": 0.95,
    "titular": 0.9,
    "fundador": 0.92,
    "procurador": 0.76,
    "socio": 0.78,
}

THREE_LEVEL_SUFFIXES = {
    "com.br",
    "org.br",
    "net.br",
    "gov.br",
    "edu.br",
}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", normalized.lower()).strip()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", _normalize_text(value))


def _normalize_name(name: str) -> str:
    return " ".join(part for part in _normalize_text(name).split() if part)


def _name_tokens(name: str) -> List[str]:
    return [token for token in _normalize_name(name).split() if len(token) > 1]


def _looks_like_person(name: str) -> bool:
    tokens = _name_tokens(name)
    if len(tokens) < 2:
        return False
    if any(char.isdigit() for char in name):
        return False
    if any(token in PERSON_NAME_BLACKLIST for token in tokens):
        return False
    return True


def _extract_host(url_or_domain: str) -> str:
    raw = str(url_or_domain or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlparse(raw if "://" in raw else f"https://{raw}")
        host = (parsed.hostname or "").lower()
    except Exception:
        host = raw.lower()
    return host.replace("www.", "").strip(".")


def _registrable_domain(host_or_url: str) -> str:
    host = _extract_host(host_or_url)
    if not host:
        return ""
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    if ".".join(parts[-2:]) in THREE_LEVEL_SUFFIXES and len(parts) >= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def _is_generic_local(local_part: str) -> bool:
    cleaned = re.sub(r"[^a-z]", "", str(local_part or "").lower())
    return cleaned in GENERIC_INBOX_LOCALS


def _site_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = f"https://{raw}"
    return raw.rstrip("/")


def _pattern_builders() -> dict[str, Callable[[List[str]], Optional[str]]]:
    def first(tokens: List[str]) -> Optional[str]:
        return tokens[0] if tokens else None

    def first_last(tokens: List[str]) -> Optional[str]:
        return f"{tokens[0]}.{tokens[-1]}" if len(tokens) >= 2 else None

    def first_last_compact(tokens: List[str]) -> Optional[str]:
        return f"{tokens[0]}{tokens[-1]}" if len(tokens) >= 2 else None

    def first_initial_last(tokens: List[str]) -> Optional[str]:
        return f"{tokens[0][0]}{tokens[-1]}" if len(tokens) >= 2 else None

    def first_initial_dot_last(tokens: List[str]) -> Optional[str]:
        return f"{tokens[0][0]}.{tokens[-1]}" if len(tokens) >= 2 else None

    def first_last_initial(tokens: List[str]) -> Optional[str]:
        return f"{tokens[0]}{tokens[-1][0]}" if len(tokens) >= 2 else None

    def first_underscore_last(tokens: List[str]) -> Optional[str]:
        return f"{tokens[0]}_{tokens[-1]}" if len(tokens) >= 2 else None

    def last_dot_first(tokens: List[str]) -> Optional[str]:
        return f"{tokens[-1]}.{tokens[0]}" if len(tokens) >= 2 else None

    return {
        "first": first,
        "first.last": first_last,
        "firstlast": first_last_compact,
        "flast": first_initial_last,
        "f.last": first_initial_dot_last,
        "firstl": first_last_initial,
        "first_last": first_underscore_last,
        "last.first": last_dot_first,
    }


EMAIL_PATTERN_BUILDERS = _pattern_builders()
DEFAULT_PATTERN_ORDER = ["first.last", "first", "flast", "f.last", "firstlast", "firstl"]


def infer_pattern_for_name_email(name: str, email: str, domain: str) -> Optional[str]:
    normalized_email = _normalize_email(email)
    if "@" not in normalized_email:
        return None
    local_part, email_domain = normalized_email.split("@", 1)
    if domain and _registrable_domain(email_domain) != _registrable_domain(domain):
        return None
    if _is_generic_local(local_part):
        return None

    tokens = _name_tokens(name)
    if len(tokens) < 2:
        return None

    for pattern, builder in EMAIL_PATTERN_BUILDERS.items():
        generated = builder(tokens)
        if generated and generated == local_part:
            return pattern
    return None


def generate_candidate_emails(name: str, domain: str, pattern: Optional[str] = None) -> List[dict[str, Any]]:
    registrable = _registrable_domain(domain)
    if not registrable:
        return []

    tokens = _name_tokens(name)
    if len(tokens) < 2:
        return []

    patterns = [pattern] if pattern else []
    for fallback in DEFAULT_PATTERN_ORDER:
        if fallback not in patterns:
            patterns.append(fallback)

    candidates: List[dict[str, Any]] = []
    seen = set()
    for idx, current_pattern in enumerate(patterns):
        builder = EMAIL_PATTERN_BUILDERS.get(current_pattern)
        if builder is None:
            continue
        local_part = builder(tokens)
        if not local_part or _is_generic_local(local_part):
            continue
        email = f"{local_part}@{registrable}"
        if email in seen:
            continue
        seen.add(email)
        candidates.append(
            {
                "email": email,
                "kind": "guessed",
                "pattern": current_pattern,
                "pattern_confidence": 0.8 if current_pattern == pattern else max(0.35, 0.65 - (idx * 0.08)),
                "source_label": "Hermes Pattern Inference",
                "source_url": _site_url(registrable),
                "evidence": [
                    {
                        "type": "pattern_inference",
                        "label": f"Padrao {current_pattern}",
                        "source_url": _site_url(registrable),
                    }
                ],
            }
        )
    return candidates


def classify_verification_status(validation: Dict[str, Any]) -> str:
    if not validation:
        return "unknown"
    if validation.get("smtp_status") == "accepted":
        return "verified"
    if validation.get("smtp_status") == "rejected":
        return "invalid"
    if validation.get("valido"):
        return "deliverable"
    if validation.get("mx_valido"):
        if validation.get("smtp_status") in {"tempfail", "unknown", "unreachable", "sender_rejected"}:
            return "risky"
        return "mx_only"
    if validation.get("dominio_descartavel"):
        return "invalid"
    if validation.get("formato_valido") and validation.get("dominio_valido"):
        return "unknown"
    return "invalid"


class ContactIntelligenceService:
    def ensure_schema(self) -> None:
        with get_connection(read_only=False) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS company_domains (
                    cnpj VARCHAR PRIMARY KEY,
                    domain VARCHAR,
                    site_url VARCHAR,
                    domain_source VARCHAR,
                    source_url VARCHAR,
                    linkedin_company VARCHAR,
                    email_pattern VARCHAR,
                    pattern_confidence DOUBLE,
                    metadata_json VARCHAR,
                    generated_at TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS company_contacts (
                    cnpj VARCHAR,
                    contact_name VARCHAR,
                    role VARCHAR,
                    linkedin_url VARCHAR,
                    source_label VARCHAR,
                    generated_at TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS contact_emails (
                    cnpj VARCHAR,
                    contact_name VARCHAR,
                    role VARCHAR,
                    email VARCHAR,
                    email_kind VARCHAR,
                    pattern VARCHAR,
                    pattern_confidence DOUBLE,
                    source_label VARCHAR,
                    source_url VARCHAR,
                    verification_status VARCHAR,
                    verification_score DOUBLE,
                    score_total DOUBLE,
                    source_score DOUBLE,
                    role_score DOUBLE,
                    freshness_score DOUBLE,
                    is_primary BOOLEAN,
                    generated_at TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS contact_email_evidence (
                    cnpj VARCHAR,
                    contact_name VARCHAR,
                    email VARCHAR,
                    evidence_type VARCHAR,
                    source_label VARCHAR,
                    source_url VARCHAR,
                    snippet VARCHAR,
                    observed_at TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS contact_verifications (
                    cnpj VARCHAR,
                    email VARCHAR,
                    checked_at TIMESTAMP,
                    status VARCHAR,
                    score DOUBLE,
                    dns_status VARCHAR,
                    mx_valido BOOLEAN,
                    smtp_status VARCHAR,
                    metodo VARCHAR,
                    motivo VARCHAR,
                    raw_json VARCHAR
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS contact_scores (
                    cnpj VARCHAR,
                    contact_name VARCHAR,
                    email VARCHAR,
                    score_total DOUBLE,
                    source_score DOUBLE,
                    role_score DOUBLE,
                    freshness_score DOUBLE,
                    generated_at TIMESTAMP
                )
                """
            )

    def get_cached_company_intelligence(self, cnpj: str) -> Optional[Dict[str, Any]]:
        self.ensure_schema()
        with get_connection(read_only=True) as conn:
            row = conn.execute(
                "SELECT metadata_json FROM company_domains WHERE cnpj = ? LIMIT 1",
                [cnpj],
            ).fetchone()
        if not row or not row[0]:
            return None
        try:
            return json.loads(row[0])
        except Exception as exc:
            logger.warning("Falha ao desserializar contact intelligence de %s: %s", cnpj, exc)
            return None

    async def resolve_company_intelligence(self, cnpj: str, probe_smtp: bool = False) -> Dict[str, Any]:
        self.ensure_schema()
        company = self._fetch_company(cnpj)
        merged = await self._build_merged_company(company)
        intelligence = await self._build_intelligence(merged, probe_smtp=probe_smtp)
        self._persist(cnpj, intelligence)
        return intelligence

    def _fetch_company(self, cnpj: str) -> Dict[str, Any]:
        with get_connection(read_only=True) as conn:
            row = conn.execute(
                """
                SELECT
                    e.CNPJ_COMPLETO,
                    e.RAZAO_SOCIAL,
                    e.NOME_FANTASIA,
                    m.NOME_MUNICIPIO,
                    e.UF,
                    e.CNAE_PRINCIPAL,
                    e.EMAIL,
                    e.TELEFONE1,
                    ew.site,
                    ew.email_enriquecido,
                    ew.telefone_enriquecido,
                    ew.whatsapp_publico,
                    ew.whatsapp_enriquecido,
                    ew.outras_informacoes
                FROM cnpj_empresas e
                LEFT JOIN municipios m
                    ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
                LEFT JOIN empresas_enriquecidas ew
                    ON ew.cnpj = e.CNPJ_COMPLETO
                WHERE e.CNPJ_COMPLETO = ?
                LIMIT 1
                """,
                [cnpj],
            ).fetchone()
            if not row:
                raise LookupError("Empresa nao encontrada")

            socios_rows = conn.execute(
                """
                SELECT
                    COALESCE(NOME_SOCIO, ''),
                    COALESCE(QUALIFICACAO_SOCIO, '')
                FROM socios
                WHERE CNPJ_BASICO = ?
                """,
                [str(cnpj)[:8]],
            ).fetchall()

        socios_estruturado = []
        for nome, qualificacao in socios_rows:
            nome_limpo = str(nome or "").strip()
            if not nome_limpo:
                continue
            socios_estruturado.append(
                {
                    "nome": nome_limpo,
                    "qualificacao": str(qualificacao or "").strip() or None,
                }
            )

        return {
            "cnpj": str(row[0]),
            "razao_social": str(row[1] or ""),
            "nome_fantasia": str(row[2]) if row[2] else None,
            "cidade": str(row[3]) if row[3] else None,
            "uf": str(row[4]) if row[4] else None,
            "cnae_principal": str(row[5]) if row[5] else None,
            "email": str(row[6]) if row[6] else None,
            "telefone_padrao": str(row[7]) if row[7] else None,
            "telefone_receita": str(row[7]) if row[7] else None,
            "site": str(row[8]) if row[8] else None,
            "email_enriquecido": str(row[9]) if row[9] else None,
            "telefone_enriquecido": str(row[10]) if row[10] else None,
            "whatsapp_publico": str(row[11]) if row[11] else None,
            "whatsapp_enriquecido": str(row[12]) if row[12] else None,
            "outras_informacoes": str(row[13]) if row[13] else None,
            "socios_estruturado": socios_estruturado or None,
        }

    async def _build_merged_company(self, company: Dict[str, Any]) -> Dict[str, Any]:
        socios = [item["nome"] for item in (company.get("socios_estruturado") or []) if item.get("nome")]
        payload: Dict[str, Any] = {}

        if processar_empresa_google is not None:
            try:
                online = await processar_empresa_google(
                    empresa_nome=company.get("nome_fantasia") or company.get("razao_social") or "",
                    cnpj=company.get("cnpj") or "",
                    cidade=company.get("cidade") or "",
                    socios=socios,
                    site_url=company.get("site") or "",
                    modo_rapido=False,
                )
            except Exception as exc:
                logger.warning("Contact intelligence scraping falhou para %s: %s", company.get("cnpj"), exc)
                online = {}
        else:
            online = {}

        if online:
            payload = {
                "site": online.get("site"),
                "linkedin_empresa": online.get("linkedin_empresa"),
                "redes_socios": online.get("redes_socios") or [],
                "contatos_web": {
                    "email_enriquecido": online.get("email"),
                    "telefone_enriquecido": online.get("telefone"),
                    "whatsapp_enriquecido": online.get("whatsapp"),
                    "origem": online.get("contatos_source") or online.get("origem") or "Core Scraper",
                },
                "source": online.get("origem") or "Core Scraper",
            }

            domain = _registrable_domain(online.get("site") or company.get("site") or company.get("email") or "")
            if domain.endswith(".br"):
                try:
                    registro = verificar_dominio_registrobr(domain)
                except Exception as exc:
                    logger.warning("Registro.br falhou para %s: %s", domain, exc)
                    registro = {}
                if registro.get("valido"):
                    payload["dados_registro"] = {
                        "proprietario": registro.get("owner"),
                        "email_proprietario": registro.get("owner_email"),
                    }

        merged = {**company}
        if payload:
            merged.update(merge_enrichment_payload(company, payload))
        return merged

    async def _build_intelligence(self, company: Dict[str, Any], probe_smtp: bool) -> Dict[str, Any]:
        generated_at = _utcnow_iso()
        domain = self._resolve_company_domain(company)
        public_emails = self._collect_public_emails(company, domain)
        contacts = self._build_contacts(company, domain, public_emails)
        await self._validate_contact_emails(contacts, probe_smtp=probe_smtp)
        self._mark_primary_emails(contacts)

        pattern_data = self._infer_company_pattern(company, domain, public_emails, contacts)
        self._augment_guessed_contacts(contacts, company, domain, pattern_data)
        await self._validate_contact_emails(contacts, probe_smtp=probe_smtp)
        self._mark_primary_emails(contacts)

        generic_inboxes = self._build_generic_inboxes(public_emails)
        company_profiles = self._company_profiles(company)
        summary = self._build_summary(contacts, generic_inboxes)

        return {
            "company": {
                "cnpj": company.get("cnpj"),
                "razao_social": company.get("razao_social"),
                "nome_fantasia": company.get("nome_fantasia"),
                "cidade": company.get("cidade"),
                "uf": company.get("uf"),
                "site": company.get("site"),
            },
            "domain_profile": {
                "domain": domain or None,
                "site_url": _site_url(company.get("site")),
                "resolved_from": "site" if company.get("site") else ("email" if company.get("email") or company.get("email_enriquecido") else "unknown"),
                "email_pattern": pattern_data["pattern"],
                "pattern_confidence": pattern_data["confidence"],
                "linkedin_company": company.get("linkedin_empresa"),
                "public_emails": public_emails,
                "generic_inboxes": generic_inboxes,
                "company_profiles": company_profiles,
            },
            "contacts": contacts,
            "summary": summary,
            "generated_at": generated_at,
        }

    def _resolve_company_domain(self, company: Dict[str, Any]) -> str:
        for candidate in (
            company.get("site"),
            company.get("email_enriquecido"),
            company.get("email"),
            company.get("registro_email"),
        ):
            domain = _registrable_domain(str(candidate or ""))
            if domain:
                return domain
        return ""

    def _collect_public_emails(self, company: Dict[str, Any], domain: str) -> List[Dict[str, Any]]:
        emails: List[Dict[str, Any]] = []
        for item in company.get("emails_captados") or []:
            email = _normalize_email(item.get("valor") or "")
            if not email:
                continue
            source_label = str(item.get("origem") or "Fonte publica")
            source_url = _site_url(company.get("site"))
            validation = item if isinstance(item, dict) else {}
            emails.append(
                {
                    "email": email,
                    "kind": "sourced",
                    "source_label": source_label,
                    "source_url": source_url,
                    "validation": {
                        "valido": validation.get("validado"),
                        "score": validation.get("score_validacao"),
                        "metodo": validation.get("metodo_validacao"),
                        "motivo": validation.get("motivo_validacao"),
                        "mx_valido": validation.get("mx_valido"),
                        "smtp_status": validation.get("smtp_status"),
                    }
                    if validation
                    else {},
                    "evidence": [
                        {
                            "type": "public_source",
                            "label": source_label,
                            "source_url": source_url,
                        }
                    ],
                }
            )

        extra_sources = [
            (company.get("email_enriquecido"), "Hermes Enrichment"),
            (company.get("email"), "Receita Federal"),
            (company.get("registro_email"), "Registro.br"),
        ]
        for email, label in extra_sources:
            normalized = _normalize_email(email or "")
            if not normalized:
                continue
            emails.append(
                {
                    "email": normalized,
                    "kind": "sourced",
                    "source_label": label,
                    "source_url": _site_url(company.get("site")),
                    "evidence": [
                        {
                            "type": "public_source" if label != "Hermes Enrichment" else "hermes_enrichment",
                            "label": label,
                            "source_url": _site_url(company.get("site")),
                        }
                    ],
                }
            )

        unique: Dict[str, Dict[str, Any]] = {}
        for item in emails:
            email = item["email"]
            if domain and _registrable_domain(email.split("@", 1)[1]) != domain:
                if item.get("source_label") != "Registro.br":
                    continue
            if email not in unique:
                unique[email] = item
                continue
            merged = unique[email]
            merged["evidence"] = list(merged.get("evidence") or []) + list(item.get("evidence") or [])
            if not merged.get("source_label") and item.get("source_label"):
                merged["source_label"] = item["source_label"]
        return list(unique.values())

    def _build_contacts(self, company: Dict[str, Any], domain: str, public_emails: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        linkedin_by_name = {
            _slug(item.get("nome") or ""): item.get("linkedin")
            for item in company.get("socios_estruturado") or []
            if item.get("linkedin")
        }
        contacts: List[Dict[str, Any]] = []
        for contact in company.get("socios_estruturado") or []:
            name = str(contact.get("nome") or "").strip()
            if not _looks_like_person(name):
                continue
            role = str(contact.get("qualificacao") or "").strip() or None
            linkedin = contact.get("linkedin") or linkedin_by_name.get(_slug(name))
            sourced = self._contact_sourced_emails(name, public_emails, domain)
            emails = list(sourced)

            direct_email = _normalize_email(contact.get("email") or "")
            if direct_email and direct_email not in {item["email"] for item in emails}:
                emails.append(
                    {
                        "email": direct_email,
                        "kind": "sourced",
                        "source_label": contact.get("fonte_contato") or "Contato resolvido",
                        "source_url": _site_url(company.get("site")),
                        "evidence": [
                            {
                                "type": "resolved_contact",
                                "label": contact.get("fonte_contato") or "Contato resolvido",
                                "source_url": _site_url(company.get("site")),
                            }
                        ],
                    }
                )

            contacts.append(
                {
                    "name": name,
                    "role": role,
                    "linkedin": linkedin,
                    "source": "Receita Federal",
                    "emails": emails,
                }
            )
        return contacts

    def _contact_sourced_emails(self, name: str, public_emails: List[Dict[str, Any]], domain: str) -> List[Dict[str, Any]]:
        matches = []
        for item in public_emails:
            email = item.get("email") or ""
            local = email.split("@", 1)[0]
            if _is_generic_local(local):
                continue
            if domain and _registrable_domain(email.split("@", 1)[1]) != domain:
                continue
            if infer_pattern_for_name_email(name, email, domain):
                matches.append(item)
                continue
            tokens = _name_tokens(name)
            if len(tokens) >= 2 and tokens[0] in local and tokens[-1] in local:
                matches.append(item)
        return matches

    def _infer_company_pattern(
        self,
        company: Dict[str, Any],
        domain: str,
        public_emails: List[Dict[str, Any]],
        contacts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not domain:
            return {"pattern": None, "confidence": 0.0}

        counter: Counter[str] = Counter()
        for item in public_emails:
            email = item.get("email") or ""
            if "@" not in email:
                continue
            for contact in contacts:
                pattern = infer_pattern_for_name_email(contact["name"], email, domain)
                if pattern:
                    counter[pattern] += 1

        if not counter:
            for contact in contacts:
                for email_entry in contact.get("emails") or []:
                    pattern = infer_pattern_for_name_email(contact["name"], email_entry.get("email") or "", domain)
                    if pattern:
                        counter[pattern] += 1

        if not counter:
            return {"pattern": None, "confidence": 0.0}

        pattern, hits = counter.most_common(1)[0]
        total = sum(counter.values()) or 1
        confidence = min(0.98, 0.45 + (hits / total) * 0.5)
        return {"pattern": pattern, "confidence": round(confidence, 4)}

    def _augment_guessed_contacts(
        self,
        contacts: List[Dict[str, Any]],
        company: Dict[str, Any],
        domain: str,
        pattern_data: Dict[str, Any],
    ) -> None:
        if not domain:
            return
        pattern = pattern_data.get("pattern")
        confidence = float(pattern_data.get("confidence") or 0.0)
        for contact in contacts:
            existing_emails = {item.get("email") for item in contact.get("emails") or []}
            candidates = generate_candidate_emails(contact["name"], domain, pattern=pattern)
            trimmed = 2 if pattern else 3
            for candidate in candidates[:trimmed]:
                if candidate["email"] in existing_emails:
                    continue
                candidate["pattern_confidence"] = max(candidate["pattern_confidence"], confidence)
                candidate["source_url"] = _site_url(company.get("site"))
                contact.setdefault("emails", []).append(candidate)

    async def _validate_contact_emails(self, contacts: List[Dict[str, Any]], probe_smtp: bool) -> None:
        unique_emails: Dict[str, Dict[str, Any]] = {}
        for contact in contacts:
            for email_entry in contact.get("emails") or []:
                email = _normalize_email(email_entry.get("email") or "")
                if email and email not in unique_emails:
                    unique_emails[email] = email_entry

        async def _validate(email: str) -> tuple[str, Dict[str, Any]]:
            result = await asyncio.to_thread(validar_email, email, probe_smtp)
            return email, result

        validations = dict(await asyncio.gather(*[_validate(email) for email in unique_emails])) if unique_emails else {}

        for contact in contacts:
            role_score = self._role_score(contact.get("role"))
            for email_entry in contact.get("emails") or []:
                email = _normalize_email(email_entry.get("email") or "")
                validation = validations.get(email) or email_entry.get("validation") or {}
                email_entry["verification"] = validation
                email_entry["verification_status"] = classify_verification_status(validation)
                email_entry["verification_score"] = float(validation.get("score") or 0.0)
                email_entry["source_score"] = self._source_score(email_entry)
                email_entry["role_score"] = role_score
                email_entry["freshness_score"] = 0.6
                email_entry["score_total"] = self._total_score(email_entry)

    def _mark_primary_emails(self, contacts: List[Dict[str, Any]]) -> None:
        for contact in contacts:
            emails = [item for item in contact.get("emails") or [] if item.get("email")]
            emails.sort(key=lambda item: float(item.get("score_total") or 0.0), reverse=True)
            for idx, item in enumerate(emails):
                item["is_primary"] = idx == 0
            contact["emails"] = emails

    def _build_generic_inboxes(self, public_emails: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        inboxes = []
        for item in public_emails:
            email = item.get("email") or ""
            local = email.split("@", 1)[0] if "@" in email else ""
            if not _is_generic_local(local):
                continue
            inboxes.append(
                {
                    "email": email,
                    "source_label": item.get("source_label"),
                    "source_url": item.get("source_url"),
                }
            )
        return inboxes

    def _company_profiles(self, company: Dict[str, Any]) -> List[Dict[str, str]]:
        profiles = []
        if company.get("linkedin_empresa"):
            profiles.append({"type": "linkedin", "url": company["linkedin_empresa"]})
        for link in company.get("redes_sociais_empresa") or []:
            url = str(link or "").strip()
            if not url:
                continue
            if "linkedin.com" in url and not any(item["url"] == url for item in profiles):
                profiles.append({"type": "linkedin", "url": url})
            elif "instagram.com" in url and not any(item["url"] == url for item in profiles):
                profiles.append({"type": "instagram", "url": url})
            elif "facebook.com" in url and not any(item["url"] == url for item in profiles):
                profiles.append({"type": "facebook", "url": url})
        return profiles

    def _build_summary(self, contacts: List[Dict[str, Any]], generic_inboxes: List[Dict[str, Any]]) -> Dict[str, Any]:
        all_emails = [email for contact in contacts for email in (contact.get("emails") or [])]
        return {
            "decision_makers": len(contacts),
            "total_contact_emails": len(all_emails),
            "verified": sum(1 for item in all_emails if item.get("verification_status") == "verified"),
            "deliverable": sum(1 for item in all_emails if item.get("verification_status") in {"verified", "deliverable", "mx_only"}),
            "risky": sum(1 for item in all_emails if item.get("verification_status") == "risky"),
            "guessed": sum(1 for item in all_emails if item.get("kind") == "guessed"),
            "sourced": sum(1 for item in all_emails if item.get("kind") == "sourced"),
            "generic_inboxes": len(generic_inboxes),
        }

    def _source_score(self, email_entry: Dict[str, Any]) -> float:
        if email_entry.get("kind") == "sourced":
            label = str(email_entry.get("source_label") or "").lower()
            if "registro.br" in label:
                return 0.72
            if "receita" in label:
                return 0.7
            if "hermes" in label or "scraper" in label:
                return 0.82
            return 0.78
        return 0.45 + (float(email_entry.get("pattern_confidence") or 0.0) * 0.4)

    def _role_score(self, role: Optional[str]) -> float:
        role_text = _normalize_text(role or "")
        if not role_text:
            return 0.55
        for hint, score in ROLE_SCORE_HINTS.items():
            if hint in role_text:
                return score
        return 0.6

    def _total_score(self, email_entry: Dict[str, Any]) -> float:
        source_score = float(email_entry.get("source_score") or 0.0)
        verification_score = float(email_entry.get("verification_score") or 0.0)
        role_score = float(email_entry.get("role_score") or 0.0)
        freshness_score = float(email_entry.get("freshness_score") or 0.0)
        total = (source_score * 0.38) + (verification_score * 0.36) + (role_score * 0.2) + (freshness_score * 0.06)
        return round(max(0.0, min(1.0, total)), 4)

    def _persist(self, cnpj: str, intelligence: Dict[str, Any]) -> None:
        generated_at = intelligence.get("generated_at") or _utcnow_iso()
        domain_profile = intelligence.get("domain_profile") or {}
        contacts = intelligence.get("contacts") or []

        with get_connection(read_only=False) as conn:
            for table in (
                "company_domains",
                "company_contacts",
                "contact_emails",
                "contact_email_evidence",
                "contact_verifications",
                "contact_scores",
            ):
                conn.execute(f"DELETE FROM {table} WHERE cnpj = ?", [cnpj])

            conn.execute(
                """
                INSERT INTO company_domains (
                    cnpj,
                    domain,
                    site_url,
                    domain_source,
                    source_url,
                    linkedin_company,
                    email_pattern,
                    pattern_confidence,
                    metadata_json,
                    generated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    cnpj,
                    domain_profile.get("domain"),
                    domain_profile.get("site_url"),
                    domain_profile.get("resolved_from"),
                    domain_profile.get("site_url"),
                    domain_profile.get("linkedin_company"),
                    domain_profile.get("email_pattern"),
                    float(domain_profile.get("pattern_confidence") or 0.0),
                    json.dumps(intelligence, ensure_ascii=False),
                    generated_at,
                ],
            )

            for contact in contacts:
                conn.execute(
                    """
                    INSERT INTO company_contacts (
                        cnpj,
                        contact_name,
                        role,
                        linkedin_url,
                        source_label,
                        generated_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    [
                        cnpj,
                        contact.get("name"),
                        contact.get("role"),
                        contact.get("linkedin"),
                        contact.get("source"),
                        generated_at,
                    ],
                )

                for email_entry in contact.get("emails") or []:
                    verification = email_entry.get("verification") or {}
                    conn.execute(
                        """
                        INSERT INTO contact_emails (
                            cnpj,
                            contact_name,
                            role,
                            email,
                            email_kind,
                            pattern,
                            pattern_confidence,
                            source_label,
                            source_url,
                            verification_status,
                            verification_score,
                            score_total,
                            source_score,
                            role_score,
                            freshness_score,
                            is_primary,
                            generated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            cnpj,
                            contact.get("name"),
                            contact.get("role"),
                            email_entry.get("email"),
                            email_entry.get("kind"),
                            email_entry.get("pattern"),
                            float(email_entry.get("pattern_confidence") or 0.0),
                            email_entry.get("source_label"),
                            email_entry.get("source_url"),
                            email_entry.get("verification_status"),
                            float(email_entry.get("verification_score") or 0.0),
                            float(email_entry.get("score_total") or 0.0),
                            float(email_entry.get("source_score") or 0.0),
                            float(email_entry.get("role_score") or 0.0),
                            float(email_entry.get("freshness_score") or 0.0),
                            bool(email_entry.get("is_primary")),
                            generated_at,
                        ],
                    )

                    conn.execute(
                        """
                        INSERT INTO contact_verifications (
                            cnpj,
                            email,
                            checked_at,
                            status,
                            score,
                            dns_status,
                            mx_valido,
                            smtp_status,
                            metodo,
                            motivo,
                            raw_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            cnpj,
                            email_entry.get("email"),
                            generated_at,
                            email_entry.get("verification_status"),
                            float(email_entry.get("verification_score") or 0.0),
                            verification.get("dns_status"),
                            bool(verification.get("mx_valido")),
                            verification.get("smtp_status"),
                            verification.get("metodo"),
                            verification.get("motivo"),
                            json.dumps(verification, ensure_ascii=False),
                        ],
                    )

                    conn.execute(
                        """
                        INSERT INTO contact_scores (
                            cnpj,
                            contact_name,
                            email,
                            score_total,
                            source_score,
                            role_score,
                            freshness_score,
                            generated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            cnpj,
                            contact.get("name"),
                            email_entry.get("email"),
                            float(email_entry.get("score_total") or 0.0),
                            float(email_entry.get("source_score") or 0.0),
                            float(email_entry.get("role_score") or 0.0),
                            float(email_entry.get("freshness_score") or 0.0),
                            generated_at,
                        ],
                    )

                    for evidence in email_entry.get("evidence") or []:
                        conn.execute(
                            """
                            INSERT INTO contact_email_evidence (
                                cnpj,
                                contact_name,
                                email,
                                evidence_type,
                                source_label,
                                source_url,
                                snippet,
                                observed_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            [
                                cnpj,
                                contact.get("name"),
                                email_entry.get("email"),
                                evidence.get("type"),
                                evidence.get("label"),
                                evidence.get("source_url"),
                                evidence.get("snippet"),
                                generated_at,
                            ],
                        )


contact_intelligence_service = ContactIntelligenceService()
