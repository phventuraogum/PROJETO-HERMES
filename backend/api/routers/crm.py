from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional
import re
import requests

from config import settings
from middleware.auth import require_auth

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


def _kommo_pick_enum_id(field: dict, prefer: tuple[str, ...] = ("WORK", "COMERCIAL", "PRINCIPAL")) -> int | None:
    for e in field.get("enums") or []:
        lab = str(e.get("value") or "").upper()
        if any(p in lab for p in prefer):
            return e.get("id")
    enums = field.get("enums") or []
    if enums:
        return enums[0].get("id")
    return None


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

    schema_fields = _kommo_fetch_contact_fields(base, headers)
    custom_fields = _kommo_build_contact_custom_fields(schema_fields, lead)

    # 1. Contato — tenta com e-mail/telefone; se falhar, só nome (sempre aceito)
    contact_body: dict = {"name": lead.razao_social or "Lead Hermes"}
    if custom_fields:
        contact_body["custom_fields_values"] = custom_fields

    cr = requests.post(f"{base}/contacts", headers=headers, json=[contact_body], timeout=20)
    if cr.status_code >= 300 and custom_fields:
        contact_body = {"name": lead.razao_social or "Lead Hermes"}
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
    if contact_id:
        lead_body["_embedded"] = {"contacts": [{"id": contact_id, "is_main": True}]}

    lr = requests.post(f"{base}/leads", headers=headers, json=[lead_body], timeout=20)
    if lr.status_code >= 300:
        # Algumas contas rejeitam status específico embora aceitem pipeline.
        lead_body_wo_status = {"name": lead_name, "pipeline_id": rp}
        if contact_id:
            lead_body_wo_status["_embedded"] = {"contacts": [{"id": contact_id, "is_main": True}]}
        lr2 = requests.post(f"{base}/leads", headers=headers, json=[lead_body_wo_status], timeout=20)
        if lr2.status_code < 300:
            lr = lr2
        else:
            # Último fallback: deixa Kommo decidir funil/etapa padrão da conta.
            lead_body_min = {"name": lead_name}
            if contact_id:
                lead_body_min["_embedded"] = {"contacts": [{"id": contact_id, "is_main": True}]}
            lr3 = requests.post(f"{base}/leads", headers=headers, json=[lead_body_min], timeout=20)
            if lr3.status_code < 300:
                lr = lr3
            else:
                raise HTTPException(status_code=lr3.status_code, detail=f"Kommo Leads: {lr3.text[:800]}")

    lead_id = (lr.json().get("_embedded", {}).get("leads") or [{}])[0].get("id")

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
