from fastapi import APIRouter, Header, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional
import os
import requests

from middleware.auth import require_auth

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

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


# ─── ENVIAR PARA SDR (leads_outbound) ──────────────────────

@router.post("/enviar-sdr")
def enviar_para_sdr(
    payload: EnviarParaSDRRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    org = _org_id(x_org_id)

    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}",
        headers=_svc_headers(),
        params={
            "select": "cnpj,razao_social,nome_fantasia,email,email_enriquecido,telefone,telefone_receita,telefone_estab1,telefone_estab2,telefone_enriquecido,whatsapp,whatsapp_enriquecido,segmento,porte",
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

    def _clean_phone(p: str | None) -> str:
        if not p:
            return ""
        return p.replace("-", "").replace(" ", "").replace("(", "").replace(")", "").replace("+", "").strip()

    def _best_phone(lead: dict) -> str:
        """Cascata: whatsapp > whatsapp_enriq > tel_enriq > tel_padrao > tel_receita > estab1 > estab2"""
        for field in ["whatsapp", "whatsapp_enriquecido", "telefone_enriquecido", "telefone", "telefone_receita", "telefone_estab1", "telefone_estab2"]:
            val = _clean_phone(lead.get(field))
            if val and len(val) >= 8:
                return val
        return ""

    rows_outbound = []
    for lead in leads:
        phone = _best_phone(lead)
        email = lead.get("email") or lead.get("email_enriquecido") or ""
        if not phone and not email:
            continue
        rows_outbound.append({
            "name": lead.get("nome_fantasia") or lead.get("razao_social"),
            "phone": phone,
            "email": email,
            "company": lead.get("razao_social"),
            "segment": lead.get("segmento"),
            "source": "hermes",
            "status": "pending",
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

    update_headers = _svc_headers()
    update_headers["Prefer"] = "return=minimal"
    for cnpj in payload.cnpjs:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/{TABLE}",
            headers=update_headers,
            params={"org_id": f"eq.{org}", "cnpj": f"eq.{cnpj}"},
            json={"sdr_status": "enviado", "sdr_enviado_em": "now()"},
            timeout=10,
        )

    return {"enviados": len(rows_outbound), "total_solicitados": len(payload.cnpjs)}
