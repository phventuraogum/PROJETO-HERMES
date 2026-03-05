"""
Router SDR - Endpoints para IA SDR (n8n)

Fluxo:
  1. Hermes envia leads para SDR via /pipeline/enviar-sdr
     -> cria contato no Ploomes + insere em leads_outbound (status=pending)
  2. n8n consulta GET /sdr/leads?status=pending para pegar leads
  3. n8n realiza disparo (email/whatsapp) e atualiza status via PATCH /sdr/leads/{id}
  4. n8n registra atividades via POST /sdr/leads/{id}/activity
  5. Opcionalmente, n8n sincroniza atividade com Ploomes via POST /sdr/leads/{id}/ploomes-sync
"""
from fastapi import APIRouter, HTTPException, Query, Header, Depends, Body
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import requests
import logging

from middleware.auth import require_auth

logger = logging.getLogger("hermes.sdr")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
PLOOMES_BASE = "https://api2.ploomes.com"

N8N_API_KEY = os.getenv("N8N_SDR_API_KEY", "")

router = APIRouter(prefix="/sdr", tags=["SDR / n8n"])


def _svc_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _org_id(x_org_id: str | None) -> str:
    return (x_org_id or "").strip() or "default"


def _validate_n8n_key(api_key: str | None):
    """Valida chave de API para acesso do n8n (alternativa ao auth JWT)."""
    if N8N_API_KEY and api_key == N8N_API_KEY:
        return True
    return False


def _get_ploomes_key(org_id: str) -> str | None:
    """Busca a chave Ploomes da variavel de ambiente."""
    return os.getenv("PLOOMES_API_KEY") or None


# ─── MODELS ────────────────────────────────────────────────

class UpdateLeadStatusRequest(BaseModel):
    status: str
    error_message: Optional[str] = None
    channel: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class LogActivityRequest(BaseModel):
    activity_type: str
    channel: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    result: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class PloomesTaskRequest(BaseModel):
    subject: str
    description: Optional[str] = None
    due_date: Optional[str] = None


class PloomesNoteRequest(BaseModel):
    note: str


# ─── GET /sdr/leads - Listar leads para SDR ─────────────────

