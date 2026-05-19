"""
Endpoints de Prospecção
Otimizados para integração com n8n, Kommo, etc.
Todos os endpoints requerem autenticação.
"""
from fastapi import APIRouter, HTTPException, Query, Body, Depends
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from middleware.auth import require_auth, require_auth_or_api_key
from api.query_translator import query_translator_service
from api.db_pool import get_connection

try:
    from api.prospeccao_service import rodar_prospeccao_otimizada
    USE_OTIMIZADA = True
except ImportError:
    from api.main import rodar_prospeccao_icp
    USE_OTIMIZADA = False

try:
    from api.quality_service import calcular_score_priorizacao
except ImportError:
    def calcular_score_priorizacao(empresa):
        return {"score_total": 0.5}

try:
    from api.validation_service import calcular_score_confiabilidade
except ImportError:
    def calcular_score_confiabilidade(**kwargs):
        return {"score_total": 0.5}

router = APIRouter(prefix="/prospeccao", tags=["Prospecção"])


class ProspeccaoRequest(BaseModel):
    """Request padronizado para prospecção"""
    termo: Optional[str] = Field(None, description="Termo de busca (nome/razão social)")
    uf: Optional[str] = Field(None, description="UF (ex: SP, RJ)")
    municipio: Optional[str] = Field(None, description="Município")
    capital_minima: Optional[float] = Field(None, ge=0, description="Capital social mínimo")
    cnaes: Optional[List[str]] = Field(None, description="Lista de CNAEs")
    segmentos: Optional[List[str]] = Field(None, description="Lista de segmentos")
    portes: Optional[List[str]] = Field(None, description="Lista de portes (ME, EPP, Médio, Grande)")
    limite: int = Field(200, ge=1, le=1000, description="Limite de resultados")
    enriquecer_background: bool = Field(True, description="Enriquecer em background")
    incluir_score: bool = Field(True, description="Incluir scores de qualidade e priorização")
    formato: str = Field("padrao", description="Formato de resposta: padrao, kommo, n8n")


class ProspeccaoResponse(BaseModel):
    """Response padronizado"""
    success: bool
    total: int
    empresas: List[Dict[str, Any]]
    metadata: Dict[str, Any]


class QueryTranslateRequest(BaseModel):
    query: str = Field(..., min_length=3, description="Texto livre da prospeccao")
    defaults: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Config atual para preservar campos nao mencionados",
    )


# ──────────────────────────────────────────────────────────────────────────
# TAM Calculator — calcula Total Addressable Market dado um perfil ICP
# ──────────────────────────────────────────────────────────────────────────
class TamRequest(BaseModel):
    """Filtros pra calcular TAM (empresas brasileiras ativas que batem ICP)."""
    ufs: Optional[List[str]] = Field(None, description="Lista de UFs (ex: ['SP', 'RJ'])")
    capital_minimo: Optional[float] = Field(None, ge=0, description="Capital social mínimo")
    capital_maximo: Optional[float] = Field(None, ge=0, description="Capital social máximo (opcional)")
    cnae_prefixes: Optional[List[str]] = Field(None, description="Prefixos CNAE (ex: ['62', '70'])")
    portes: Optional[List[str]] = Field(None, description="Portes desejados (ME/EPP/Grande/Medio)")
    incluir_breakdown_uf: bool = Field(True, description="Retornar contagem por UF")


class TamResponse(BaseModel):
    total_estimado: int
    por_uf: Dict[str, int]
    criterios: Dict[str, Any]
    fonte: str = "Receita Federal · cnpj_empresas (situação ativa)"


