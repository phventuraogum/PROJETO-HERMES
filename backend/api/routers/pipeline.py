from fastapi import APIRouter, Header, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional
import os
import logging
import requests

from middleware.auth import require_auth

logger = logging.getLogger("hermes.pipeline")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
PLOOMES_BASE = "https://api2.ploomes.com"

router = APIRouter()

TABLE = "pipeline_leads"


def _svc_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _org_id(x_org_id: str | None) -> str:
    return (x_org_id or "").strip() or "default"


# ─── MODELS ────────────────────────────────────────────────

class EmpresaData(BaseModel):
    cnpj: str
    razao_social: str
    nome_fantasia: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    telefone_receita: Optional[str] = None
    telefone_estab1: Optional[str] = None
    telefone_estab2: Optional[str] = None
    whatsapp: Optional[str] = None
    whatsapp_enriquecido: Optional[str] = None
    site: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    segmento: Optional[str] = None
    porte: Optional[str] = None
    capital_social: Optional[float] = None
    cnae_principal: Optional[str] = None
    cnae_descricao: Optional[str] = None
    socios_resumo: Optional[str] = None
    email_enriquecido: Optional[str] = None
    telefone_enriquecido: Optional[str] = None
    score_icp: Optional[float] = 0


class AddToPipelineRequest(BaseModel):
    empresa: EmpresaData
    estagio: str = "novo"
    nota: str = ""


class MoveLeadRequest(BaseModel):
    estagio: str


class UpdateNotaRequest(BaseModel):
    nota: str


class EnviarParaSDRRequest(BaseModel):
    cnpjs: list[str]
    ploomes_api_key: Optional[str] = None
    ploomes_funnel_id: Optional[int] = None
    create_ploomes_deal: bool = True


def _get_ploomes_key_for_org(org_id: str, override_key: str | None = None) -> str | None:
    """Busca a chave Ploomes: override do request > variavel de ambiente."""
    if override_key:
        return override_key
    return os.getenv("PLOOMES_API_KEY") or None


def _create_ploomes_contact(api_key: str, lead: dict) -> dict | None:
    """Cria ou encontra contato no Ploomes. Retorna {contact_id, deal_id} ou None."""
    headers = {"User-Key": api_key, "Content-Type": "application/json"}

    phone = _clean_phone(lead.get("whatsapp") or lead.get("whatsapp_enriquecido")
                         or lead.get("telefone_enriquecido") or lead.get("telefone") or "")
    email = lead.get("email") or lead.get("email_enriquecido") or ""

    contact_id = None

    # Tentar encontrar contato existente por telefone
    if phone:
        try:
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
        except Exception as e:
            logger.warning(f"Ploomes busca contato falhou: {e}")

    # Criar contato se nao encontrou
    if not contact_id:
        contact_body: dict = {
            "Name": lead.get("razao_social") or lead.get("nome_fantasia") or "Sem nome",
        }
        if phone:
            contact_body["Phones"] = [{"PhoneNumber": phone, "PhoneTypeId": 1}]
        if email:
            contact_body["Email"] = email
        if lead.get("cidade") or lead.get("uf"):
            contact_body["City"] = {"Name": f"{lead.get('cidade', '')}, {lead.get('uf', '')}"}

        other_props = []
        if lead.get("cnpj"):
            other_props.append({"FieldKey": "Contacts_CNPJ", "ObjectValueAsString": lead["cnpj"]})
        if lead.get("segmento"):
            other_props.append({"FieldKey": "Contacts_Segmento", "ObjectValueAsString": lead["segmento"]})
        if lead.get("porte"):
            other_props.append({"FieldKey": "Contacts_Porte", "ObjectValueAsString": lead["porte"]})
        if other_props:
            contact_body["OtherProperties"] = other_props

        try:
            cr = requests.post(f"{PLOOMES_BASE}/Contacts", headers=headers, json=contact_body, timeout=15)
            if cr.status_code < 300:
                contact_data = cr.json()
                contact_id = contact_data.get("Id") or (contact_data.get("value", [{}])[0].get("Id") if contact_data.get("value") else None)
            else:
                logger.warning(f"Ploomes criar contato falhou ({cr.status_code}): {cr.text[:200]}")
        except Exception as e:
            logger.warning(f"Ploomes criar contato excecao: {e}")

    return {"contact_id": contact_id} if contact_id else None