@router.get("/leads")
def list_sdr_leads(
    status: str = Query(default="pending", description="Filtrar por status"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    order: str = Query(default="created_at.asc", description="Ordenacao (campo.asc ou campo.desc)"),
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    """
    Retorna leads pendentes para processamento pelo n8n.

    O n8n deve chamar este endpoint periodicamente para buscar leads novos.
    Formato otimizado para o n8n processar diretamente.
    """
    org = _org_id(x_org_id)
    params: dict = {
        "select": "*",
        "org_id": f"eq.{org}",
        "order": order,
        "limit": str(limit),
        "offset": str(offset),
    }
    if status != "all":
        params["status"] = f"eq.{status}"

    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/leads_outbound",
        headers=_svc_headers(),
        params=params,
        timeout=15,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    leads = r.json()

    return {
        "success": True,
        "total": len(leads),
        "leads": leads,
    }


# ─── GET /sdr/leads/{lead_id} - Detalhes de um lead ─────────

@router.get("/leads/{lead_id}")
def get_sdr_lead(
    lead_id: str,
    _user: dict = Depends(require_auth),
):
    """Retorna detalhes de um lead especifico, incluindo historico de atividades."""
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/leads_outbound",
        headers=_svc_headers(),
        params={"select": "*", "id": f"eq.{lead_id}"},
        timeout=10,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    leads = r.json()
    if not leads:
        raise HTTPException(status_code=404, detail="Lead nao encontrado")

    activities_r = requests.get(
        f"{SUPABASE_URL}/rest/v1/sdr_activities",
        headers=_svc_headers(),
        params={
            "select": "*",
            "lead_id": f"eq.{lead_id}",
            "order": "created_at.desc",
        },
        timeout=10,
    )
    activities = activities_r.json() if activities_r.status_code == 200 else []

    lead = leads[0]
    lead["activities"] = activities
    return lead


# ─── PATCH /sdr/leads/{lead_id} - Atualizar status ──────────

@router.patch("/leads/{lead_id}")
def update_sdr_lead_status(
    lead_id: str,
    payload: UpdateLeadStatusRequest,
    _user: dict = Depends(require_auth),
):
    """
    Atualiza o status de um lead no fluxo SDR.

    O n8n usa este endpoint apos cada acao (envio de email, resposta, etc).
    """
    VALID_STATUSES = {
        "pending", "processing", "email_sent", "whatsapp_sent",
        "contacted", "responded", "meeting_booked",
        "qualified", "disqualified", "failed",
    }
    if payload.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status invalido. Validos: {sorted(VALID_STATUSES)}"
        )

    update_data: dict = {
        "status": payload.status,
    }

    if payload.status == "processing":
        update_data["attempts"] = "attempts + 1"
        update_data["last_attempt_at"] = "now()"

    if payload.channel:
        update_data["channel"] = payload.channel

    if payload.error_message:
        update_data["error_message"] = payload.error_message

    if payload.status in ("qualified", "disqualified", "meeting_booked"):
        update_data["completed_at"] = "now()"

    if payload.metadata:
        update_data["metadata"] = payload.metadata

    # Para incrementar attempts, precisamos usar RPC ou fazer em dois passos
    if "attempts" in update_data and update_data["attempts"] == "attempts + 1":
        del update_data["attempts"]
        # Primeiro busca o valor atual
        current = requests.get(
            f"{SUPABASE_URL}/rest/v1/leads_outbound",
            headers=_svc_headers(),
            params={"select": "attempts", "id": f"eq.{lead_id}"},
            timeout=10,
        )
        if current.status_code == 200 and current.json():
            update_data["attempts"] = (current.json()[0].get("attempts") or 0) + 1
            update_data["last_attempt_at"] = "now()"

    headers = _svc_headers()
    headers["Prefer"] = "return=representation"
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/leads_outbound",
        headers=headers,
        params={"id": f"eq.{lead_id}"},
        json=update_data,
        timeout=10,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    updated = r.json()
    if not updated:
        raise HTTPException(status_code=404, detail="Lead nao encontrado")

    # Registra atividade de mudanca de status automaticamente
    _log_activity_internal(lead_id, {
        "activity_type": "status_changed",
        "content": f"Status alterado para: {payload.status}",
        "channel": payload.channel,
        "metadata": payload.metadata or {},
    })

    return {"success": True, "lead": updated[0]}


# ─── POST /sdr/leads/{lead_id}/activity - Registrar atividade

@router.post("/leads/{lead_id}/activity")
def log_sdr_activity(
    lead_id: str,
    payload: LogActivityRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    """
    Registra uma atividade do SDR para o lead.

    O n8n usa este endpoint para logar cada interacao:
    email enviado, WhatsApp enviado, resposta recebida, etc.
    """
    org = _org_id(x_org_id)
    VALID_TYPES = {
        "email_sent", "whatsapp_sent", "linkedin_sent", "phone_call",
        "lead_responded", "meeting_booked", "status_changed",
        "note_added", "ploomes_synced", "error",
    }
    if payload.activity_type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo invalido. Validos: {sorted(VALID_TYPES)}"
        )

    row = {
        "lead_id": lead_id,
        "org_id": org,
        "activity_type": payload.activity_type,
        "channel": payload.channel,
        "subject": payload.subject,
        "content": payload.content,
        "result": payload.result,
        "metadata": payload.metadata or {},
    }

    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/sdr_activities",
        headers=_svc_headers(),
        json=row,
        timeout=10,
    )
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    created = r.json()
    return {"success": True, "activity": created[0] if created else None}


def _log_activity_internal(lead_id: str, data: dict):
    """Helper interno para logar atividades sem HTTPException."""
    try:
        row = {
            "lead_id": lead_id,
            "org_id": data.get("org_id", "default"),
            "activity_type": data.get("activity_type", "status_changed"),
            "channel": data.get("channel"),
            "subject": data.get("subject"),
            "content": data.get("content"),
            "result": data.get("result"),
            "metadata": data.get("metadata", {}),
        }
        requests.post(
            f"{SUPABASE_URL}/rest/v1/sdr_activities",
            headers=_svc_headers(),
            json=row,
            timeout=10,
        )
    except Exception as e:
        logger.warning(f"Falha ao logar atividade SDR: {e}")


# ─── POST /sdr/leads/{lead_id}/ploomes-sync - Sync Ploomes ──

