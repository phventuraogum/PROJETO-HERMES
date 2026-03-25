from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import re
import requests

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

_SUBDOMAIN_RE = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$')


def _export_kommo(access_token: str, subdomain: str, lead: LeadExportPayload) -> dict:
    # Valida subdomínio para evitar injeção de URL
    if not _SUBDOMAIN_RE.match(subdomain):
        raise HTTPException(status_code=400, detail="Subdomínio Kommo inválido. Use apenas letras, números e hífens.")

    base = f"https://{subdomain}.kommo.com/api/v4"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    # 1. Criar contato
    contact_body: dict = {"name": lead.razao_social, "custom_fields_values": []}

    if lead.email:
        contact_body["custom_fields_values"].append({
            "field_code": "EMAIL",
            "values": [{"value": lead.email, "enum_code": "WORK"}],
        })
    phone = lead.telefone or lead.whatsapp
    if phone:
        contact_body["custom_fields_values"].append({
            "field_code": "PHONE",
            "values": [{"value": phone, "enum_code": "WORK"}],
        })

    cr = requests.post(f"{base}/contacts", headers=headers, json=[contact_body], timeout=15)
    if cr.status_code >= 300:
        raise HTTPException(status_code=cr.status_code, detail=f"Kommo Contacts: {cr.text}")

    contact_id = (cr.json().get("_embedded", {}).get("contacts") or [{}])[0].get("id")

    # 2. Criar lead vinculado ao contato
    lead_body: dict = {"name": lead.nome_fantasia or lead.razao_social}
    if contact_id:
        lead_body["_embedded"] = {"contacts": [{"id": contact_id, "is_main": True}]}

    lr = requests.post(f"{base}/leads", headers=headers, json=[lead_body], timeout=15)
    if lr.status_code >= 300:
        raise HTTPException(status_code=lr.status_code, detail=f"Kommo Leads: {lr.text}")

    lead_id = (lr.json().get("_embedded", {}).get("leads") or [{}])[0].get("id")

    # 3. Adicionar nota com dados enriquecidos
    # Endpoint correto da API v4: POST /api/v4/notes com entity_id + entity_type
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
        requests.post(
            f"{base}/notes",
            headers=headers,
            json=[{
                "entity_id": lead_id,
                "entity_type": "leads",
                "note_type": "common",
                "params": {"text": "\n".join(parts)},
            }],
            timeout=15,
        )

    return {
        "success": True,
        "provider": "kommo",
        "message": "Lead criado no Kommo",
        "lead_id": lead_id,
        "contact_id": contact_id,
    }


# ─── ENDPOINT PRINCIPAL ────────────────────────────────────

@router.post("/export")
def export_to_crm(payload: CrmExportRequest, _user: dict = Depends(require_auth)):
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
        return _export_kommo(api_key, payload.kommo_subdomain.strip(), lead)
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
def export_batch_to_crm(payload: BatchExportRequest, _user: dict = Depends(require_auth)):
    provider = payload.provider.lower()
    api_key = payload.api_key.strip()

    if not api_key:
        raise HTTPException(status_code=400, detail="API key obrigatória")
    if provider == "kommo" and not payload.kommo_subdomain:
        raise HTTPException(status_code=400, detail="kommo_subdomain é obrigatório para o Kommo")

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
                r = _export_kommo(api_key, payload.kommo_subdomain.strip(), lead)  # type: ignore[arg-type]
            else:
                raise ValueError(f"Provider '{provider}' não suportado")
            results.append({"razao_social": lead.razao_social, **r})
        except HTTPException as e:
            results.append({"razao_social": lead.razao_social, "success": False, "detail": e.detail})
        except Exception as e:
            results.append({"razao_social": lead.razao_social, "success": False, "detail": str(e)})

    success_count = sum(1 for r in results if r.get("success"))
    return {"total": len(payload.leads), "success": success_count, "results": results}
