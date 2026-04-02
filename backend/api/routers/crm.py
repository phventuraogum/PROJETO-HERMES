from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import re
import asyncio
import logging
import requests

from config import settings
from middleware.auth import require_auth

logger = logging.getLogger("hermes.crm")

router = APIRouter()

PLOOMES_BASE = "https://api2.ploomes.com"


class LeadExportPayload(BaseModel):
    cnpj: Optional[str] = None
    razao_social: str
    nome_fantasia: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    whatsapp: Optional[str] = None
    site: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    segmento: Optional[str] = None
    porte: Optional[str] = None
    capital_social: Optional[float] = None
    observacoes: Optional[str] = None


class CrmExportRequest(BaseModel):
    provider: str
    api_key: str
    lead: LeadExportPayload
    funnel_id: Optional[int] = None
    create_deal: bool = True
    kommo_subdomain: Optional[str] = None


# ─── PIPEDRIVE ──────────────────────────────────────────────

def _export_pipedrive(api_key: str, lead: LeadExportPayload) -> dict:
    org_r = requests.post(
        "https://api.pipedrive.com/v1/organizations",
        params={"api_token": api_key},
        json={"name": lead.razao_social, "address": f"{lead.cidade or ''}, {lead.uf or ''}"},
        timeout=15,
    )
    org_id = org_r.json().get("data", {}).get("id") if org_r.status_code < 300 else None

    person_body = {"name": lead.nome_fantasia or lead.razao_social}
    if lead.email:
        person_body["email"] = [{"value": lead.email, "primary": True}]
    if lead.telefone or lead.whatsapp:
        person_body["phone"] = [{"value": lead.telefone or lead.whatsapp, "primary": True}]
    if org_id:
        person_body["org_id"] = org_id

    p_r = requests.post(
        "https://api.pipedrive.com/v1/persons",
        params={"api_token": api_key},
        json=person_body,
        timeout=15,
    )
    if p_r.status_code >= 300:
        raise HTTPException(status_code=p_r.status_code, detail=f"Pipedrive: {p_r.text}")

    return {"success": True, "provider": "pipedrive", "message": "Lead criado no Pipedrive"}


# ─── HUBSPOT ────────────────────────────────────────────────

def _export_hubspot(api_key: str, lead: LeadExportPayload) -> dict:
    props = {
        "company": lead.razao_social,
        "firstname": (lead.nome_fantasia or lead.razao_social).split()[0],
        "lastname": " ".join((lead.nome_fantasia or lead.razao_social).split()[1:]) or lead.razao_social,
        "city": lead.cidade or "",
        "state": lead.uf or "",
    }
    if lead.email:
        props["email"] = lead.email
    if lead.telefone or lead.whatsapp:
        props["phone"] = lead.telefone or lead.whatsapp
    if lead.site:
        props["website"] = lead.site

    r = requests.post(
        "https://api.hubapi.com/crm/v3/objects/contacts",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"properties": props},
        timeout=15,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=f"HubSpot: {r.text}")

    return {"success": True, "provider": "hubspot", "message": "Contato criado no HubSpot"}


# ─── RD STATION ─────────────────────────────────────────────

def _export_rdstation(api_key: str, lead: LeadExportPayload) -> dict:
    body = {
        "event_type": "CONVERSION",
        "event_family": "CDP",
        "payload": {
            "conversion_identifier": "hermes_prospeccao",
            "name": lead.nome_fantasia or lead.razao_social,
            "email": lead.email or f"{lead.cnpj or 'lead'}@placeholder.com",
            "company_name": lead.razao_social,
            "city": lead.cidade or "",
            "state": lead.uf or "",
            "mobile_phone": lead.whatsapp or lead.telefone or "",
        },
    }
    r = requests.post(
        f"https://api.rd.services/platform/conversions?api_key={api_key}",
        json=body,
        timeout=15,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=f"RD Station: {r.text}")

    return {"success": True, "provider": "rdstation", "message": "Lead enviado para RD Station"}


# ─── PLOOMES ────────────────────────────────────────────────

def _export_ploomes(api_key: str, lead: LeadExportPayload, funnel_id: int | None, create_deal: bool) -> dict:
    headers = {
        "User-Key": api_key,
        "Content-Type": "application/json",
    }

    phone = (lead.telefone or lead.whatsapp or "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")

    contact_id = None
    if phone:
        search = requests.get(
            f"{PLOOMES_BASE}/Contacts",
            headers=headers,
            params={
                "$filter": f"Phones/any(p: p/PhoneNumber eq '{phone}')",
                "$select": "Id,Name",
            },
            timeout=15,
        )
        if search.status_code == 200:
            vals = search.json().get("value", [])
            if vals:
                contact_id = vals[0]["Id"]

    if not contact_id:
        contact_body: dict = {
            "Name": lead.razao_social,
        }
        if phone:
            contact_body["Phones"] = [{"PhoneNumber": phone, "PhoneTypeId": 1}]
        if lead.email:
            contact_body["Email"] = lead.email
        if lead.cidade or lead.uf:
            contact_body["City"] = {"Name": f"{lead.cidade or ''}, {lead.uf or ''}"}

        other_props = []
        if lead.cnpj:
            other_props.append({"FieldKey": "Contacts_CNPJ", "ObjectValueAsString": lead.cnpj})
        if lead.segmento:
            other_props.append({"FieldKey": "Contacts_Segmento", "ObjectValueAsString": lead.segmento})
        if lead.porte:
            other_props.append({"FieldKey": "Contacts_Porte", "ObjectValueAsString": lead.porte})
        if lead.site:
            other_props.append({"FieldKey": "Contacts_Site", "ObjectValueAsString": lead.site})
        if other_props:
            contact_body["OtherProperties"] = other_props

        cr = requests.post(f"{PLOOMES_BASE}/Contacts", headers=headers, json=contact_body, timeout=15)
        if cr.status_code >= 300:
            raise HTTPException(status_code=cr.status_code, detail=f"Ploomes Contacts: {cr.text}")
        contact_data = cr.json()
        contact_id = contact_data.get("Id") or contact_data.get("value", [{}])[0].get("Id")

    if create_deal and contact_id:
        deal_body: dict = {
            "Name": f"{lead.nome_fantasia or lead.razao_social} - Hermes",
            "ContactId": contact_id,
            "OriginId": 4,
        }
        if funnel_id:
            deal_body["FunnelId"] = funnel_id

        deal_props = [
            {"FieldKey": "Deals_OrigemSDR", "ObjectValueAsString": "Hermes Prospeccao"},
        ]
        if lead.capital_social:
            deal_body["Amount"] = lead.capital_social
        deal_body["OtherProperties"] = deal_props

        dr = requests.post(f"{PLOOMES_BASE}/Deals", headers=headers, json=deal_body, timeout=15)
        if dr.status_code >= 300:
            raise HTTPException(status_code=dr.status_code, detail=f"Ploomes Deals: {dr.text}")

    return {
        "success": True,
        "provider": "ploomes",
        "message": f"Contato {'atualizado' if contact_id else 'criado'} no Ploomes" + (" + negócio criado" if create_deal else ""),
        "contact_id": contact_id,
    }


