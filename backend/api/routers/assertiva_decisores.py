from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from middleware.auth import require_auth

router = APIRouter(prefix="/prospeccao", tags=["Prospecção", "Assertiva"])


class AssertivaDecisoresCNPJRequest(BaseModel):
    cnpj: str = Field(..., description="CNPJ do lead (com ou sem formatação)")
    id_finalidade: int = Field(
        5,
        description="Finalidade LGPD: 1=Confirmação identidade, 2=Ciclo crédito, 4=Execução contrato, 5=Legítimo interesse",
    )
    max_decisores: Optional[int] = Field(
        None,
        ge=1,
        le=5000,
        description="Limite de decisores a retornar (null = sem limite)",
    )


@router.post("/assertiva/decisores/cnpj", summary="Consultar decisores por CNPJ na Assertiva")
async def prospeccao_assertiva_decisores_cnpj(
    body: AssertivaDecisoresCNPJRequest,
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Recebe um CNPJ e consulta a Assertiva para extrair uma lista de decisores (nome + WhatsApp).
    """
    from api.assertiva_decisores import consultar_decisores_cnpj

    try:
        resultado = await consultar_decisores_cnpj(
            body.cnpj,
            id_finalidade=body.id_finalidade,
            max_decisores=body.max_decisores,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"success": True, "data": resultado}

