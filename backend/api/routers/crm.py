from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
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
    else:
        raise HTTPException(status_code=400, detail=f"Provider '{provider}' não suportado")


# ─── EXPORT EM LOTE ────────────────────────────────────────

class BatchExportRequest(BaseModel):
    provider: str
    api_key: str
    leads: list[LeadExportPayload]
    funnel_id: Optional[int] = None
    create_deal: bool = True


@router.post("/export/batch")
def export_batch_to_crm(payload: BatchExportRequest, _user: dict = Depends(require_auth)):
    results = []
    for lead in payload.leads:
        try:
            single = CrmExportRequest(
                provider=payload.provider,
                api_key=payload.api_key,
                lead=lead,
                funnel_id=payload.funnel_id,
                create_deal=payload.create_deal,
            )
            r = export_to_crm(single)
            results.append({"razao_social": lead.razao_social, **r})
        except Exception as e:
            results.append({"razao_social": lead.razao_social, "success": False, "detail": str(e)})

    success_count = sum(1 for r in results if r.get("success"))
    return {"total": len(payload.leads), "success": success_count, "results": results}