# ─── KOMMO (AmoCRM) ─────────────────────────────────────────
# Docs: https://developers.kommo.com/reference/add-contacts
# Campos multitext (EMAIL/PHONE) exigem enum_id numérico vindo do schema da conta — não enum_code string.

_SUBDOMAIN_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$")


def _normalize_kommo_subdomain(raw: str) -> str:
    """Aceita 'minhaempresa', 'https://minhaempresa.kommo.com', etc."""
    s = (raw or "").strip()
    s = re.sub(r"^https?://", "", s, flags=re.IGNORECASE)
    s = s.rstrip("/")
    s = re.sub(r"\.kommo\.com.*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\.amocrm\.(ru|com).*$", "", s, flags=re.IGNORECASE)
    return s.strip().lower()


def _kommo_auth_headers(access_token: str) -> dict:
    t = (access_token or "").strip()
    if t.lower().startswith("bearer "):
        t = t[7:].strip()
    return {
        "Authorization": f"Bearer {t}",
        "Content-Type": "application/json",
    }


def _kommo_fetch_contact_fields(base: str, headers: dict) -> list[dict]:
    r = requests.get(f"{base}/contacts/fields", headers=headers, timeout=20)
    if r.status_code >= 300:
        return []
    data = r.json() or {}
    return (data.get("_embedded") or {}).get("fields") or []


def _kommo_fetch_company_fields(base: str, headers: dict) -> list[dict]:
    r = requests.get(f"{base}/companies/fields", headers=headers, timeout=20)
    if r.status_code >= 300:
        return []
    data = r.json() or {}
    return (data.get("_embedded") or {}).get("fields") or []


def _kommo_fetch_lead_fields(base: str, headers: dict) -> list[dict]:
    """Schema de campos do lead (cards costumam ler estes CFs, ex.: EMAIL LEAD, CNPJ)."""
    for path in ("/leads/custom_fields", "/leads/fields"):
        r = requests.get(f"{base}{path}", headers=headers, timeout=20)
        if r.status_code >= 300:
            continue
        data = r.json() or {}
        emb = data.get("_embedded") or {}
        fields = emb.get("custom_fields") or emb.get("fields") or []
        if fields:
            return fields
    return []


def _kommo_find_field_by_hints(fields: list[dict], code_hints: tuple[str, ...], name_hints: tuple[str, ...]) -> dict | None:
    by_code = {str(f.get("code") or "").upper(): f for f in fields if f.get("code")}
    for hint in code_hints:
        if hint in by_code:
            return by_code[hint]
    for f in fields:
        nm = str(f.get("name") or "").upper()
        if any(h in nm for h in name_hints):
            return f
    return None


def _kommo_best_name_match_field(fields: list[dict], needles: tuple[str, ...]) -> dict | None:
    """Escolhe campo cujo nome contenha a substring mais longa (desempata pelo id)."""
    best: dict | None = None
    best_len = 0
    for f in fields:
        nm = str(f.get("name") or "").upper()
        for needle in needles:
            n = needle.upper()
            if n in nm and len(n) >= best_len:
                best_len = len(n)
                best = f
    return best


def _kommo_pick_enum_id(field: dict, prefer: tuple[str, ...] = ("WORK", "COMERCIAL", "PRINCIPAL")) -> int | None:
    for e in field.get("enums") or []:
        lab = str(e.get("value") or "").upper()
        if any(p in lab for p in prefer):
            return e.get("id")
    enums = field.get("enums") or []
    if enums:
        return enums[0].get("id")
    return None


def _kommo_values_for_field_type(field: dict, raw: str) -> list[dict]:
    ftype = str(field.get("type") or "").lower()
    if ftype in ("multitext",):
        eid = _kommo_pick_enum_id(field, ("WORK", "MOB", "CEL", "OTHER", "PRINCIPAL", "COMERCIAL", "PRIVATE"))
        val: dict = {"value": raw}
        if eid is not None:
            val["enum_id"] = eid
        return [val]
    return [{"value": raw}]


