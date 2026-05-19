from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import logging
import re
import requests

from middleware.auth import require_auth
from config import settings

logger = logging.getLogger("hermes.crm")

router = APIRouter()

PLOOMES_BASE = "https://api2.ploomes.com"

# Field keys da conta Pinn (descobertos via GET /Fields)
PLOOMES_CONTACT_CNPJ_FIELD = "contact_48B5432D-064F-4E1A-AD26-75E283588FB1"  # "Hermes - CNPJ"
PLOOMES_DEAL_CNPJ_FIELD = "deal_CA6A6BB4-BE6F-407E-B3C3-7A0F47054152"        # "HC - CNPJ"
PLOOMES_CONTACT_TYPE_COMPANY = 1  # TypeId=1 = empresa; TypeId=2 = pessoa


def _only_digits(s: Optional[str]) -> str:
    return re.sub(r"\D", "", s or "")


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
    api_key: Optional[str] = None  # Ploomes usa chave do server (settings.PLOOMES_API_KEY)
    lead: LeadExportPayload
    funnel_id: Optional[int] = None
    create_deal: bool = True


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

def _build_ploomes_contact_body(lead: LeadExportPayload) -> dict:
    """Monta body do Contact (empresa) com todos os campos disponíveis do lead."""
    cnpj_digits = _only_digits(lead.cnpj)

    body: dict = {
        "Name": lead.razao_social,
        "TypeId": PLOOMES_CONTACT_TYPE_COMPANY,
    }

    # Register = campo nativo de CNPJ no Ploomes (chave canônica de dedup)
    if cnpj_digits:
        body["Register"] = cnpj_digits

    phone = _only_digits(lead.telefone or lead.whatsapp)
    if phone:
        body["Phones"] = [{"PhoneNumber": phone, "PhoneTypeId": 1}]
    if lead.email:
        body["Email"] = lead.email
    if lead.cidade or lead.uf:
        body["City"] = {"Name": f"{(lead.cidade or '').strip()}, {(lead.uf or '').strip()}".strip(", ")}

    # Custom field "Hermes - CNPJ" pra UI/visualização (Register já cobre dedup)
    other_props = []
    if cnpj_digits:
        other_props.append({"FieldKey": PLOOMES_CONTACT_CNPJ_FIELD, "StringValue": cnpj_digits})
    if other_props:
        body["OtherProperties"] = other_props

    return body


def _find_ploomes_contact(headers: dict, lead: LeadExportPayload) -> Optional[int]:
    """Dedup: por Register (CNPJ nativo) primeiro, fallback por telefone."""
    cnpj_digits = _only_digits(lead.cnpj)
    if cnpj_digits:
        try:
            r = requests.get(
                f"{PLOOMES_BASE}/Contacts",
                headers=headers,
                params={
                    "$filter": f"Register eq '{cnpj_digits}'",
                    "$select": "Id",
                    "$top": "1",
                },
                timeout=15,
            )
            if r.status_code == 200:
                vals = r.json().get("value", [])
                if vals:
                    return vals[0]["Id"]
        except Exception as e:
            logger.warning("Ploomes dedup por Register falhou (%s) — tentando telefone", e)

    phone = _only_digits(lead.telefone or lead.whatsapp)
    if phone:
        try:
            r = requests.get(
                f"{PLOOMES_BASE}/Contacts",
                headers=headers,
                params={
                    "$filter": f"Phones/any(p: p/PhoneNumber eq '{phone}')",
                    "$select": "Id",
                    "$top": "1",
                },
                timeout=15,
            )
            if r.status_code == 200:
                vals = r.json().get("value", [])
                if vals:
                    return vals[0]["Id"]
        except Exception as e:
            logger.warning("Ploomes dedup por telefone falhou: %s", e)

    return None


