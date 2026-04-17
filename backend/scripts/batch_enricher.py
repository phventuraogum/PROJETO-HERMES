"""
Batch Enricher — enriquece empresas_enriquecidas em cnpj.duckdb em lote.

MODOS:
  light   Usa apenas OpenCNPJ (gratis, ~50 req/s). Atualiza email e telefone
          com dados normalizados da Receita Federal via API publica.
          Bom para escala: 50k+ empresas por hora.

  full    OpenCNPJ + Google Search + scraping do site + waterfall de email.
          Encontra site, email pessoal/decisor e WhatsApp. Mais lento (~30-60s
          por empresa). Use com --limite 500-2000.

PRIORIDADE DE SELECAO:
  - CNAEs especificos (--cnaes)
  - UFs alvo (--ufs)
  - Capital social minimo (--capital-min)
  - Empresas sem site ou email ainda (skip automatico se ja enriquecida)

EXEMPLO DE USO:
  # Modo light: 5000 empresas de TI em SP/RJ
  python scripts/batch_enricher.py --modo light --cnaes 6201,6202,6203,6209 --ufs SP,RJ --limite 5000

  # Modo full: 500 clinicas com capital alto em SP
  python scripts/batch_enricher.py --modo full --cnaes 8610,8640 --ufs SP --capital-min 500000 --limite 500

  # Apontar para banco local (fora do Docker)
  python scripts/batch_enricher.py --db "G:/icp_radar/dados_receita/cnpj.duckdb" --modo light --limite 10000

NOTA IMPORTANTE:
  O script escreve diretamente no cnpj.duckdb (nao no app.duckdb).
  Isso garante que os dados aparecem imediatamente nas views de prospeccao.
  Pare o servidor FastAPI antes de rodar em modo full para evitar lock no DB.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import duckdb

# Adiciona o diretório pai ao path para importar modulos do projeto
_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("batch_enricher")


# ─────────────────────────────────────────────────────────────────────────────
# CNAEs pre-definidos por segmento (facilitam a linha de comando)
# ─────────────────────────────────────────────────────────────────────────────
SEGMENTOS_CNAE: Dict[str, List[str]] = {
    "ti":          ["6201", "6202", "6203", "6204", "6209", "6311", "6319", "6391", "6399"],
    "saude":       ["8610", "8621", "8622", "8630", "8640", "8650", "8660"],
    "juridico":    ["6911", "6912"],
    "contabil":    ["6920"],
    "consultoria": ["7020", "7111", "7112", "7119", "7120"],
    "educacao":    ["8511", "8512", "8513", "8520", "8530", "8541", "8542"],
    "industria":   ["2511", "2512", "2521", "2522", "2811", "2812", "2813"],
    "logistica":   ["4930", "4940", "4950", "5211", "5212"],
    "varejo":      ["4711", "4712", "4721", "4731", "4741", "4744"],
    "alimentacao": ["5611", "5612", "1011", "1031", "1041", "1051"],
}


# ─────────────────────────────────────────────────────────────────────────────
# Checkpoint: permite retomar onde parou
# ─────────────────────────────────────────────────────────────────────────────

def _checkpoint_path(db_path: str) -> Path:
    return Path(db_path).parent / "batch_enricher_checkpoint.json"


def _load_checkpoint(db_path: str) -> Dict[str, Any]:
    cp = _checkpoint_path(db_path)
    if cp.exists():
        try:
            return json.loads(cp.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"feitos": [], "erros": [], "iniciado_em": None}


def _save_checkpoint(db_path: str, estado: Dict[str, Any]) -> None:
    cp = _checkpoint_path(db_path)
    cp.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Selecao de empresas para enriquecer
# ─────────────────────────────────────────────────────────────────────────────

def selecionar_empresas(
    conn: duckdb.DuckDBPyConnection,
    cnaes: Optional[List[str]],
    ufs: Optional[List[str]],
    capital_min: Optional[float],
    limite: int,
    ja_feitos: set,
    apenas_sem_contato: bool = True,
) -> List[Dict[str, Any]]:
    """
    Seleciona empresas ativas matrizes ordenadas por capital, priorizando
    as que ainda nao foram enriquecidas.
    """
    sql = """
        SELECT
            e.CNPJ_COMPLETO          AS cnpj,
            e.RAZAO_SOCIAL           AS razao_social,
            e.NOME_FANTASIA          AS nome_fantasia,
            e.UF                     AS uf,
            e.MUNICIPIO              AS municipio_cod,
            m.NOME_MUNICIPIO         AS cidade,
            e.CNAE_PRINCIPAL         AS cnae_principal,
            COALESCE(cd.descricao, e.CNAE_PRINCIPAL) AS cnae_descricao,
            e.SITUACAO_CADASTRAL     AS situacao,
            e.TELEFONE1              AS telefone_receita,
            e.EMAIL                  AS email_receita,
            v.CAPITAL_SOCIAL_NUM     AS capital_num,
            ew.site                  AS site_enriquecido,
            ew.email_enriquecido     AS email_enriquecido
        FROM cnpj_empresas e
        LEFT JOIN vw_empresas_capital_normalizado v ON v.CNPJ_COMPLETO = e.CNPJ_COMPLETO
        LEFT JOIN cnae_descricao cd ON cd.cnae_cod = e.CNAE_PRINCIPAL
        LEFT JOIN municipios m ON m.COD_MUNICIPIO = LPAD(e.MUNICIPIO, 4, '0')
        LEFT JOIN empresas_enriquecidas ew ON ew.cnpj = e.CNPJ_COMPLETO
        WHERE e.SITUACAO_CADASTRAL = '02'
          AND e.MATRIZ_FILIAL = '1'
    """
    params: List[Any] = []

    if cnaes:
        placeholders = " OR ".join(["e.CNAE_PRINCIPAL LIKE ?" for _ in cnaes])
        sql += f" AND ({placeholders})"
        params.extend([c + "%" for c in cnaes])

    if ufs:
        placeholders = ", ".join(["?" for _ in ufs])
        sql += f" AND e.UF IN ({placeholders})"
        params.extend([u.upper() for u in ufs])

    if capital_min:
        sql += " AND v.CAPITAL_SOCIAL_NUM >= ?"
        params.append(float(capital_min))

    if apenas_sem_contato:
        sql += " AND (ew.cnpj IS NULL OR (ew.email_enriquecido IS NULL AND ew.site IS NULL))"

    sql += " ORDER BY v.CAPITAL_SOCIAL_NUM DESC NULLS LAST LIMIT ?"
    params.append(limite * 3)  # busca extra para compensar ja_feitos

    df = conn.execute(sql, params).fetchdf()
    empresas = df.to_dict(orient="records")

    # Filtra os ja processados nessa sessao
    empresas = [e for e in empresas if str(e["cnpj"]) not in ja_feitos]
    return empresas[:limite]


# ─────────────────────────────────────────────────────────────────────────────
# Enriquecimento LIGHT (OpenCNPJ apenas)
# ─────────────────────────────────────────────────────────────────────────────

async def enriquecer_light(cnpj: str, sem: asyncio.Semaphore) -> Dict[str, Any]:
    """
    Consulta OpenCNPJ (gratis) e retorna email, telefone normalizado e socios.
    Tres APIs em fallback: opencnpj.org → brasilapi → cnpj.ws
    """
    async with sem:
        try:
            from enrichment_opencnpj import consultar_opencnpj
            dados = await consultar_opencnpj(cnpj)
            return {
                "cnpj": cnpj,
                "email_enriquecido": dados.get("email_receita"),
                "telefone_enriquecido": dados.get("telefone"),
                "site": None,
                "whatsapp_publico": None,
                "whatsapp_enriquecido": None,
                "outras_informacoes": None,
                "status": "ok" if dados else "vazio",
            }
        except Exception as exc:
            logger.debug("Light enrichment falhou para %s: %s", cnpj, exc)
            return {"cnpj": cnpj, "status": "erro", "erro": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# Enriquecimento FULL (pipeline completo)
# ─────────────────────────────────────────────────────────────────────────────

def enriquecer_full(empresa: Dict[str, Any]) -> Dict[str, Any]:
    """
    Pipeline completo: OpenCNPJ + Google + scraping + waterfall de email.
    Usa o EnrichmentService existente do projeto.
    """
    import asyncio as _asyncio
    cnpj = str(empresa["cnpj"])

    try:
        from api.enrichment_service import EnrichmentService
        from api.enrichment_merge import merge_enrichment_payload

        socios_raw = []  # Podemos buscar da tabela socios se quiser
        svc = EnrichmentService()
        resultado = _asyncio.run(
            svc.enrich_company_complete(
                cnpj=cnpj,
                razao_social=str(empresa.get("razao_social") or ""),
                nome_fantasia=empresa.get("nome_fantasia"),
                cidade=empresa.get("cidade"),
                uf=empresa.get("uf"),
                cnae=empresa.get("cnae_principal"),
                site=empresa.get("site_enriquecido"),
                socios=socios_raw,
                score_icp=5,
                gerar_pitch=False,
                modo_rapido=False,
            )
        )

        snapshot = {
            "razao_social": empresa.get("razao_social"),
            "nome_fantasia": empresa.get("nome_fantasia"),
            "site": empresa.get("site_enriquecido"),
            "email": empresa.get("email_receita"),
            "telefone_receita": empresa.get("telefone_receita"),
        }

        merged = merge_enrichment_payload(snapshot, resultado)
        return {
            "cnpj": cnpj,
            "site": merged.get("site"),
            "email_enriquecido": merged.get("email_enriquecido"),
            "telefone_enriquecido": merged.get("telefone_enriquecido"),
            "whatsapp_publico": merged.get("whatsapp_publico"),
            "whatsapp_enriquecido": merged.get("whatsapp_enriquecido"),
            "outras_informacoes": merged.get("outras_informacoes"),
            "status": "ok",
        }
    except Exception as exc:
        logger.warning("Full enrichment falhou para %s: %s", cnpj, exc)
        return {"cnpj": cnpj, "status": "erro", "erro": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# Persistencia no cnpj.duckdb
# ─────────────────────────────────────────────────────────────────────────────

def persistir_lote(conn: duckdb.DuckDBPyConnection, resultados: List[Dict[str, Any]]) -> int:
    """
    Insere ou atualiza empresas_enriquecidas em cnpj.duckdb.
    Retorna quantas foram salvas (so salva se tiver algum dado util).
    """
    salvos = 0
    for r in resultados:
        cnpj = str(r.get("cnpj") or "").strip()
        if not cnpj or r.get("status") == "erro":
            continue

        # So persiste se encontrou pelo menos um dado util
        tem_dado = any([
            r.get("site"),
            r.get("email_enriquecido"),
            r.get("telefone_enriquecido"),
            r.get("whatsapp_publico"),
            r.get("whatsapp_enriquecido"),
        ])
        if not tem_dado:
            continue

        conn.execute("""
            INSERT INTO empresas_enriquecidas (
                cnpj,
                site,
                email_enriquecido,
                telefone_enriquecido,
                whatsapp_publico,
                whatsapp_enriquecido,
                outras_informacoes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (cnpj) DO UPDATE SET
                site                 = COALESCE(excluded.site, site),
                email_enriquecido    = COALESCE(excluded.email_enriquecido, email_enriquecido),
                telefone_enriquecido = COALESCE(excluded.telefone_enriquecido, telefone_enriquecido),
                whatsapp_publico     = COALESCE(excluded.whatsapp_publico, whatsapp_publico),
                whatsapp_enriquecido = COALESCE(excluded.whatsapp_enriquecido, whatsapp_enriquecido),
                outras_informacoes   = COALESCE(excluded.outras_informacoes, outras_informacoes)
        """, [
            cnpj,
            r.get("site"),
            r.get("email_enriquecido"),
            r.get("telefone_enriquecido"),
            r.get("whatsapp_publico"),
            r.get("whatsapp_enriquecido"),
            r.get("outras_informacoes"),
        ])
        salvos += 1
    return salvos


# ─────────────────────────────────────────────────────────────────────────────
# Loop principal
# ─────────────────────────────────────────────────────────────────────────────

async def rodar_light(
    conn: duckdb.DuckDBPyConnection,
    empresas: List[Dict[str, Any]],
    concorrencia: int,
    checkpoint: Dict[str, Any],
    db_path: str,
    flush_cada: int = 100,
) -> None:
    sem = asyncio.Semaphore(concorrencia)
    total = len(empresas)
    processados = 0
    salvos_total = 0
    t0 = time.time()
    buffer: List[Dict[str, Any]] = []

    logger.info("Iniciando modo LIGHT — %d empresas | concorrencia=%d", total, concorrencia)

    for i in range(0, total, concorrencia * 5):
        lote = empresas[i : i + concorrencia * 5]
        tarefas = [enriquecer_light(str(emp["cnpj"]), sem) for emp in lote]
        resultados = await asyncio.gather(*tarefas, return_exceptions=True)

        for res in resultados:
            if isinstance(res, Exception):
                continue
            buffer.append(res)
            cnpj = res.get("cnpj", "")
            if res.get("status") == "ok" and cnpj:
                checkpoint["feitos"].append(cnpj)
            elif cnpj:
                checkpoint["erros"].append(cnpj)

        processados += len(lote)

        if len(buffer) >= flush_cada:
            salvos = persistir_lote(conn, buffer)
            salvos_total += salvos
            buffer = []
            _save_checkpoint(db_path, checkpoint)

        decorrido = time.time() - t0
        velocidade = processados / decorrido if decorrido > 0 else 0
        restante = (total - processados) / velocidade if velocidade > 0 else 0
        # buffer_pendente = quantos ainda nao foram persistidos (sao salvos no final)
        logger.info(
            "[%d/%d] salvos=%d (+%d buffer) | %.0f emp/s | eta ~%.0fs",
            processados, total, salvos_total, len(buffer), velocidade, restante,
        )

    # Flush final
    if buffer:
        salvos_total += persistir_lote(conn, buffer)
        _save_checkpoint(db_path, checkpoint)

    logger.info(
        "LIGHT concluido. %d/%d processados | %d salvos em %.0fs",
        processados, total, salvos_total, time.time() - t0,
    )


def rodar_full(
    conn: duckdb.DuckDBPyConnection,
    empresas: List[Dict[str, Any]],
    checkpoint: Dict[str, Any],
    db_path: str,
    pausa_segundos: float = 2.0,
) -> None:
    total = len(empresas)
    salvos_total = 0
    t0 = time.time()

    logger.info("Iniciando modo FULL — %d empresas | pausa=%.1fs entre cada", total, pausa_segundos)

    for idx, emp in enumerate(empresas, 1):
        cnpj = str(emp["cnpj"])
        logger.info("[%d/%d] Enriquecendo %s — %s", idx, total, cnpj, emp.get("razao_social", "")[:50])

        resultado = enriquecer_full(emp)
        salvos = persistir_lote(conn, [resultado])
        salvos_total += salvos

        if resultado.get("status") == "ok":
            checkpoint["feitos"].append(cnpj)
            status_log = []
            if resultado.get("site"):
                status_log.append(f"site={resultado['site'][:40]}")
            if resultado.get("email_enriquecido"):
                status_log.append(f"email={resultado['email_enriquecido']}")
            if resultado.get("whatsapp_enriquecido"):
                status_log.append("whatsapp=SIM")
            logger.info("  Resultado: %s", " | ".join(status_log) if status_log else "sem dados novos")
        else:
            checkpoint["erros"].append(cnpj)
            logger.warning("  Falhou: %s", resultado.get("erro", ""))

        if idx % 10 == 0:
            _save_checkpoint(db_path, checkpoint)
            decorrido = time.time() - t0
            velocidade = idx / decorrido if decorrido > 0 else 0
            restante = (total - idx) / velocidade if velocidade > 0 else 0
            logger.info(
                "  Progresso: %d/%d salvos=%d | eta ~%.0fs",
                idx, total, salvos_total, restante,
            )

        if pausa_segundos > 0 and idx < total:
            time.sleep(pausa_segundos)

    _save_checkpoint(db_path, checkpoint)
    logger.info(
        "FULL concluido. %d/%d processados | %d com dados novos | %.0fs total",
        total, total, salvos_total, time.time() - t0,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Relatorio final
# ─────────────────────────────────────────────────────────────────────────────

def relatorio(conn: duckdb.DuckDBPyConnection) -> None:
    total_enriquecidas = conn.execute("SELECT COUNT(*) FROM empresas_enriquecidas").fetchone()[0]
    com_email = conn.execute(
        "SELECT COUNT(*) FROM empresas_enriquecidas WHERE email_enriquecido IS NOT NULL"
    ).fetchone()[0]
    com_site = conn.execute(
        "SELECT COUNT(*) FROM empresas_enriquecidas WHERE site IS NOT NULL"
    ).fetchone()[0]
    com_whatsapp = conn.execute(
        "SELECT COUNT(*) FROM empresas_enriquecidas WHERE whatsapp_enriquecido IS NOT NULL OR whatsapp_publico IS NOT NULL"
    ).fetchone()[0]
    total_view = conn.execute("SELECT COUNT(*) FROM vw_prospeccao_base").fetchone()[0]

    print("\n" + "=" * 55)
    print("RELATORIO FINAL")
    print("=" * 55)
    print(f"  Total em empresas_enriquecidas : {total_enriquecidas:>10,}")
    print(f"  Com email                      : {com_email:>10,}")
    print(f"  Com site                       : {com_site:>10,}")
    print(f"  Com WhatsApp                   : {com_whatsapp:>10,}")
    print(f"  Total na vw_prospeccao_base    : {total_view:>10,}")
    print("=" * 55)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Batch enricher — popula empresas_enriquecidas em cnpj.duckdb",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--db",
        default=os.getenv("HERMES_DUCKDB_PATH", "/data/cnpj.duckdb"),
        help="Caminho para cnpj.duckdb",
    )
    parser.add_argument(
        "--modo",
        choices=["light", "full"],
        default="light",
        help="light=OpenCNPJ apenas (rapido) | full=scraping completo (lento)",
    )
    parser.add_argument(
        "--cnaes",
        default="",
        help="CNAEs separados por virgula (ex: 6201,6202) ou alias: ti,saude,juridico,contabil,consultoria,educacao,industria,logistica,varejo,alimentacao",
    )
    parser.add_argument(
        "--ufs",
        default="",
        help="UFs alvo separadas por virgula (ex: SP,RJ,MG)",
    )
    parser.add_argument(
        "--capital-min",
        type=float,
        default=None,
        help="Capital social minimo em R$ (ex: 100000)",
    )
    parser.add_argument(
        "--limite",
        type=int,
        default=1000,
        help="Maximo de empresas para processar nesta execucao",
    )
    parser.add_argument(
        "--concorrencia",
        type=int,
        default=20,
        help="[light] Numero de requisicoes paralelas (padrao: 20)",
    )
    parser.add_argument(
        "--pausa",
        type=float,
        default=2.0,
        help="[full] Segundos entre cada empresa (padrao: 2.0)",
    )
    parser.add_argument(
        "--sem-skip",
        action="store_true",
        help="Processa mesmo empresas que ja tem algum dado enriquecido",
    )
    parser.add_argument(
        "--limpar-checkpoint",
        action="store_true",
        help="Apaga o checkpoint e comeca do zero",
    )
    parser.add_argument(
        "--relatorio",
        action="store_true",
        help="Apenas exibe relatorio do banco e sai",
    )

    args = parser.parse_args()

    # ── Valida banco ─────────────────────────────────────────────────────────
    if not Path(args.db).exists():
        logger.error("Banco nao encontrado: %s", args.db)
        sys.exit(1)

    logger.info("Conectando em modo escrita: %s", args.db)
    conn = duckdb.connect(args.db, read_only=False)

    if args.relatorio:
        relatorio(conn)
        conn.close()
        return

    # ── Checkpoint ───────────────────────────────────────────────────────────
    if args.limpar_checkpoint:
        _save_checkpoint(args.db, {"feitos": [], "erros": [], "iniciado_em": None})
        logger.info("Checkpoint apagado.")

    checkpoint = _load_checkpoint(args.db)
    if not checkpoint.get("iniciado_em"):
        checkpoint["iniciado_em"] = datetime.now().isoformat()
    ja_feitos = set(checkpoint.get("feitos", []))
    logger.info("Checkpoint: %d ja processados, %d erros", len(ja_feitos), len(checkpoint.get("erros", [])))

    # ── Resolve CNAEs ─────────────────────────────────────────────────────────
    cnaes_raw = [c.strip() for c in args.cnaes.split(",") if c.strip()]
    cnaes_finais: List[str] = []
    for c in cnaes_raw:
        if c.lower() in SEGMENTOS_CNAE:
            cnaes_finais.extend(SEGMENTOS_CNAE[c.lower()])
        else:
            cnaes_finais.append(c)
    cnaes_finais = list(dict.fromkeys(cnaes_finais)) if cnaes_finais else None

    ufs = [u.strip().upper() for u in args.ufs.split(",") if u.strip()] or None

    logger.info(
        "Parametros: modo=%s | cnaes=%s | ufs=%s | capital_min=%s | limite=%d",
        args.modo,
        ",".join(cnaes_finais[:5]) + ("..." if cnaes_finais and len(cnaes_finais) > 5 else "") if cnaes_finais else "todos",
        ",".join(ufs) if ufs else "todas",
        f"R$ {args.capital_min:,.0f}" if args.capital_min else "sem filtro",
        args.limite,
    )

    # ── Seleciona empresas ────────────────────────────────────────────────────
    logger.info("Selecionando empresas...")
    empresas = selecionar_empresas(
        conn=conn,
        cnaes=cnaes_finais,
        ufs=ufs,
        capital_min=args.capital_min,
        limite=args.limite,
        ja_feitos=ja_feitos,
        apenas_sem_contato=not args.sem_skip,
    )

    if not empresas:
        logger.info("Nenhuma empresa encontrada com os filtros informados.")
        relatorio(conn)
        conn.close()
        return

    logger.info("%d empresas selecionadas para enriquecimento.", len(empresas))

    # ── Garante que a tabela existe (por seguranca) ───────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS empresas_enriquecidas (
            cnpj VARCHAR PRIMARY KEY,
            site VARCHAR,
            email_enriquecido VARCHAR,
            telefone_enriquecido VARCHAR,
            whatsapp_publico VARCHAR,
            whatsapp_enriquecido VARCHAR,
            outras_informacoes VARCHAR
        )
    """)

    # ── Executa ───────────────────────────────────────────────────────────────
    try:
        if args.modo == "light":
            asyncio.run(
                rodar_light(
                    conn=conn,
                    empresas=empresas,
                    concorrencia=args.concorrencia,
                    checkpoint=checkpoint,
                    db_path=args.db,
                )
            )
        else:
            rodar_full(
                conn=conn,
                empresas=empresas,
                checkpoint=checkpoint,
                db_path=args.db,
                pausa_segundos=args.pausa,
            )
    except KeyboardInterrupt:
        logger.info("Interrompido pelo usuario. Checkpoint salvo.")
        _save_checkpoint(args.db, checkpoint)
    finally:
        relatorio(conn)
        conn.close()


if __name__ == "__main__":
    main()
