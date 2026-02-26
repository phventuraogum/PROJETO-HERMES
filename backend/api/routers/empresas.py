"""
Endpoints de Empresas Individuais
Para buscar, validar e enriquecer empresas específicas.
Todos os endpoints requerem autenticação.
"""
from fastapi import APIRouter, HTTPException, Path, Query, Depends
from typing import Optional, Dict, Any
from pydantic import BaseModel

from api.db_pool import get_connection
from api.validation_service import validar_cnpj, verificar_cnpj_receita, calcular_score_confiabilidade
from api.quality_service import QualityService, calcular_score_priorizacao
from api.enrichment_service import enrichment_service
from middleware.auth import require_auth

router = APIRouter(prefix="/empresas", tags=["Empresas"])


@router.get("/{cnpj}")
async def buscar_empresa(
    cnpj: str = Path(..., description="CNPJ da empresa (com ou sem formatação)"),
    incluir_enriquecimento: bool = Query(True, description="Incluir dados enriquecidos"),
    incluir_scores: bool = Query(True, description="Incluir scores de qualidade"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Busca empresa por CNPJ.
    
    **Exemplo:**
    ```
    GET /empresas/12345678000190
    ```
    
    Retorna dados completos da empresa incluindo:
    - Dados da Receita
    - Dados enriquecidos (se disponível)
    - Validações
    - Scores de qualidade
    """
    # Valida CNPJ
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ inválido")
    
    try:
        with get_connection(read_only=True) as conn:
            # Busca empresa
            query = """
                SELECT
                    e.CNPJ_COMPLETO as cnpj,
                    e.RAZAO_SOCIAL as razao_social,
                    e.NOME_FANTASIA as nome_fantasia,
                    m.NOME_MUNICIPIO as cidade,
                    e.UF as uf,
                    e.CNAE_PRINCIPAL as cnae_principal,
                    e.SITUACAO_CADASTRAL as situacao_cadastral,
                    e.CAPITAL_SOCIAL as capital_social_str,
                    TRY_CAST(
                        REPLACE(REPLACE(e.CAPITAL_SOCIAL, '.', ''), ',', '.') AS DOUBLE
                    ) as capital_social,
                    e.TELEFONE1 as telefone_receita,
                    e.EMAIL as email_receita,
                    ew.site,
                    ew.email_enriquecido,
                    ew.telefone_enriquecido,
                    ew.whatsapp_publico,
                    ew.whatsapp_enriquecido,
                    ew.enriquecimento_ia,
                    ew.updated_at as enriquecimento_data
                FROM cnpj_empresas e
                LEFT JOIN municipios m
                    ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
                LEFT JOIN empresas_enriquecidas ew
                    ON ew.cnpj = e.CNPJ_COMPLETO
                WHERE e.CNPJ_COMPLETO = ?
                LIMIT 1
            """
            
            row = conn.execute(query, [cnpj_limpo]).fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Empresa não encontrada")
            
            # Monta resposta
            empresa = {
                "cnpj": str(row[0]),
                "razao_social": str(row[1]) if row[1] else None,
                "nome_fantasia": str(row[2]) if row[2] else None,
                "cidade": str(row[3]) if row[3] else None,
                "uf": str(row[4]) if row[4] else None,
                "cnae_principal": str(row[5]) if row[5] else None,
                "situacao_cadastral": str(row[6]) if row[6] else None,
                "capital_social": float(row[8]) if row[8] else None,
                "telefone_receita": str(row[9]) if row[9] else None,
                "email_receita": str(row[10]) if row[10] else None,
                "site": str(row[11]) if row[11] else None,
                "email_enriquecido": str(row[12]) if row[12] else None,
                "telefone_enriquecido": str(row[13]) if row[13] else None,
                "whatsapp_publico": str(row[14]) if row[14] else None,
                "whatsapp_enriquecido": str(row[15]) if row[15] else None,
                "enriquecimento_ia": row[16] if row[16] else None,
                "enriquecimento_data": str(row[17]) if row[17] else None
            }
            
            # Contatos finais (fallback)
            empresa["email_final"] = empresa.get("email_enriquecido") or empresa.get("email_receita")
            empresa["telefone_final"] = empresa.get("telefone_enriquecido") or empresa.get("telefone_receita")
            empresa["whatsapp_final"] = empresa.get("whatsapp_enriquecido") or empresa.get("whatsapp_publico")
            
            # Validações
            empresa["validacao"] = {
                "cnpj_valido": cnpj_valido,
                "cnpj_limpo": cnpj_limpo
            }
            
            # Verifica na Receita se solicitado
            if incluir_enriquecimento:
                receita_info = verificar_cnpj_receita(cnpj_limpo)
                empresa["validacao"]["receita"] = receita_info
            
            # Scores se solicitado
            if incluir_scores:
                confiabilidade = calcular_score_confiabilidade(
                    email=empresa.get("email_final"),
                    telefone=empresa.get("telefone_final"),
                    whatsapp=empresa.get("whatsapp_final"),
                    cnpj=cnpj_limpo,
                    fonte_dados="enriquecido" if empresa.get("site") else "receita"
                )
                empresa["confiabilidade"] = confiabilidade
                
                qualidade = QualityService.calcular_qualidade_completa(empresa)
                empresa["qualidade"] = {
                    "completude": qualidade.completude,
                    "precisao": qualidade.precisao,
                    "atualidade": qualidade.atualidade,
                    "consistencia": qualidade.consistencia,
                    "score_total": qualidade.score_total
                }
                
                priorizacao = calcular_score_priorizacao(empresa)
                empresa["priorizacao"] = priorizacao
            
            return {
                "success": True,
                "empresa": empresa
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{cnpj}/enriquecer")
async def enriquecer_empresa(
    cnpj: str = Path(..., description="CNPJ da empresa"),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    """
    Força enriquecimento de uma empresa específica.
    
    Útil para webhooks e automações (n8n, Kommo).
    
    **Exemplo:**
    ```
    POST /empresas/12345678000190/enriquecer
    ```
    """
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    if not cnpj_valido:
        raise HTTPException(status_code=400, detail="CNPJ inválido")
    
    try:
        # Busca dados básicos
        with get_connection(read_only=True) as conn:
            row = conn.execute(
                """
                SELECT
                    e.CNPJ_COMPLETO,
                    e.RAZAO_SOCIAL,
                    e.NOME_FANTASIA,
                    m.NOME_MUNICIPIO,
                    e.UF,
                    e.CNAE_PRINCIPAL
                FROM cnpj_empresas e
                LEFT JOIN municipios m
                    ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
                WHERE e.CNPJ_COMPLETO = ?
                LIMIT 1
                """,
                [cnpj_limpo]
            ).fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
        
        # Enriquece
        resultado = enrichment_service.enrich_company_complete(
            cnpj=str(row[0]),
            razao_social=str(row[1] or ""),
            nome_fantasia=str(row[2]) if row[2] else None,
            cidade=str(row[3]) if row[3] else None,
            uf=str(row[4]) if row[4] else None,
            cnae_principal=str(row[5]) if row[5] else None
        )
        
        return {
            "success": True,
            "cnpj": cnpj_limpo,
            "enriquecimento": resultado,
            "message": "Enriquecimento iniciado. Dados serão salvos em background."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