@router.post("/leads/{lead_id}/ploomes-sync")
def sync_lead_to_ploomes(
    lead_id: str,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    """
    Sincroniza o status e atividades de um lead com o Ploomes.

    Atualiza o deal no Ploomes com as atividades registradas e
    adiciona interacoes/tarefas no historico do contato.
    """
    org = _org_id(x_org_id)
    ploomes_key = _get_ploomes_key(org)
    if not ploomes_key:
        raise HTTPException(status_code=400, detail="Chave Ploomes nao configurada")

    # Buscar lead
    lead_r = requests.get(
        f"{SUPABASE_URL}/rest/v1/leads_outbound",
        headers=_svc_headers(),
        params={"select": "*", "id": f"eq.{lead_id}"},
        timeout=10,
    )
    if lead_r.status_code >= 300 or not lead_r.json():
        raise HTTPException(status_code=404, detail="Lead nao encontrado")

    lead = lead_r.json()[0]
    contact_id = lead.get("ploomes_contact_id")
    deal_id = lead.get("ploomes_deal_id")

    if not contact_id:
        raise HTTPException(status_code=400, detail="Lead sem ploomes_contact_id")

    ploomes_headers = {
        "User-Key": ploomes_key,
        "Content-Type": "application/json",
    }

    # Buscar atividades nao sincronizadas
    act_r = requests.get(
        f"{SUPABASE_URL}/rest/v1/sdr_activities",
        headers=_svc_headers(),
        params={
            "select": "*",
            "lead_id": f"eq.{lead_id}",
            "ploomes_synced": "eq.false",
            "order": "created_at.asc",
        },
        timeout=10,
    )
    activities = act_r.json() if act_r.status_code == 200 else []

    synced_count = 0
    for act in activities:
        interaction_body = {
            "ContactId": contact_id,
            "Content": _format_ploomes_interaction(act),
        }
        if deal_id:
            interaction_body["DealId"] = deal_id

        try:
            ir = requests.post(
                f"{PLOOMES_BASE}/InteractionRecords",
                headers=ploomes_headers,
                json=interaction_body,
                timeout=15,
            )
            if ir.status_code < 300:
                # Marca como sincronizado
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/sdr_activities",
                    headers=_svc_headers(),
                    params={"id": f"eq.{act['id']}"},
                    json={"ploomes_synced": True},
                    timeout=10,
                )
                synced_count += 1
        except Exception as e:
            logger.warning(f"Falha ao sincronizar atividade {act['id']} com Ploomes: {e}")

    # Atualizar status do deal no Ploomes se necessario
    if deal_id and lead.get("status") in ("qualified", "meeting_booked"):
        _update_ploomes_deal_stage(ploomes_headers, deal_id, lead["status"])

    return {
        "success": True,
        "synced_activities": synced_count,
        "total_activities": len(activities),
        "ploomes_contact_id": contact_id,
        "ploomes_deal_id": deal_id,
    }


# ─── POST /sdr/leads/{lead_id}/ploomes-task - Criar tarefa ──

@router.post("/leads/{lead_id}/ploomes-task")
def create_ploomes_task(
    lead_id: str,
    payload: PloomesTaskRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    """Cria uma tarefa no Ploomes vinculada ao contato do lead."""
    org = _org_id(x_org_id)
    ploomes_key = _get_ploomes_key(org)
    if not ploomes_key:
        raise HTTPException(status_code=400, detail="Chave Ploomes nao configurada")

    lead_r = requests.get(
        f"{SUPABASE_URL}/rest/v1/leads_outbound",
        headers=_svc_headers(),
        params={"select": "ploomes_contact_id,ploomes_deal_id", "id": f"eq.{lead_id}"},
        timeout=10,
    )
    if lead_r.status_code >= 300 or not lead_r.json():
        raise HTTPException(status_code=404, detail="Lead nao encontrado")

    lead = lead_r.json()[0]
    contact_id = lead.get("ploomes_contact_id")
    if not contact_id:
        raise HTTPException(status_code=400, detail="Lead sem ploomes_contact_id")

    task_body: dict = {
        "ContactId": contact_id,
        "Description": payload.subject,
        "Note": payload.description or "",
    }
    if lead.get("ploomes_deal_id"):
        task_body["DealId"] = lead["ploomes_deal_id"]
    if payload.due_date:
        task_body["DueDate"] = payload.due_date

    ploomes_headers = {"User-Key": ploomes_key, "Content-Type": "application/json"}
    r = requests.post(f"{PLOOMES_BASE}/Tasks", headers=ploomes_headers, json=task_body, timeout=15)
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=f"Ploomes Tasks: {r.text}")

    return {"success": True, "message": "Tarefa criada no Ploomes"}


# ─── POST /sdr/leads/{lead_id}/ploomes-note - Adicionar nota ─