def _create_ploomes_deal(api_key: str, contact_id: int, lead: dict, funnel_id: int | None = None) -> int | None:
    """Cria um deal no Ploomes vinculado ao contato."""
    headers = {"User-Key": api_key, "Content-Type": "application/json"}
    deal_body: dict = {
        "Name": f"{lead.get('nome_fantasia') or lead.get('razao_social', '')} - Hermes SDR",
        "ContactId": contact_id,
        "OriginId": 4,
    }
    if funnel_id:
        deal_body["FunnelId"] = funnel_id

    deal_props = [
        {"FieldKey": "Deals_OrigemSDR", "ObjectValueAsString": "Hermes Prospeccao"},
    ]
    capital = lead.get("capital_social")
    if capital:
        deal_body["Amount"] = capital
    deal_body["OtherProperties"] = deal_props

    try:
        dr = requests.post(f"{PLOOMES_BASE}/Deals", headers=headers, json=deal_body, timeout=15)
        if dr.status_code < 300:
            deal_data = dr.json()
            return deal_data.get("Id") or (deal_data.get("value", [{}])[0].get("Id") if deal_data.get("value") else None)
        else:
            logger.warning(f"Ploomes criar deal falhou ({dr.status_code}): {dr.text[:200]}")
    except Exception as e:
        logger.warning(f"Ploomes criar deal excecao: {e}")
    return None


def _clean_phone(p: str | None) -> str:
    if not p:
        return ""
    s = str(p).strip()
    if s.lower() in ("nan", "none", "null", "n/a", "-", ""):
        return ""
    return s.replace("-", "").replace(" ", "").replace("(", "").replace(")", "").replace("+", "").strip()


def _normalize_br_phone(raw: str) -> str:
    """Normaliza telefone brasileiro para formato 55DDDNUMERO (13 digitos para celular)."""
    digits = "".join(c for c in raw if c.isdigit())
    if not digits:
        return ""
    if digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 8 or len(digits) == 9:
        return digits
    if len(digits) == 10 or len(digits) == 11:
        return "55" + digits
    if len(digits) == 12 and digits.startswith("55"):
        ddd = digits[2:4]
        num = digits[4:]
        if len(num) == 8 and num[0] in "6789":
            return "55" + ddd + "9" + num
        return digits
    if len(digits) == 13 and digits.startswith("55"):
        return digits
    return digits


def _is_brazilian_mobile(digits: str) -> bool:
    """Verifica se um numero limpo (so digitos) e celular brasileiro valido.
    Celulares BR: DDD (2 dig) + 9XXXX-XXXX (9 dig) = 11 digitos locais, ou 55+11 = 13 digitos.
    """
    d = digits.lstrip("0")
    if d.startswith("55"):
        d = d[2:]
    if len(d) == 11 and d[2] == "9":
        return True
    if len(d) == 10 and d[2] in "6789":
        return True
    return False


# ─── LISTAR PIPELINE ──────────────────────────────────────

@router.get("")
def list_pipeline(
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
    estagio: str | None = Query(default=None),
):
    org = _org_id(x_org_id)
    params = {
        "select": "*",
        "org_id": f"eq.{org}",
        "order": "score_icp.desc,atualizado_em.desc",
    }
    if estagio:
        params["estagio"] = f"eq.{estagio}"

    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_svc_headers(),
        params=params,
        timeout=15,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


# ─── ADICIONAR AO PIPELINE ─────────────────────────────────

@router.post("")
def add_to_pipeline(
    payload: AddToPipelineRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    org = _org_id(x_org_id)
    emp = payload.empresa

    check = requests.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_svc_headers(),
        params={
            "select": "id",
            "org_id": f"eq.{org}",
            "cnpj": f"eq.{emp.cnpj}",
        },
        timeout=10,
    )
    if check.status_code == 200 and check.json():
        return {"status": "exists", "id": check.json()[0]["id"]}

    row = {
        "org_id": org,
        "cnpj": emp.cnpj,
        "razao_social": emp.razao_social,
        "nome_fantasia": emp.nome_fantasia,
        "email": emp.email,
        "telefone": emp.telefone,
        "telefone_receita": emp.telefone_receita,
        "telefone_estab1": emp.telefone_estab1,
        "telefone_estab2": emp.telefone_estab2,
        "whatsapp": emp.whatsapp,
        "whatsapp_enriquecido": emp.whatsapp_enriquecido,
        "site": emp.site,
        "cidade": emp.cidade,
        "uf": emp.uf,
        "segmento": emp.segmento,
        "porte": emp.porte,
        "capital_social": emp.capital_social,
        "cnae_principal": emp.cnae_principal,
        "cnae_descricao": emp.cnae_descricao,
        "socios_resumo": emp.socios_resumo,
        "email_enriquecido": emp.email_enriquecido,
        "telefone_enriquecido": emp.telefone_enriquecido,
        "score_icp": emp.score_icp or 0,
        "estagio": payload.estagio,
        "nota": payload.nota,
        "empresa_data": emp.model_dump(),
    }

    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_svc_headers(),
        json=row,
        timeout=10,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    created = r.json()
    return {"status": "added", "id": created[0]["id"] if created else None}


# ─── ADICIONAR EM LOTE ─────────────────────────────────────