@router.post("/tam", response_model=TamResponse, summary="TAM Calculator — empresas que batem o ICP")
async def calcular_tam(
    request: TamRequest = Body(...),
    _user: dict = Depends(require_auth),
) -> TamResponse:
    """
    Conta empresas ativas (SITUACAO_CADASTRAL='02') no BR que batem critérios ICP.

    Útil pra:
    - Validar tamanho do mercado antes de prospectar
    - Estimar pipeline máximo dado um ICP
    - Comparar 2 ICPs (rodar 2x e ver qual tem TAM maior)

    Exemplo:
        {"ufs": ["SP","MG"], "capital_minimo": 100000, "cnae_prefixes": ["62"]}
        → conta indústrias R$ 100k+ de TI/Software em SP+MG.
    """
    # Mapeamento de portes Receita Federal
    porte_map = {
        "ME": "01", "MICRO": "01",
        "EPP": "03", "PEQUENO": "03",
        "MEDIO": "05", "GRANDE": "05",  # Receita não distingue médio/grande
    }

    where: List[str] = ["SITUACAO_CADASTRAL = '02'"]  # somente ativas
    params: List[Any] = []

    if request.ufs:
        ufs = [u.upper().strip() for u in request.ufs if u and len(u.strip()) == 2]
        if ufs:
            placeholders = ",".join("?" * len(ufs))
            where.append(f"UF IN ({placeholders})")
            params.extend(ufs)

    if request.capital_minimo is not None:
        where.append("CAPITAL_SOCIAL >= ?")
        params.append(float(request.capital_minimo))

    if request.capital_maximo is not None:
        where.append("CAPITAL_SOCIAL <= ?")
        params.append(float(request.capital_maximo))

    if request.cnae_prefixes:
        prefixes = [p.strip() for p in request.cnae_prefixes if p and p.strip()]
        if prefixes:
            cnae_or = " OR ".join(["CNAE_PRINCIPAL LIKE ?"] * len(prefixes))
            where.append(f"({cnae_or})")
            params.extend([f"{p}%" for p in prefixes])

    if request.portes:
        codigos = sorted({porte_map.get(p.upper().strip(), p.upper().strip()) for p in request.portes if p})
        if codigos:
            placeholders = ",".join("?" * len(codigos))
            where.append(f"PORTE_EMPRESA IN ({placeholders})")
            params.extend(codigos)

    where_clause = " AND ".join(where)

    try:
        with get_connection(read_only=True) as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM cnpj_empresas WHERE {where_clause}",
                params,
            ).fetchone()[0]

            por_uf: Dict[str, int] = {}
            if request.incluir_breakdown_uf:
                rows = conn.execute(
                    f"SELECT UF, COUNT(*) AS c FROM cnpj_empresas WHERE {where_clause} "
                    f"GROUP BY UF ORDER BY c DESC LIMIT 30",
                    params,
                ).fetchall()
                por_uf = {uf: int(c) for uf, c in rows if uf}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro calculando TAM: {e}")

    return TamResponse(
        total_estimado=int(total or 0),
        por_uf=por_uf,
        criterios={
            "ufs": request.ufs or [],
            "capital_minimo": request.capital_minimo,
            "capital_maximo": request.capital_maximo,
            "cnae_prefixes": request.cnae_prefixes or [],
            "portes": request.portes or [],
        },
    )