def _kommo_build_lead_custom_fields(fields: list[dict], lead: LeadExportPayload) -> list[dict]:
    """
    Preenche campos customizados do card do lead no Kommo (ex.: EMAIL LEAD, NOME EMPRESA).
    """
    if not fields:
        return []

    out: list[dict] = []

    def push(field: dict | None, text: str | None) -> None:
        if not field or field.get("id") is None or not (text or "").strip():
            return
        out.append(
            {
                "field_id": int(field["id"]),
                "values": _kommo_values_for_field_type(field, text.strip()),
            }
        )

    phone = (lead.telefone or lead.whatsapp or "").strip()
    email = (lead.email or "").strip()
    site = (lead.site or "").strip()
    cnpj = (lead.cnpj or "").strip()
    razao = (lead.razao_social or "").strip()
    fantasia = (lead.nome_fantasia or "").strip()
    cidade = " - ".join(p for p in (lead.cidade or "", lead.uf or "") if p).strip()
    resumo_parts = [
        f"Origem: Hermes",
        f"Razão social: {razao}" if razao else None,
        f"Segmento: {lead.segmento}" if lead.segmento else None,
        f"Porte: {lead.porte}" if lead.porte else None,
    ]
    resumo = "\n".join(p for p in resumo_parts if p)

    fe = _kommo_best_name_match_field(fields, ("EMAIL LEAD", "E-MAIL LEAD", "EMAIL DO LEAD"))
    if fe is not None:
        push(fe, email)
    elif email:
        push(_kommo_find_field_by_hints(fields, ("EMAIL",), ("E-MAIL", "EMAIL")), email)

    push(_kommo_best_name_match_field(fields, ("CNPJ OU CPF", "CPF CNPJ", "CNPJ")), cnpj)
    push(_kommo_best_name_match_field(fields, ("NOME EMPRESA", "NOME DA EMPRESA")), razao or fantasia)
    push(_kommo_best_name_match_field(fields, ("CIDADE LEAD", "CIDADE DO LEAD", "CIDADE")), cidade)
    push(_kommo_best_name_match_field(fields, ("LINK", "SITE", "WEBSITE", "URL")), site)
    push(_kommo_best_name_match_field(fields, ("TEL. COMERCIAL", "TELEFONE", "WHATSAPP", "CELULAR")), phone)
    push(_kommo_best_name_match_field(fields, ("RESUMO", "OBSERV")), resumo or lead.observacoes)

    # Um field_id só uma vez (último push prevalece)
    by_id: dict[int, dict] = {}
    for item in out:
        by_id[int(item["field_id"])] = item
    return list(by_id.values())


def _kommo_build_contact_custom_fields(fields: list[dict], lead: LeadExportPayload) -> list[dict]:
    """Monta custom_fields_values com field_id + enum_id (API v4)."""
    by_code = {str(f.get("code") or "").upper(): f for f in fields if f.get("code")}
    out: list[dict] = []

    if lead.email:
        f = by_code.get("EMAIL")
        if f and f.get("id") is not None:
            eid = _kommo_pick_enum_id(f, ("WORK", "COMERCIAL", "PRINCIPAL", "PRIVATE"))
            val: dict = {"value": lead.email.strip()}
            if eid is not None:
                val["enum_id"] = eid
            out.append({"field_id": int(f["id"]), "values": [val]})

    phone = (lead.telefone or lead.whatsapp or "").strip()
    if phone:
        f = by_code.get("PHONE") or by_code.get("MOB")
        if f and f.get("id") is not None:
            eid = _kommo_pick_enum_id(f, ("WORK", "MOB", "CEL", "OTHER"))
            val = {"value": phone}
            if eid is not None:
                val["enum_id"] = eid
            out.append({"field_id": int(f["id"]), "values": [val]})

    return out


def _kommo_build_company_custom_fields(fields: list[dict], lead: LeadExportPayload) -> list[dict]:
    """
    Preenche campos comuns da empresa para evitar cards "vazios" no Kommo.
    Usa busca por code/name para funcionar em contas com schema diferente.
    """
    out: list[dict] = []

    def add_value(field: dict | None, value: str | None, enum_pref: tuple[str, ...] | None = None) -> None:
        if not field or field.get("id") is None or not value:
            return
        val: dict = {"value": value}
        if enum_pref:
            eid = _kommo_pick_enum_id(field, enum_pref)
            if eid is not None:
                val["enum_id"] = eid
        out.append({"field_id": int(field["id"]), "values": [val]})

    phone = (lead.telefone or lead.whatsapp or "").strip()
    email = (lead.email or "").strip()
    site = (lead.site or "").strip()
    cnpj = (lead.cnpj or "").strip()

    f_email = _kommo_find_field_by_hints(fields, ("EMAIL",), ("E-MAIL", "EMAIL"))
    f_phone = _kommo_find_field_by_hints(fields, ("PHONE", "MOB"), ("TELEFONE", "CELULAR", "WHATSAPP"))
    f_site = _kommo_find_field_by_hints(fields, ("WEB", "SITE"), ("SITE", "WEBSITE", "URL"))
    f_cnpj = _kommo_find_field_by_hints(fields, ("CNPJ", "CPF_CNPJ"), ("CNPJ", "CPF"))

    add_value(f_email, email, ("WORK", "COMERCIAL", "PRINCIPAL", "PRIVATE"))
    add_value(f_phone, phone, ("WORK", "MOB", "CEL", "OTHER"))
    add_value(f_site, site, None)
    add_value(f_cnpj, cnpj, None)
    return out


def _kommo_fetch_pipelines(base: str, headers: dict) -> list[dict]:
    r = requests.get(f"{base}/leads/pipelines", headers=headers, timeout=20)
    if r.status_code >= 300:
        return []
    data = r.json() or {}
    return (data.get("_embedded") or {}).get("pipelines") or []