@router.post("/batch")
def add_batch_to_pipeline(
    payload: list[AddToPipelineRequest],
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    results = []
    for item in payload:
        try:
            r = add_to_pipeline(item, x_org_id)
            results.append({"cnpj": item.empresa.cnpj, **r})
        except Exception as e:
            results.append({"cnpj": item.empresa.cnpj, "status": "error", "detail": str(e)})
    added = sum(1 for r in results if r.get("status") == "added")
    return {"total": len(payload), "added": added, "results": results}


# ─── MOVER ESTÁGIO ─────────────────────────────────────────

@router.patch("/{cnpj}/estagio")
def move_lead(
    cnpj: str,
    payload: MoveLeadRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    org = _org_id(x_org_id)
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_svc_headers(),
        params={"org_id": f"eq.{org}", "cnpj": f"eq.{cnpj}"},
        json={"estagio": payload.estagio},
        timeout=10,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"ok": True}


# ─── ATUALIZAR NOTA ─────────────────────────────────────────

@router.patch("/{cnpj}/nota")
def update_nota(
    cnpj: str,
    payload: UpdateNotaRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    org = _org_id(x_org_id)
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_svc_headers(),
        params={"org_id": f"eq.{org}", "cnpj": f"eq.{cnpj}"},
        json={"nota": payload.nota},
        timeout=10,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"ok": True}


# ─── REMOVER DO PIPELINE ───────────────────────────────────

@router.delete("/{cnpj}")
def remove_from_pipeline(
    cnpj: str,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    org = _org_id(x_org_id)
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_svc_headers(),
        params={"org_id": f"eq.{org}", "cnpj": f"eq.{cnpj}"},
        timeout=10,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"ok": True}


# ─── ENVIAR PARA SDR (leads_outbound + Ploomes) ─────────────

@router.post("/enviar-sdr")
def enviar_para_sdr(
    payload: EnviarParaSDRRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    """
    Envia leads do pipeline para a fila SDR (leads_outbound).

    Fluxo:
      1. Busca leads do pipeline_leads pelos CNPJs
      2. Cria contato + deal no Ploomes para cada lead
      3. Insere em leads_outbound com ploomes_contact_id e ploomes_deal_id
      4. Atualiza pipeline_leads com status SDR e IDs Ploomes
      5. n8n consulta /sdr/leads?status=pending para processar
    """
    org = _org_id(x_org_id)

    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_svc_headers(),
        params={
            "select": "cnpj,razao_social,nome_fantasia,email,email_enriquecido,"
                      "telefone,telefone_receita,telefone_estab1,telefone_estab2,"
                      "telefone_enriquecido,whatsapp,whatsapp_enriquecido,"
                      "segmento,porte,capital_social,cidade,uf,score_icp",
            "org_id": f"eq.{org}",
            "cnpj": f"in.({','.join(payload.cnpjs)})",
        },
        timeout=15,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    leads = r.json()
    if not leads:
        raise HTTPException(status_code=404, detail="Nenhum lead encontrado")

    def _best_phone(lead: dict) -> str:
        for field in [
            "whatsapp", "whatsapp_enriquecido", "telefone_enriquecido",
            "telefone", "telefone_receita", "telefone_estab1", "telefone_estab2",
        ]:
            val = _clean_phone(lead.get(field))
            if val and len(val) >= 8:
                return _normalize_br_phone(val)
        return ""

    def _best_whatsapp(lead: dict) -> str:
        # 1) Campos explicitamente WhatsApp (maior confianca)
        for field in ["whatsapp", "whatsapp_enriquecido"]:
            val = _clean_phone(lead.get(field))
            if val and len(val) >= 8:
                return _normalize_br_phone(val)

        # 2) Qualquer telefone que seja celular brasileiro (9o digito = 9)
        #    No Brasil, ~95% dos celulares tem WhatsApp
        for field in [
            "telefone_enriquecido", "telefone",
            "telefone_receita", "telefone_estab1", "telefone_estab2",
        ]:
            val = _clean_phone(lead.get(field))
            if val and len(val) >= 8 and _is_brazilian_mobile(val):
                return _normalize_br_phone(val)

        return ""

    # Buscar chave e funil Ploomes
    ploomes_key = _get_ploomes_key_for_org(org, payload.ploomes_api_key)
    ploomes_funnel = payload.ploomes_funnel_id or int(os.getenv("PLOOMES_FUNNEL_ID", "0")) or None

    rows_outbound = []
    ploomes_results = []
    skipped_no_contact = []

    for lead in leads:
        phone = _best_phone(lead)
        whatsapp = _best_whatsapp(lead)
        email = lead.get("email") or lead.get("email_enriquecido") or ""
        if not phone and not email:
            skipped_no_contact.append(lead.get("cnpj"))
            logger.warning(f"Lead {lead.get('cnpj')} ({lead.get('razao_social')}) descartado: sem telefone e sem email")
            continue

        logger.info(
            f"Lead {lead.get('cnpj')}: phone={phone}, whatsapp={whatsapp}, "
            f"email={email[:20] if email else 'N/A'}"
        )

        ploomes_contact_id = None
        ploomes_deal_id = None

        # Criar contato no Ploomes
        if ploomes_key:
            ploomes_result = _create_ploomes_contact(ploomes_key, lead)
            if ploomes_result:
                ploomes_contact_id = ploomes_result["contact_id"]
                # Criar deal
                if payload.create_ploomes_deal and ploomes_contact_id:
                    ploomes_deal_id = _create_ploomes_deal(
                        ploomes_key, ploomes_contact_id, lead, ploomes_funnel
                    )
            ploomes_results.append({
                "cnpj": lead.get("cnpj"),
                "contact_id": ploomes_contact_id,
                "deal_id": ploomes_deal_id,
            })

        notes_parts = []
        if lead.get("porte"):
            notes_parts.append(f"Porte: {lead['porte']}")
        if lead.get("cidade") and lead.get("uf"):
            notes_parts.append(f"Local: {lead['cidade']}/{lead['uf']}")
        if lead.get("cnae_descricao"):
            notes_parts.append(f"CNAE: {lead['cnae_descricao']}")
        if lead.get("capital_social"):
            notes_parts.append(f"Capital: R${lead['capital_social']:,.2f}")
        if lead.get("socios_resumo"):
            notes_parts.append(f"Socios: {lead['socios_resumo']}")

        rows_outbound.append({
            "org_id": org,
            "cnpj": lead.get("cnpj"),
            "name": lead.get("nome_fantasia") or lead.get("razao_social"),
            "company": lead.get("razao_social"),
            "email": email,
            "phone": phone,
            "whatsapp": whatsapp or phone,
            "segment": lead.get("segmento"),
            "porte": lead.get("porte"),
            "cidade": lead.get("cidade"),
            "uf": lead.get("uf"),
            "score_icp": lead.get("score_icp") or 0,
            "ploomes_contact_id": ploomes_contact_id,
            "ploomes_deal_id": ploomes_deal_id,
            "source": "hermes",
            "status": "pending",
            "optout": False,
            "notes": " | ".join(notes_parts) if notes_parts else None,
        })

    if not rows_outbound:
        raise HTTPException(status_code=400, detail="Nenhum lead com telefone ou email")

    ins = requests.post(
        f"{SUPABASE_URL}/rest/v1/leads_outbound",
        headers=_svc_headers(),
        json=rows_outbound,
        timeout=15,
    )
    if ins.status_code >= 300:
        raise HTTPException(status_code=ins.status_code, detail=ins.text)

    # Atualizar pipeline_leads com status SDR e IDs Ploomes
    update_headers = _svc_headers()
    update_headers["Prefer"] = "return=minimal"
    for row in rows_outbound:
        cnpj = row.get("cnpj")
        if not cnpj:
            continue
        update_data: dict = {"sdr_status": "enviado", "sdr_enviado_em": "now()"}
        if row.get("ploomes_contact_id"):
            update_data["ploomes_contact_id"] = row["ploomes_contact_id"]
            update_data["ploomes_synced"] = True
        if row.get("ploomes_deal_id"):
            update_data["ploomes_deal_id"] = row["ploomes_deal_id"]

        requests.patch(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            headers=update_headers,
            params={"org_id": f"eq.{org}", "cnpj": f"eq.{cnpj}"},
            json=update_data,
            timeout=10,
        )

    # Disparar n8n outbound automaticamente (fire-and-forget)
    n8n_webhook = os.getenv("N8N_OUTBOUND_WEBHOOK", "")
    n8n_triggered = False
    if n8n_webhook:
        try:
            requests.post(
                n8n_webhook,
                json={"source": "hermes", "leads_count": len(rows_outbound)},
                timeout=5,
            )
            n8n_triggered = True
            logger.info(f"n8n outbound trigger disparado ({len(rows_outbound)} leads)")
        except Exception as e:
            logger.warning(f"n8n trigger falhou (nao bloqueante): {e}")

    com_whatsapp = sum(1 for r in rows_outbound if r.get("whatsapp"))
    so_email = sum(1 for r in rows_outbound if not r.get("whatsapp") and r.get("email"))

    return {
        "enviados": len(rows_outbound),
        "total_solicitados": len(payload.cnpjs),
        "com_whatsapp": com_whatsapp,
        "so_email_sem_whatsapp": so_email,
        "descartados_sem_contato": len(skipped_no_contact),
        "ploomes_criados": sum(1 for p in ploomes_results if p.get("contact_id")),
        "ploomes_results": ploomes_results if ploomes_key else None,
        "n8n_triggered": n8n_triggered,
    }