def _export_ploomes(api_key: str, lead: LeadExportPayload, funnel_id: Optional[int], create_deal: bool) -> dict:
    headers = {
        "User-Key": api_key,
        "Content-Type": "application/json",
    }

    contact_id = _find_ploomes_contact(headers, lead)
    body = _build_ploomes_contact_body(lead)
    was_update = contact_id is not None

    if was_update:
        # UPSERT: PATCH atualiza dados (telefone/email/site podem ter mudado)
        ur = requests.patch(
            f"{PLOOMES_BASE}/Contacts({contact_id})",
            headers=headers,
            json=body,
            timeout=15,
        )
        if ur.status_code >= 300:
            logger.warning("Ploomes PATCH Contact %s falhou (%s): %s", contact_id, ur.status_code, ur.text[:200])
            # Não aborta — segue pra criar deal mesmo assim
    else:
        cr = requests.post(f"{PLOOMES_BASE}/Contacts", headers=headers, json=body, timeout=15)
        if cr.status_code >= 300:
            raise HTTPException(status_code=cr.status_code, detail=f"Ploomes Contacts: {cr.text}")
        data = cr.json()
        contact_id = data.get("Id") or (data.get("value") or [{}])[0].get("Id")
        if not contact_id:
            raise HTTPException(status_code=502, detail=f"Ploomes não retornou Id do contato: {data}")

    deal_id: Optional[int] = None
    if create_deal and contact_id:
        deal_name = f"{lead.nome_fantasia or lead.razao_social} - Hermes"
        deal_body: dict = {
            "Title": deal_name,
            "ContactId": contact_id,
            "OriginId": 4,
            "StatusId": 1,  # Em aberto
        }
        if funnel_id:
            deal_body["PipelineId"] = funnel_id
        if lead.capital_social:
            deal_body["Amount"] = lead.capital_social

        deal_other = []
        if lead.cnpj:
            deal_other.append({"FieldKey": PLOOMES_DEAL_CNPJ_FIELD, "StringValue": _only_digits(lead.cnpj)})
        if deal_other:
            deal_body["OtherProperties"] = deal_other

        dr = requests.post(f"{PLOOMES_BASE}/Deals", headers=headers, json=deal_body, timeout=15)
        if dr.status_code >= 300:
            raise HTTPException(status_code=dr.status_code, detail=f"Ploomes Deals: {dr.text}")
        ddata = dr.json()
        deal_id = ddata.get("Id") or (ddata.get("value") or [{}])[0].get("Id")

    return {
        "success": True,
        "provider": "ploomes",
        "message": (
            f"Contato {'atualizado' if was_update else 'criado'} no Ploomes"
            + (" + negócio criado" if create_deal and deal_id else "")
        ),
        "contact_id": contact_id,
        "deal_id": deal_id,
        "updated": was_update,
    }


# ─── ENDPOINT PRINCIPAL ────────────────────────────────────

def _resolve_api_key(provider: str, payload_key: Optional[str]) -> str:
    """Ploomes usa chave do server (settings.PLOOMES_API_KEY). Outros exigem chave no payload."""
    payload_key = (payload_key or "").strip()
    if provider == "ploomes":
        key = payload_key or (settings.PLOOMES_API_KEY or "").strip()
        if not key:
            raise HTTPException(
                status_code=503,
                detail="PLOOMES_API_KEY não configurada no servidor (.env). Configure pra usar a integração Ploomes.",
            )
        return key
    if not payload_key:
        raise HTTPException(status_code=400, detail="API key obrigatória pra este provider.")
    return payload_key


def _resolve_funnel_id(provider: str, payload_funnel: Optional[int]) -> Optional[int]:
    if provider == "ploomes":
        return payload_funnel or settings.PLOOMES_FUNNEL_ID
    return payload_funnel


@router.post("/export")
def export_to_crm(payload: CrmExportRequest, _user: dict = Depends(require_auth)):
    provider = payload.provider.lower()
    api_key = _resolve_api_key(provider, payload.api_key)
    funnel_id = _resolve_funnel_id(provider, payload.funnel_id)
    lead = payload.lead

    if provider == "pipedrive":
        return _export_pipedrive(api_key, lead)
    elif provider == "hubspot":
        return _export_hubspot(api_key, lead)
    elif provider == "rdstation":
        return _export_rdstation(api_key, lead)
    elif provider == "ploomes":
        return _export_ploomes(api_key, lead, funnel_id, payload.create_deal)
    else:
        raise HTTPException(status_code=400, detail=f"Provider '{provider}' não suportado")


# ─── EXPORT EM LOTE ────────────────────────────────────────

class BatchExportRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None  # Ploomes usa chave do server
    leads: list[LeadExportPayload]
    funnel_id: Optional[int] = None
    create_deal: bool = True


@router.post("/export/batch")
def export_batch_to_crm(payload: BatchExportRequest, _user: dict = Depends(require_auth)):
    provider = payload.provider.lower()
    # Resolve chave/funil uma vez (não por lead)
    api_key = _resolve_api_key(provider, payload.api_key)
    funnel_id = _resolve_funnel_id(provider, payload.funnel_id)

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
                r = _export_ploomes(api_key, lead, funnel_id, payload.create_deal)
            else:
                raise HTTPException(status_code=400, detail=f"Provider '{provider}' não suportado")
            results.append({"cnpj": lead.cnpj, "razao_social": lead.razao_social, **r})
        except HTTPException as e:
            results.append({"cnpj": lead.cnpj, "razao_social": lead.razao_social, "success": False, "detail": e.detail})
        except Exception as e:
            results.append({"cnpj": lead.cnpj, "razao_social": lead.razao_social, "success": False, "detail": str(e)})

    success_count = sum(1 for r in results if r.get("success"))
    return {"total": len(payload.leads), "success": success_count, "results": results}