def _as_opt_int(v: object) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _kommo_resolve_pipeline_status(
    base: str,
    headers: dict,
    org_pipeline_id: int | None,
    org_status_id: int | None,
    account_subdomain: str,
) -> tuple[int, int]:
    """
    Garante pipeline_id + status_id. A maioria das contas Kommo exige ambos para criar lead.

    Ordem: (1) org_integrations; (2) funil padrão do deploy (KOMMO_DEFAULT_* + subdomínio);
    (3) primeiro funil da conta.
    """
    pipelines = _kommo_fetch_pipelines(base, headers)
    if not pipelines:
        raise HTTPException(
            status_code=502,
            detail="Kommo: não foi possível ler funis (pipelines). Verifique o token e as permissões da integração.",
        )

    op = _as_opt_int(org_pipeline_id)
    osid = _as_opt_int(org_status_id)

    if op is not None and osid is not None:
        return op, osid

    if op is not None and osid is None:
        pid = op
        for p in pipelines:
            if int(p.get("id") or 0) == pid:
                sts = (p.get("_embedded") or {}).get("statuses") or []
                if sts:
                    return pid, int(sts[0]["id"])
        raise HTTPException(
            status_code=400,
            detail="Kommo: kommo_status_id não encontrado para o pipeline configurado. Ajuste em org_integrations ou deixe em branco para usar o funil padrão.",
        )

    # Deploy: funil fixo (ex. PINN) — só se org não definiu e env bate com o subdomínio da conta
    env_sub = (getattr(settings, "KOMMO_DEFAULT_SUBDOMAIN", "") or "").strip().lower()
    env_pid = _as_opt_int(getattr(settings, "KOMMO_DEFAULT_PIPELINE_ID", None))
    env_sid = _as_opt_int(getattr(settings, "KOMMO_DEFAULT_STATUS_ID", None))
    sub_norm = (account_subdomain or "").strip().lower()

    if env_pid is not None:
        if not env_sub or env_sub == sub_norm:
            if env_sid is not None:
                return env_pid, env_sid
            for p in pipelines:
                if int(p.get("id") or 0) == env_pid:
                    sts = (p.get("_embedded") or {}).get("statuses") or []
                    if sts:
                        return env_pid, int(sts[0]["id"])
            raise HTTPException(
                status_code=502,
                detail=f"Kommo: funil {env_pid} não encontrado na conta ou sem etapas. Confira KOMMO_DEFAULT_PIPELINE_ID.",
            )

    # Padrão: primeiro pipeline e primeiro status (entrada / não arquivado)
    p0 = pipelines[0]
    pid = int(p0["id"])
    sts = (p0.get("_embedded") or {}).get("statuses") or []
    if not sts:
        raise HTTPException(
            status_code=502,
            detail="Kommo: o primeiro funil não possui etapas (status). Configure um funil no Kommo.",
        )
    return pid, int(sts[0]["id"])


def _export_kommo(
    access_token: str,
    subdomain: str,
    lead: LeadExportPayload,
    pipeline_id: int | None = None,
    status_id: int | None = None,
) -> dict:
    sub = _normalize_kommo_subdomain(subdomain)
    if not sub or not _SUBDOMAIN_RE.match(sub):
        raise HTTPException(
            status_code=400,
            detail="Subdomínio Kommo inválido. Informe só o nome (ex.: minhaempresa) ou URL sem path.",
        )

    base = f"https://{sub}.kommo.com/api/v4"
    headers = _kommo_auth_headers(access_token)

    lead_schema = _kommo_fetch_lead_fields(base, headers)
    lead_custom_fields = _kommo_build_lead_custom_fields(lead_schema, lead)

    company_fields = _kommo_fetch_company_fields(base, headers)
    company_custom_fields = _kommo_build_company_custom_fields(company_fields, lead)

    # 1. Empresa primeiro — permite vincular contato com company_id (Kommo mostra bloco Contato/Empresa)
    company_id = None
    company_body: dict = {"name": lead.razao_social or "Empresa Hermes"}
    if company_custom_fields:
        company_body["custom_fields_values"] = company_custom_fields
    comp_r = requests.post(f"{base}/companies", headers=headers, json=[company_body], timeout=20)
    if comp_r.status_code < 300:
        company_id = (comp_r.json().get("_embedded", {}).get("companies") or [{}])[0].get("id")

    schema_fields = _kommo_fetch_contact_fields(base, headers)
    custom_fields = _kommo_build_contact_custom_fields(schema_fields, lead)

    contact_display_name = (lead.nome_fantasia or lead.razao_social or "Contato Hermes").strip()[:250]
    contact_body: dict = {"name": contact_display_name}
    if company_id:
        contact_body["company_id"] = company_id
    if custom_fields:
        contact_body["custom_fields_values"] = custom_fields

    cr = requests.post(f"{base}/contacts", headers=headers, json=[contact_body], timeout=20)
    if cr.status_code >= 300 and custom_fields:
        contact_body = {"name": contact_display_name}
        if company_id:
            contact_body["company_id"] = company_id
        cr = requests.post(f"{base}/contacts", headers=headers, json=[contact_body], timeout=20)

    if cr.status_code >= 300:
        raise HTTPException(status_code=cr.status_code, detail=f"Kommo Contacts: {cr.text[:800]}")

    contact_id = (cr.json().get("_embedded", {}).get("contacts") or [{}])[0].get("id")

    rp, rs = _kommo_resolve_pipeline_status(base, headers, pipeline_id, status_id, sub)

    # 2. Lead (com fallback progressivo para diferenças de regra entre contas Kommo)
    lead_name = (lead.nome_fantasia or lead.razao_social or "Lead Hermes")[:250]
    lead_body: dict = {
        "name": lead_name,
        "pipeline_id": rp,
        "status_id": rs,
    }
    if lead_custom_fields:
        lead_body["custom_fields_values"] = lead_custom_fields
    if contact_id:
        lead_body["_embedded"] = {"contacts": [{"id": contact_id, "is_main": True}]}
    if company_id:
        lead_body.setdefault("_embedded", {})
        lead_body["_embedded"]["companies"] = [{"id": company_id}]

    lr = requests.post(f"{base}/leads", headers=headers, json=[lead_body], timeout=20)
    if lr.status_code >= 300:
        # Algumas contas rejeitam status específico embora aceitem pipeline.
        lead_body_wo_status = {"name": lead_name, "pipeline_id": rp}
        if lead_custom_fields:
            lead_body_wo_status["custom_fields_values"] = lead_custom_fields
        if contact_id:
            lead_body_wo_status["_embedded"] = {"contacts": [{"id": contact_id, "is_main": True}]}
        if company_id:
            lead_body_wo_status.setdefault("_embedded", {})
            lead_body_wo_status["_embedded"]["companies"] = [{"id": company_id}]
        lr2 = requests.post(f"{base}/leads", headers=headers, json=[lead_body_wo_status], timeout=20)
        if lr2.status_code < 300:
            lr = lr2
        else:
            # Último fallback: deixa Kommo decidir funil/etapa padrão da conta.
            lead_body_min = {"name": lead_name}
            if lead_custom_fields:
                lead_body_min["custom_fields_values"] = lead_custom_fields
            if contact_id:
                lead_body_min["_embedded"] = {"contacts": [{"id": contact_id, "is_main": True}]}
            if company_id:
                lead_body_min.setdefault("_embedded", {})
                lead_body_min["_embedded"]["companies"] = [{"id": company_id}]
            lr3 = requests.post(f"{base}/leads", headers=headers, json=[lead_body_min], timeout=20)
            if lr3.status_code < 300:
                lr = lr3
            else:
                raise HTTPException(status_code=lr3.status_code, detail=f"Kommo Leads: {lr3.text[:800]}")

    lead_id = (lr.json().get("_embedded", {}).get("leads") or [{}])[0].get("id")

    if lead_id and lead_custom_fields:
        # API v4: PATCH em lote em /leads (id no corpo, não na URL)
        requests.patch(
            f"{base}/leads",
            headers=headers,
            json=[{"id": int(lead_id), "custom_fields_values": lead_custom_fields}],
            timeout=20,
        )

    # 3. Nota com contexto Hermes
    if lead_id:
        parts = [
            "Origem: Hermes Prospecção",
            f"CNPJ: {lead.cnpj or 'N/A'}",
            f"Segmento: {lead.segmento or 'N/A'}",
            f"Porte: {lead.porte or 'N/A'}",
            f"Cidade: {lead.cidade or ''} - {lead.uf or ''}",
            f"Site: {lead.site or 'N/A'}",
        ]
        if lead.capital_social:
            parts.append(f"Capital Social: R$ {lead.capital_social:,.2f}")
        nr = requests.post(
            f"{base}/notes",
            headers=headers,
            json=[
                {
                    "entity_id": lead_id,
                    "entity_type": "leads",
                    "note_type": "common",
                    "params": {"text": "\n".join(parts)},
                }
            ],
            timeout=15,
        )
        if nr.status_code >= 300:
            # Lead já criado; não falha o fluxo inteiro
            pass

    return {
        "success": True,
        "provider": "kommo",
        "message": "Lead criado no Kommo",
        "lead_id": lead_id,
        "contact_id": contact_id,
        "company_id": company_id,
    }