@router.post("/leads/{lead_id}/ploomes-note")
def add_ploomes_note(
    lead_id: str,
    payload: PloomesNoteRequest,
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    """Adiciona uma nota/interacao no Ploomes vinculada ao contato."""
    org = _org_id(x_org_id)
    ploomes_key = _get_ploomes_key(org)
    if not ploomes_key:
        raise HTTPException(status_code=400, detail="Chave Ploomes nao configurada")

    lead_r = requests.get(
        f"{SUPABASE_URL}/rest/v1/leads_outbound",
        headers=_svc_headers(),
        params={"select": "ploomes_contact_id,ploomes_deal_id", "id": f"eq.{lead_id}"},
        timeout=10,
    )
    if lead_r.status_code >= 300 or not lead_r.json():
        raise HTTPException(status_code=404, detail="Lead nao encontrado")

    lead = lead_r.json()[0]
    contact_id = lead.get("ploomes_contact_id")
    if not contact_id:
        raise HTTPException(status_code=400, detail="Lead sem ploomes_contact_id")

    body: dict = {
        "ContactId": contact_id,
        "Content": payload.note,
    }
    if lead.get("ploomes_deal_id"):
        body["DealId"] = lead["ploomes_deal_id"]

    ploomes_headers = {"User-Key": ploomes_key, "Content-Type": "application/json"}
    r = requests.post(f"{PLOOMES_BASE}/InteractionRecords", headers=ploomes_headers, json=body, timeout=15)
    if r.status_code >= 300:
        raise HTTPException(status_code=r.status_code, detail=f"Ploomes InteractionRecords: {r.text}")

    return {"success": True, "message": "Nota adicionada no Ploomes"}


# ─── GET /sdr/stats - Estatisticas do SDR ────────────────────

@router.get("/stats")
def sdr_stats(
    _user: dict = Depends(require_auth),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
):
    """Retorna metricas do SDR: leads por status, taxa de conversao, etc."""
    org = _org_id(x_org_id)

    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/leads_outbound",
        headers=_svc_headers(),
        params={"select": "status", "org_id": f"eq.{org}"},
        timeout=15,
    )
    if r.status_code >= 300:
        return {"success": False, "error": r.text}

    leads = r.json()
    total = len(leads)
    by_status: dict = {}
    for lead in leads:
        s = lead.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1

    responded = by_status.get("responded", 0) + by_status.get("meeting_booked", 0) + by_status.get("qualified", 0)
    contacted = responded + by_status.get("contacted", 0) + by_status.get("email_sent", 0) + by_status.get("whatsapp_sent", 0)

    return {
        "success": True,
        "total_leads": total,
        "by_status": by_status,
        "contacted": contacted,
        "responded": responded,
        "conversion_rate": round((responded / contacted * 100) if contacted > 0 else 0, 1),
    }


# ─── HELPERS ─────────────────────────────────────────────────

def _format_ploomes_interaction(activity: dict) -> str:
    """Formata uma atividade SDR para conteudo de interacao Ploomes."""
    tipo = activity.get("activity_type", "")
    channel = activity.get("channel", "")
    subject = activity.get("subject", "")
    content = activity.get("content", "")
    result = activity.get("result", "")

    LABELS = {
        "email_sent": "Email Enviado",
        "whatsapp_sent": "WhatsApp Enviado",
        "linkedin_sent": "LinkedIn Enviado",
        "phone_call": "Ligacao Realizada",
        "lead_responded": "Lead Respondeu",
        "meeting_booked": "Reuniao Agendada",
        "status_changed": "Status Alterado",
        "note_added": "Nota Adicionada",
    }
    label = LABELS.get(tipo, tipo)

    parts = [f"[Hermes SDR] {label}"]
    if channel:
        parts.append(f"Canal: {channel}")
    if subject:
        parts.append(f"Assunto: {subject}")
    if content:
        parts.append(content)
    if result:
        parts.append(f"Resultado: {result}")

    return "\n".join(parts)


def _update_ploomes_deal_stage(headers: dict, deal_id: int, status: str):
    """Atualiza o estagio do deal no Ploomes baseado no status SDR."""
    stage_map = {
        "qualified": "Qualificado",
        "meeting_booked": "Reuniao Agendada",
    }
    stage_name = stage_map.get(status)
    if not stage_name:
        return

    try:
        props = [{"FieldKey": "Deals_StatusSDR", "ObjectValueAsString": stage_name}]
        requests.patch(
            f"{PLOOMES_BASE}/Deals({deal_id})",
            headers=headers,
            json={"OtherProperties": props},
            timeout=15,
        )
    except Exception as e:
        logger.warning(f"Falha ao atualizar estagio do deal {deal_id}: {e}")