@router.post("", response_model=ProspeccaoResponse)
async def prospeccao(
    request: ProspeccaoRequest = Body(...),
    _user: dict = Depends(require_auth),
) -> ProspeccaoResponse:
    """
    Endpoint principal de prospecção.
    
    Otimizado para integrações:
    - n8n: Use formato "n8n" para resposta simplificada
    - Kommo: Use formato "kommo" para formato compatível com CRM
    - Dashboard: Use formato "padrao" para dados completos
    
    **Exemplo para n8n:**
    ```json
    {
        "termo": "hospital",
        "uf": "SP",
        "limite": 50,
        "formato": "n8n"
    }
    ```
    """
    try:
        filtros_aplicados: Dict[str, Any] = {}

        if USE_OTIMIZADA:
            resultado = rodar_prospeccao_otimizada(
                termo=request.termo,
                uf=request.uf,
                municipio=request.municipio,
                capital_minima=request.capital_minima,
                cnaes=request.cnaes,
                segmentos=request.segmentos,
                portes=request.portes,
                limite=request.limite,
                enriquecer_background=request.enriquecer_background,
            )
            empresas = resultado.get("empresas", [])
            filtros_aplicados = resultado.get("filtros_aplicados", {})
        else:
            from api.main import ProspeccaoConfig, rodar_prospeccao_icp
            config = ProspeccaoConfig(
                termo_base=request.termo or "",
                uf=request.uf,
                cidade=request.municipio,
                capital_minima=request.capital_minima,
                cnaes=request.cnaes or [],
                segmentos=request.segmentos or [],
                portes=request.portes or [],
                limite_empresas=request.limite,
                enriquecer_web=request.enriquecer_background,
            )
            resultado_legado = rodar_prospeccao_icp(config)
            empresas = []
            for emp in resultado_legado.empresas:
                empresas.append({
                    "cnpj": emp.cnpj,
                    "razao_social": emp.razao_social,
                    "nome_fantasia": emp.nome_fantasia,
                    "cidade": emp.cidade,
                    "uf": emp.uf,
                    "cnae_principal": emp.cnae_principal,
                    "capital_social": emp.capital_social,
                    "porte": emp.porte,
                    "segmento": emp.segmento,
                    "telefone_receita": emp.telefone_receita,
                    "email_receita": emp.email,
                    "telefone_final": emp.telefone_padrao or emp.telefone_enriquecido,
                    "email_final": emp.email_enriquecido or emp.email,
                    "whatsapp_final": emp.whatsapp_enriquecido or emp.whatsapp_publico,
                    "site": emp.site,
                    "logradouro": emp.logradouro,
                    "numero": emp.numero,
                    "cep": emp.cep,
                })

        if request.formato == "kommo":
            empresas = _formatar_kommo(empresas)
        elif request.formato == "n8n":
            empresas = _formatar_n8n(empresas)

        return ProspeccaoResponse(
            success=True,
            total=len(empresas),
            empresas=empresas,
            metadata={
                "filtros": request.model_dump(exclude={"formato", "incluir_score", "enriquecer_background"}),
                "filtros_aplicados": filtros_aplicados,
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate-query")
async def translate_query_prompt(
    body: QueryTranslateRequest = Body(...),
    _user: dict = Depends(require_auth),
) -> Dict[str, Any]:
    try:
        translated = await query_translator_service.translate_query(
            body.query,
            defaults=body.defaults,
        )
        return {"success": True, **translated}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("")
async def prospeccao_get(
    _user: dict = Depends(require_auth),
    termo: Optional[str] = Query(None, description="Termo de busca"),
    uf: Optional[str] = Query(None, description="UF"),
    municipio: Optional[str] = Query(None, description="Município"),
    capital_minima: Optional[float] = Query(None, ge=0, description="Capital mínimo"),
    limite: int = Query(200, ge=1, le=1000, description="Limite de resultados"),
    formato: str = Query("padrao", description="Formato: padrao, kommo, n8n"),
):
    """
    Versão GET da prospecção (para n8n e webhooks).

    **Exemplo:**
    ```
    GET /prospeccao?termo=hospital&uf=SP&limite=50&formato=n8n
    ```
    """
    request = ProspeccaoRequest(
        termo=termo,
        uf=uf,
        municipio=municipio,
        capital_minima=capital_minima,
        limite=limite,
        formato=formato,
    )
    # Passa _user explicitamente para reutilizar o endpoint POST sem duplicar auth
    return await prospeccao(request, _user)


def _formatar_kommo(empresas: List[Dict]) -> List[Dict]:
    """Formata empresas para formato Kommo CRM"""
    formatted = []
    for emp in empresas:
        formatted.append({
            "name": emp.get("razao_social") or emp.get("nome_fantasia", "Sem nome"),
            "company_name": emp.get("razao_social"),
            "phone": emp.get("telefone_final") or emp.get("telefone_receita"),
            "email": emp.get("email_final") or emp.get("email_receita"),
            "website": emp.get("site"),
            "address": f"{emp.get('logradouro', '')} {emp.get('numero', '')}".strip(),
            "city": emp.get("cidade"),
            "state": emp.get("uf"),
            "zip": emp.get("cep"),
            "custom_fields": {
                "cnpj": emp.get("cnpj"),
                "cnae": emp.get("cnae_principal"),
                "cnae_descricao": emp.get("cnae_descricao"),
                "capital_social": emp.get("capital_social"),
                "porte": emp.get("porte"),
                "segmento": emp.get("segmento"),
                "data_abertura": emp.get("data_inicio_atividade"),
                "socios": emp.get("socios_resumo"),
                "whatsapp": emp.get("whatsapp_final"),
                "score_priorizacao": emp.get("scores", {}).get("score_total", 0),
                "score_confiabilidade": emp.get("confiabilidade", {}).get("score_total", 0)
            }
        })
    return formatted


def _formatar_n8n(empresas: List[Dict]) -> List[Dict]:
    """Formata empresas para formato n8n (simplificado)"""
    formatted = []
    for emp in empresas:
        formatted.append({
            "cnpj": emp.get("cnpj"),
            "nome": emp.get("razao_social") or emp.get("nome_fantasia"),
            "nome_fantasia": emp.get("nome_fantasia"),
            "email": emp.get("email_final") or emp.get("email_receita"),
            "telefone": emp.get("telefone_final") or emp.get("telefone_receita"),
            "whatsapp": emp.get("whatsapp_final"),
            "site": emp.get("site"),
            "cidade": emp.get("cidade"),
            "uf": emp.get("uf"),
            "cnae": emp.get("cnae_principal"),
            "cnae_descricao": emp.get("cnae_descricao"),
            "segmento": emp.get("segmento"),
            "porte": emp.get("porte"),
            "capital_social": emp.get("capital_social"),
            "data_abertura": emp.get("data_inicio_atividade"),
            "socios": emp.get("socios_resumo"),
            "score": emp.get("scores", {}).get("score_total", 0),
            "confiabilidade": emp.get("confiabilidade", {}).get("score_total", 0)
        })
    return formatted


# ============================================================
# PGFN — prospeccao filtrada por divida ativa da Uniao
# ============================================================

class PGFNRequest(BaseModel):
    uf: Optional[str] = Field(None, description="UF (ex: SP, RJ). None = todos os estados")
    municipio: Optional[str] = Field(None, description="Municipio (busca parcial)")
    divida_min: float = Field(0, ge=0, description="Divida PGFN minima em R$")
    divida_max: float = Field(10_000_000, ge=0, description="Divida PGFN maxima em R$ (default 10M)")
    portes: Optional[List[str]] = Field(None, description="Portes: ME, EPP, Grande")
    cnaes: Optional[List[str]] = Field(None, description="CNAEs ou segmentos")
    limite: int = Field(200, ge=1, le=1000, description="Limite de resultados")
    ordem: str = Field("divida_desc", description="Ordem: divida_desc, divida_asc, capital_desc, recente")
    formato: str = Field("padrao", description="Formato: padrao, n8n, kommo")


@router.post("/pgfn", summary="Prospecção filtrada por Divida Ativa PGFN")
async def prospeccao_pgfn(
    request: PGFNRequest = Body(...),
    _user: dict = Depends(require_auth_or_api_key),
) -> Dict[str, Any]:
    """
    Cruza a base de 22M empresas ativas com a Divida Ativa da Uniao (PGFN).

    Requer que a tabela `pgfn_dividas` exista em cnpj.duckdb.
    Para importar: `python scripts/import_pgfn.py --db /data/cnpj.duckdb --dir /data/pgfn`

    **Exemplos de uso:**
    - Empresas SP com divida ate R$10M: `{"uf": "SP", "divida_max": 10000000}`
    - EPPs/MEs no RJ com divida entre 100k e 500k: `{"uf": "RJ", "divida_min": 100000, "divida_max": 500000, "portes": ["ME", "EPP"]}`
    """
    from api.db_pool import get_cnpj_connection

    porte_map = {"ME": "01", "EPP": "03", "Grande": "05", "Medio": "05", "grande": "05", "medio": "05"}
    segmento_cnaes = {
        "ti": ["6201","6202","6203","6204","6209","6311","6319","6399"],
        "saude": ["8610","8621","8622","8630","8640","8650","8660","8690"],
        "juridico": ["6911","6912"],
        "contabil": ["6920"],
        "consultoria": ["7020","7490"],
        "logistica": ["4930","5210","5229","5250","5310","5320"],
        "industria": ["2800","2810","2821","2822","2823","2824","2825","2829","2830","2840"],
        "varejo": ["4711","4712","4713","4721","4722","4723","4724","4729","4731"],
        "alimentacao": ["5611","5612","5620"],
        "educacao": ["8511","8512","8513","8520","8531","8532","8541","8542","8550","8591","8592","8593","8599"],
    }

    try:
        with get_connection(read_only=True) as con:
            conditions = [
                "p.divida_total >= ?",
                "p.divida_total <= ?",
                "p.divida_total > 0",
                "b.SITUACAO_CADASTRAL = '02'",
            ]
            params: List[Any] = [request.divida_min, request.divida_max]

            if request.uf:
                conditions.append("b.UF = ?")
                params.append(request.uf.upper())

            if request.municipio:
                conditions.append("UPPER(b.cidade_nome) LIKE ?")
                params.append(f"%{request.municipio.upper()}%")

            # Porte
            if request.portes:
                codigos = list({porte_map.get(p, p) for p in request.portes})
                placeholders = ", ".join("?" * len(codigos))
                conditions.append(f"b.PORTE_EMPRESA IN ({placeholders})")
                params.extend(codigos)

            # CNAEs / segmentos
            if request.cnaes:
                cnae_codes = []
                for c in request.cnaes:
                    expanded = segmento_cnaes.get(c.lower())
                    if expanded:
                        cnae_codes.extend(expanded)
                    else:
                        cnae_codes.append(c)
                if cnae_codes:
                    phs = ", ".join("?" * len(cnae_codes))
                    conditions.append(f"LEFT(b.CNAE_PRINCIPAL, {min(4,len(cnae_codes[0]))}) IN ({phs})")
                    params.extend(cnae_codes)

            ordem_map = {
                "divida_desc": "p.divida_total DESC",
                "divida_asc":  "p.divida_total ASC",
                "capital_desc": "b.CAPITAL_SOCIAL_NUM DESC NULLS LAST",
                "recente": "b.DATA_INICIO_ATIVIDADE DESC NULLS LAST",
            }
            order_clause = ordem_map.get(request.ordem, "p.divida_total DESC")

            where = " AND ".join(conditions)
            sql = f"""
                SELECT
                    b.cnpj,
                    b.RAZAO_SOCIAL          AS razao_social,
                    b.NOME_FANTASIA         AS nome_fantasia,
                    b.cnae_descricao,
                    b.CNAE_PRINCIPAL        AS cnae_principal,
                    b.PORTE_EMPRESA         AS porte_cod,
                    b.CAPITAL_SOCIAL_NUM    AS capital_social,
                    b.email_final,
                    b.email_receita,
                    b.telefone_final,
                    b.telefone_receita,
                    b.whatsapp_final,
                    b.site,
                    b.cidade_nome,
                    b.UF                    AS uf,
                    b.LOGRADOURO            AS logradouro,
                    b.NUMERO                AS numero,
                    b.CEP                   AS cep,
                    b.DATA_INICIO_ATIVIDADE AS data_abertura,
                    p.divida_total          AS divida_pgfn,
                    p.qtd_inscricoes
                FROM vw_prospeccao_base AS b
                INNER JOIN pgfn_dividas AS p ON p.cnpj = b.cnpj
                WHERE {where}
                ORDER BY {order_clause}
                LIMIT {request.limite}
            """

            rows = con.execute(sql, params).fetchdf()

        porte_label = {"01": "ME", "03": "EPP", "05": "Medio/Grande"}
        empresas = []
        for _, row in rows.iterrows():
            e = {
                "cnpj": row["cnpj"],
                "razao_social": row["razao_social"],
                "nome_fantasia": row["nome_fantasia"],
                "cnae_principal": row["cnae_principal"],
                "cnae_descricao": row["cnae_descricao"],
                "porte": porte_label.get(str(row["porte_cod"]).strip(), str(row["porte_cod"])),
                "capital_social": row["capital_social"],
                "email_final": row["email_final"] or row["email_receita"],
                "telefone_final": row["telefone_final"] or row["telefone_receita"],
                "whatsapp_final": row["whatsapp_final"],
                "site": row["site"],
                "cidade": row["cidade_nome"],
                "uf": row["uf"],
                "logradouro": row["logradouro"],
                "numero": row["numero"],
                "cep": row["cep"],
                "data_abertura": row["data_abertura"],
                "divida_pgfn": float(row["divida_pgfn"]),
                "qtd_inscricoes_pgfn": int(row["qtd_inscricoes"]),
            }
            empresas.append(e)

        if request.formato == "n8n":
            empresas = _formatar_n8n_pgfn(empresas)
        elif request.formato == "kommo":
            empresas = _formatar_kommo_pgfn(empresas)

        return {
            "success": True,
            "total": len(empresas),
            "empresas": empresas,
            "metadata": {
                "filtros": {
                    "uf": request.uf,
                    "municipio": request.municipio,
                    "divida_min": request.divida_min,
                    "divida_max": request.divida_max,
                    "portes": request.portes,
                    "cnaes": request.cnaes,
                },
                "fonte_pgfn": "PGFN - Divida Ativa da Uniao (Nao Previdenciario) - Dez/2025",
            },
        }

    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


def _formatar_n8n_pgfn(empresas: List[Dict]) -> List[Dict]:
    return [{
        "cnpj": e.get("cnpj"),
        "nome": e.get("razao_social") or e.get("nome_fantasia"),
        "email": e.get("email_final"),
        "telefone": e.get("telefone_final"),
        "whatsapp": e.get("whatsapp_final"),
        "site": e.get("site"),
        "cidade": e.get("cidade"),
        "uf": e.get("uf"),
        "cnae": e.get("cnae_principal"),
        "cnae_descricao": e.get("cnae_descricao"),
        "porte": e.get("porte"),
        "capital_social": e.get("capital_social"),
        "data_abertura": e.get("data_abertura"),
        "divida_pgfn": e.get("divida_pgfn"),
        "qtd_inscricoes_pgfn": e.get("qtd_inscricoes_pgfn"),
    } for e in empresas]


def _formatar_kommo_pgfn(empresas: List[Dict]) -> List[Dict]:
    return [{
        "name": e.get("razao_social") or e.get("nome_fantasia", "Sem nome"),
        "company_name": e.get("razao_social"),
        "phone": e.get("telefone_final"),
        "email": e.get("email_final"),
        "website": e.get("site"),
        "city": e.get("cidade"),
        "state": e.get("uf"),
        "zip": e.get("cep"),
        "address": f"{e.get('logradouro', '')} {e.get('numero', '')}".strip(),
        "custom_fields": {
            "cnpj": e.get("cnpj"),
            "cnae": e.get("cnae_principal"),
            "cnae_descricao": e.get("cnae_descricao"),
            "capital_social": e.get("capital_social"),
            "porte": e.get("porte"),
            "data_abertura": e.get("data_abertura"),
            "whatsapp": e.get("whatsapp_final"),
            "divida_pgfn": e.get("divida_pgfn"),
            "qtd_inscricoes_pgfn": e.get("qtd_inscricoes_pgfn"),
        },
    } for e in empresas]


# ============================================================
# ASSERTIVA — consulta de lead por CNPJ
# ============================================================

class AssertivaCNPJRequest(BaseModel):
    cnpj: str = Field(..., description="CNPJ do lead (com ou sem formatação)")
    id_finalidade: int = Field(
        5,
        description="Finalidade LGPD: 1=Confirmação identidade, 2=Ciclo crédito, 4=Execução contrato, 5=Legítimo interesse",
    )


@router.post(
    "/assertiva/cnpj",
    summary="Consultar lead por CNPJ na Assertiva",
    tags=["Prospecção", "Assertiva"],
)
async def prospeccao_assertiva_cnpj(
    body: AssertivaCNPJRequest,
    _user: dict = Depends(require_auth_or_api_key),
) -> Dict[str, Any]:
    """
    Recebe um CNPJ e consulta os dados cadastrais na **Assertiva Localize PJ**.

    Retorna razão social, endereço, contatos, CNAEs, sócios e demais informações
    disponíveis na base da Assertiva para uso em prospecção.

    **Exemplo de uso (n8n / curl):**
    ```json
    POST /prospeccao/assertiva/cnpj
    { "cnpj": "12.345.678/0001-99" }
    ```
    """
    from api.assertiva_service import get_assertiva_service

    try:
        service = get_assertiva_service()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        )

    try:
        resultado = await service.consultar_cnpj(body.cnpj, id_finalidade=body.id_finalidade)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"success": True, "data": resultado}


@router.get(
    "/assertiva/cnpj/{cnpj}",
    summary="Consultar lead por CNPJ na Assertiva (GET)",
    tags=["Prospecção", "Assertiva"],
)
async def prospeccao_assertiva_cnpj_get(
    cnpj: str,
    id_finalidade: int = Query(5, description="Finalidade LGPD (1-5)"),
    _user: dict = Depends(require_auth_or_api_key),
) -> Dict[str, Any]:
    """
    Versão GET para facilitar testes rápidos e integração com n8n via URL.

    **Exemplo:**
    ```
    GET /prospeccao/assertiva/cnpj/12345678000199
    GET /prospeccao/assertiva/cnpj/12345678000199?id_finalidade=2
    ```
    """
    from api.assertiva_service import get_assertiva_service

    try:
        service = get_assertiva_service()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    try:
        resultado = await service.consultar_cnpj(cnpj, id_finalidade=id_finalidade)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"success": True, "data": resultado}