# ─── ENDPOINT PRINCIPAL ────────────────────────────────────

def _get_kommo_pipeline_config(org_id: str) -> tuple[int | None, int | None]:
    """Busca pipeline_id e status_id da org_integrations para o Kommo."""
    try:
        r = requests.get(
            f"{settings.SUPABASE_URL}/rest/v1/org_integrations",
            headers={
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            },
            params={"select": "kommo_pipeline_id,kommo_status_id", "org_id": f"eq.{org_id}"},
            timeout=8,
        )
        if r.status_code < 300 and r.json():
            row = r.json()[0]
            return row.get("kommo_pipeline_id"), row.get("kommo_status_id")
    except Exception:
        pass
    return None, None


@router.post("/export")
def export_to_crm(
    payload: CrmExportRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    provider = payload.provider.lower()
    api_key = payload.api_key.strip()
    lead = payload.lead

    if not api_key:
        raise HTTPException(status_code=400, detail="API key obrigatória")

    if provider == "pipedrive":
        return _export_pipedrive(api_key, lead)
    elif provider == "hubspot":
        return _export_hubspot(api_key, lead)
    elif provider == "rdstation":
        return _export_rdstation(api_key, lead)
    elif provider == "ploomes":
        return _export_ploomes(api_key, lead, payload.funnel_id, payload.create_deal)
    elif provider == "kommo":
        if not payload.kommo_subdomain:
            raise HTTPException(status_code=400, detail="kommo_subdomain é obrigatório para o Kommo")
        org = (x_org_id or "").strip() or "default"
        pipeline_id, status_id = _get_kommo_pipeline_config(org)
        return _export_kommo(api_key, payload.kommo_subdomain.strip(), lead, pipeline_id, status_id)
    else:
        raise HTTPException(status_code=400, detail=f"Provider '{provider}' não suportado")


# ─── EXPORT EM LOTE ────────────────────────────────────────

class BatchExportRequest(BaseModel):
    provider: str
    api_key: str
    leads: list[LeadExportPayload]
    funnel_id: Optional[int] = None
    create_deal: bool = True
    kommo_subdomain: Optional[str] = None


@router.post("/export/batch")
def export_batch_to_crm(
    payload: BatchExportRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    provider = payload.provider.lower()
    api_key = payload.api_key.strip()

    if not api_key:
        raise HTTPException(status_code=400, detail="API key obrigatória")
    if provider == "kommo" and not payload.kommo_subdomain:
        raise HTTPException(status_code=400, detail="kommo_subdomain é obrigatório para o Kommo")

    org = (x_org_id or "").strip() or "default"
    komm_pipeline_id: int | None = None
    komm_status_id: int | None = None
    if provider == "kommo":
        komm_pipeline_id, komm_status_id = _get_kommo_pipeline_config(org)

    results = []
    for lead in payload.leads:
        try:
            if provider == "pipedrive":
                r = _export_pipedrive(api_key, lead)
            elif provider == "hubspot":
                r = _export_hubspot(api_key, lead)
            elif provider == "rdstation":
                r = _export_rdstation(api_key, lead)
            elif provider == "ploomes":
                r = _export_ploomes(api_key, lead, payload.funnel_id, payload.create_deal)
            elif provider == "kommo":
                r = _export_kommo(
                    api_key,
                    payload.kommo_subdomain.strip(),
                    lead,
                    komm_pipeline_id,
                    komm_status_id,
                )
            else:
                raise ValueError(f"Provider '{provider}' não suportado")
            results.append({"razao_social": lead.razao_social, **r})
        except HTTPException as e:
            results.append({"razao_social": lead.razao_social, "success": False, "detail": e.detail})
        except Exception as e:
            results.append({"razao_social": lead.razao_social, "success": False, "detail": str(e)})

    success_count = sum(1 for r in results if r.get("success"))
    return {"total": len(payload.leads), "success": success_count, "results": results}


# ─── PLOOMES ENRICH ─────────────────────────────────────────
# Busca contatos já existentes no Ploomes e enriquece com
# telefone, WhatsApp e e-mail via:
#   1. Assertiva Localize PJ  (melhor fonte — CNPJ)
#   2. BrasilAPI / Receita Federal  (fallback — CNPJ)
#   3. Homepage scraping síncrono   (fallback — site)
# Os dados novos são gravados de volta no contato Ploomes.
# ─────────────────────────────────────────────────────────────

def _resolve_ploomes_key(override: str | None, org_id: str | None) -> str:
    """
    Resolve a User-Key do Ploomes para a org:
      1. override passado no body (útil para testes)
      2. variável de ambiente PLOOMES_API_KEY (configurada por org no .env / secret da VPS)
    Levanta 503 se não houver chave configurada.
    """
    key = (override or "").strip() or (settings.PLOOMES_API_KEY or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="Ploomes API key não configurada. Defina PLOOMES_API_KEY no .env da VPS.",
        )
    return key


def _resolve_ploomes_funnel(override: int | None) -> int | None:
    """Resolve o funil do Ploomes: override > PLOOMES_FUNNEL_ID do .env."""
    if override:
        return override
    fid = getattr(settings, "PLOOMES_FUNNEL_ID", None)
    return int(fid) if fid else None


class PloomesEnrichRequest(BaseModel):
    api_key: Optional[str] = Field(
        None,
        description="User-Key do Ploomes. Se omitido, usa PLOOMES_API_KEY configurado no servidor.",
    )
    funnel_id: Optional[int] = Field(
        None,
        description="Filtrar contatos de um funil específico. Se omitido, processa TODOS os contatos da base.",
    )
    limit: int = Field(2000, ge=1, le=5000, description="Máx de contatos a processar. Padrão 2000 (toda a base).")
    apenas_sem_contato: bool = Field(False, description="False = enriquece todos; True = somente sem telefone/email")
    usar_hermes_db: bool = Field(True, description="Consultar banco DuckDB do Hermes (fonte principal)")
    usar_assertiva: bool = Field(True, description="Usar Assertiva Localize PJ se configurada (fallback)")
    usar_brasilapi: bool = Field(True, description="Usar BrasilAPI / Receita Federal (fallback)")
    usar_homepage: bool = Field(True, description="Tentar homepage scraping se site disponível (fallback final)")


# ── Helpers Ploomes ──────────────────────────────────────────

def _ploomes_get_contacts_for_enrich(
    api_key: str,
    funnel_id: int | None,
    limit: int,
    apenas_sem_contato: bool,
) -> List[Dict[str, Any]]:
    """Busca contatos no Ploomes prontos para enriquecimento (com paginação automática)."""
    headers = {"User-Key": api_key, "Content-Type": "application/json"}
    filters: List[str] = []
    if apenas_sem_contato:
        filters.append("(not Phones/any() and (Email eq null or Email eq ''))")
    if funnel_id:
        filters.append(
            f"DealsContactAssociation/any(d: d/Deal/FunnelId eq {funnel_id})"
        )

    PAGE = 100  # Ploomes aceita até 100 por página
    all_contacts: List[Dict[str, Any]] = []
    skip = 0

    while len(all_contacts) < limit:
        page_top = min(PAGE, limit - len(all_contacts))
        params: Dict[str, Any] = {
            "$top": page_top,
            "$skip": skip,
            "$expand": "Phones,OtherProperties",
            "$orderby": "CreateDate desc",
            "$select": "Id,Name,Email,Phones,OtherProperties",
        }
        if filters:
            params["$filter"] = " and ".join(filters)
        try:
            r = requests.get(
                f"{PLOOMES_BASE}/Contacts",
                headers=headers,
                params=params,
                timeout=30,
            )
            if r.status_code != 200:
                logger.warning(f"Ploomes GET /Contacts retornou {r.status_code}: {r.text[:200]}")
                break
            page_data = r.json().get("value", [])
            if not page_data:
                break
            all_contacts.extend(page_data)
            skip += len(page_data)
            if len(page_data) < page_top:
                break  # Última página
        except Exception as e:
            logger.warning(f"Ploomes GET /Contacts falhou: {e}")
            break

    return all_contacts


def _ploomes_patch_contact(api_key: str, contact_id: int, updates: Dict[str, Any]) -> bool:
    headers = {"User-Key": api_key, "Content-Type": "application/json"}
    try:
        r = requests.patch(
            f"{PLOOMES_BASE}/Contacts({contact_id})",
            headers=headers,
            json=updates,
            timeout=15,
        )
        return r.status_code < 300
    except Exception as e:
        logger.warning(f"Ploomes PATCH /Contacts({contact_id}) falhou: {e}")
        return False


def _ploomes_add_phone(api_key: str, contact_id: int, phone: str) -> bool:
    headers = {"User-Key": api_key, "Content-Type": "application/json"}
    try:
        r = requests.post(
            f"{PLOOMES_BASE}/Contacts({contact_id})/Phones",
            headers=headers,
            json={"PhoneNumber": phone, "PhoneTypeId": 1},
            timeout=15,
        )
        return r.status_code < 300
    except Exception as e:
        logger.warning(f"Ploomes POST /Phones({contact_id}) falhou: {e}")
        return False


def _extract_cnpj_from_ploomes_contact(contact: Dict[str, Any]) -> str | None:
    """Extrai CNPJ limpado das OtherProperties do contato."""
    for prop in contact.get("OtherProperties", []):
        key = (prop.get("FieldKey") or "").lower()
        if "cnpj" in key:
            val = (
                prop.get("StringValue")
                or prop.get("ObjectValueAsString")
                or prop.get("IntValue")
                or ""
            )
            clean = re.sub(r"\D", "", str(val))
            if len(clean) == 14:
                return clean
    return None


def _extract_site_from_ploomes_contact(contact: Dict[str, Any]) -> str | None:
    """Extrai URL de site das OtherProperties do contato."""
    for prop in contact.get("OtherProperties", []):
        key = (prop.get("FieldKey") or "").lower()
        if any(k in key for k in ("site", "website", "url", "homepage")):
            val = (
                prop.get("StringValue")
                or prop.get("ObjectValueAsString")
                or ""
            )
            if val and "." in val:
                return val.strip()
    return None


# ── Fontes de enriquecimento ─────────────────────────────────

async def _enrich_via_assertiva(cnpj: str) -> Dict[str, Any]:
    """Consulta Assertiva Localize PJ e extrai telefone/whatsapp/email."""
    try:
        from api.assertiva_service import get_assertiva_service
        service = get_assertiva_service()
        result = await service.consultar_cnpj(cnpj)
        out: Dict[str, Any] = {}
        for t in result.get("telefones", []):
            num = t.get("numero") or t.get("telefone") or ""
            clean = re.sub(r"\D", "", num)
            if not clean:
                continue
            if t.get("whatsapp"):
                out.setdefault("whatsapp", clean)
            else:
                out.setdefault("telefone", clean)
        emails = result.get("emails", [])
        if emails:
            e0 = emails[0]
            out.setdefault("email", e0 if isinstance(e0, str) else e0.get("email", ""))
        return out
    except Exception as e:
        logger.debug(f"Assertiva enrich CNPJ {cnpj}: {e}")
        return {}


def _enrich_via_brasilapi(cnpj: str) -> Dict[str, Any]:
    """Consulta BrasilAPI / Receita Federal de forma síncrona."""
    try:
        from api.validation_service import verificar_cnpj_receita
        r = verificar_cnpj_receita(cnpj)
        out: Dict[str, Any] = {}
        if r.get("telefone"):
            out["telefone"] = re.sub(r"\D", "", r["telefone"])
        if r.get("email"):
            out["email"] = r["email"]
        if r.get("site"):
            out["site_encontrado"] = r["site"]
        return out
    except Exception as e:
        logger.debug(f"BrasilAPI enrich CNPJ {cnpj}: {e}")
        return {}


def _enrich_via_homepage(site: str) -> Dict[str, Any]:
    """Scraping rápido da homepage (wa.me, telefone, e-mail)."""
    try:
        from api.prospeccao_service import _enriquecer_homepage_rapido
        res = _enriquecer_homepage_rapido({"cnpj": "", "site": site})
        return {k: v for k, v in res.items() if k != "cnpj" and v}
    except Exception as e:
        logger.debug(f"Homepage enrich {site}: {e}")
        return {}


def _enrich_via_hermes_db(cnpj: str) -> Dict[str, Any]:
    """
    Consulta o banco DuckDB do Hermes diretamente para extrair
    telefone, e-mail, WhatsApp e site cadastrados para o CNPJ.

    Prioridade de campos:
    - whatsapp_final  > telefone_final  > telefone_receita
    - email_final     > email_receita
    - site_web        (site da empresa)
    """
    try:
        from api.db_pool import get_connection
        clean = re.sub(r"\D", "", cnpj)
        if len(clean) != 14:
            return {}

        with get_connection() as conn:
            row = conn.execute("""
                SELECT
                    whatsapp_final,
                    telefone_final,
                    telefone_receita,
                    email_final,
                    email_receita,
                    site_web,
                    razao_social,
                    nome_fantasia,
                    cidade,
                    uf
                FROM vw_prospeccao_base
                WHERE cnpj = ?
                LIMIT 1
            """, [clean]).fetchone()

        if not row:
            return {}

        (whatsapp_final, telefone_final, telefone_receita,
         email_final, email_receita, site_web,
         razao_social, nome_fantasia, cidade, uf) = row

        out: Dict[str, Any] = {}

        # Telefone / WhatsApp
        wa = (whatsapp_final or "").strip()
        tel = (telefone_final or telefone_receita or "").strip()
        wa_clean = re.sub(r"\D", "", wa)
        tel_clean = re.sub(r"\D", "", tel)

        if wa_clean:
            out["whatsapp"] = wa_clean
        elif tel_clean:
            out["telefone"] = tel_clean

        # E-mail
        email = (email_final or email_receita or "").strip()
        if email and "@" in email:
            out["email"] = email

        # Site
        if site_web and "." in site_web:
            out["site"] = site_web.strip()

        # Dados cadastrais extras (para atualizar OtherProperties)
        if razao_social:
            out["razao_social"] = razao_social.strip()
        if cidade:
            out["cidade"] = cidade.strip()
        if uf:
            out["uf"] = uf.strip()

        return out

    except Exception as e:
        logger.debug(f"HermesDB enrich CNPJ {cnpj}: {e}")
        return {}


# ── Endpoint ─────────────────────────────────────────────────

@router.post(
    "/ploomes/enrich",
    summary="Enriquecer contatos do Ploomes com dados de contato",
    tags=["CRM", "Ploomes"],
)
async def enrich_ploomes_contacts(
    payload: PloomesEnrichRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
) -> Dict[str, Any]:
    """
    Percorre TODOS os contatos do Ploomes (com paginação automática), consulta o banco
    DuckDB do Hermes pelo CNPJ de cada contato e grava de volta telefone, WhatsApp e
    e-mail encontrados.

    **Fontes em cascata (param de habilitação):**
    1. **Banco Hermes (DuckDB)** — `usar_hermes_db=true` — fonte principal, instantâneo
    2. **Assertiva Localize PJ** — `usar_assertiva=true` — melhor para dados novos
    3. **BrasilAPI / Receita Federal** — `usar_brasilapi=true` — gratuito, fallback
    4. **Homepage scraping** — `usar_homepage=true` — última tentativa via site

    **Campos obrigatórios no Ploomes:**
    - `Contacts_CNPJ` — o Hermes já preenche ao exportar leads

    **Chamada mínima** (usa PLOOMES_API_KEY do servidor, processa todos):
    ```json
    POST /crm/ploomes/enrich
    {}
    ```
    """
    org_id = (x_org_id or "").strip() or "default"
    api_key = _resolve_ploomes_key(payload.api_key, org_id)
    funnel_id = _resolve_ploomes_funnel(payload.funnel_id)

    # 1. Buscar TODOS os contatos no Ploomes (com paginação)
    contacts = _ploomes_get_contacts_for_enrich(
        api_key, funnel_id, payload.limit, payload.apenas_sem_contato
    )

    if not contacts:
        return {
            "success": True,
            "total_processados": 0,
            "enriquecidos": 0,
            "sem_dado_novo": 0,
            "sem_cnpj": 0,
            "mensagem": "Nenhum contato encontrado",
            "resultados": [],
        }

    loop = asyncio.get_event_loop()
    resultados: List[Dict[str, Any]] = []
    enriquecidos = 0
    sem_cnpj = 0

    for contact in contacts:
        contact_id = contact.get("Id")
        nome = contact.get("Name", "")
        has_phones = bool(contact.get("Phones"))
        has_email = bool((contact.get("Email") or "").strip())

        cnpj = _extract_cnpj_from_ploomes_contact(contact)
        site = _extract_site_from_ploomes_contact(contact)

        item: Dict[str, Any] = {
            "contact_id": contact_id,
            "nome": nome,
            "cnpj": cnpj,
            "status": "sem_dados_novos",
            "fonte": None,
            "dados_adicionados": {},
        }

        if not cnpj and not site:
            item["status"] = "sem_cnpj"
            sem_cnpj += 1
            resultados.append(item)
            continue

        dados: Dict[str, Any] = {}

        # ── Fonte 0: Banco DuckDB do Hermes ─────────────────
        if payload.usar_hermes_db and cnpj:
            db_result = await loop.run_in_executor(None, _enrich_via_hermes_db, cnpj)
            if db_result:
                dados.update(db_result)
                item["fonte"] = "hermes_db"

        # ── Fonte 1: Assertiva ───────────────────────────────
        if payload.usar_assertiva and cnpj:
            if not dados.get("telefone") and not dados.get("whatsapp"):
                try:
                    assertiva = await _enrich_via_assertiva(cnpj)
                    if assertiva:
                        for k, v in assertiva.items():
                            dados.setdefault(k, v)
                        if not item["fonte"]:
                            item["fonte"] = "assertiva"
                except Exception:
                    pass

        # ── Fonte 2: BrasilAPI ───────────────────────────────
        if payload.usar_brasilapi and cnpj:
            if not dados.get("telefone") and not dados.get("whatsapp"):
                br = await loop.run_in_executor(None, _enrich_via_brasilapi, cnpj)
                if br:
                    for k, v in br.items():
                        dados.setdefault(k, v)
                    if not item["fonte"]:
                        item["fonte"] = "brasilapi"

        # ── Fonte 3: Homepage ────────────────────────────────
        _site_to_try = site or dados.get("site")
        if payload.usar_homepage and _site_to_try:
            if not dados.get("whatsapp") and not dados.get("telefone"):
                hp = await loop.run_in_executor(None, _enrich_via_homepage, _site_to_try)
                if hp:
                    for k, v in hp.items():
                        dados.setdefault(k, v)
                    if not item["fonte"]:
                        item["fonte"] = "homepage"

        # ── Gravar no Ploomes ────────────────────────────────
        if dados:
            updates: Dict[str, Any] = {}
            phone = re.sub(r"\D", "", dados.get("whatsapp") or dados.get("telefone") or "")

            if not has_email and dados.get("email"):
                updates["Email"] = dados["email"]

            if not has_phones and phone:
                _ploomes_add_phone(api_key, contact_id, phone)

            if updates:
                _ploomes_patch_contact(api_key, contact_id, updates)

            # Remove campos auxiliares antes de retornar
            for _aux in ("site", "razao_social", "cidade", "uf"):
                dados.pop(_aux, None)

            item["status"] = "enriquecido"
            item["dados_adicionados"] = dados
            enriquecidos += 1

        resultados.append(item)

    return {
        "success": True,
        "total_processados": len(contacts),
        "enriquecidos": enriquecidos,
        "sem_dado_novo": len(contacts) - enriquecidos - sem_cnpj,
        "sem_cnpj": sem_cnpj,
        "resultados": resultados,
    }


@router.get(
    "/ploomes/contacts",
    summary="Listar contatos do Ploomes (pré-visualização para enriquecimento)",
    tags=["CRM", "Ploomes"],
)
def list_ploomes_contacts_preview(
    apenas_sem_contato: bool = True,
    limit: int = 50,
    api_key: Optional[str] = None,
    funnel_id: Optional[int] = None,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
) -> Dict[str, Any]:
    """
    Lista contatos do Ploomes que seriam processados pelo endpoint de enriquecimento.
    Use para pré-visualizar antes de rodar o enriquecimento.

    A `api_key` e o `funnel_id` são lidos automaticamente do servidor.
    Podem ser sobrescritos via query param se necessário.

    **Exemplo:**
    ```
    GET /crm/ploomes/contacts?apenas_sem_contato=true&limit=20
    ```
    """
    org_id = (x_org_id or "").strip() or "default"
    resolved_key = _resolve_ploomes_key(api_key, org_id)
    resolved_funnel = _resolve_ploomes_funnel(funnel_id)

    contacts = _ploomes_get_contacts_for_enrich(resolved_key, resolved_funnel, min(limit, 200), apenas_sem_contato)
    resumo = []
    for c in contacts:
        cnpj = _extract_cnpj_from_ploomes_contact(c)
        site = _extract_site_from_ploomes_contact(c)
        resumo.append({
            "id": c.get("Id"),
            "nome": c.get("Name"),
            "email": c.get("Email"),
            "tem_telefone": bool(c.get("Phones")),
            "cnpj": cnpj,
            "site": site,
            "pode_enriquecer": bool(cnpj or site),
        })
    return {
        "total": len(resumo),
        "com_cnpj": sum(1 for r in resumo if r["cnpj"]),
        "com_site": sum(1 for r in resumo if r["site"]),
        "pode_enriquecer": sum(1 for r in resumo if r["pode_enriquecer"]),
        "contatos": resumo,
    }
