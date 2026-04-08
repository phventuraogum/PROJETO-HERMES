from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Roda um lote de prospeccao Hermes -> Assertiva -> Evolution "
            "para industrias em SP/MG/RJ."
        )
    )
    parser.add_argument("--ufs", nargs="+", default=["SP", "MG", "RJ"])
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--segmento", default="Indústria")
    parser.add_argument("--id-finalidade", type=int, default=5)
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--duckdb-path", default="")
    parser.add_argument("--token", default="")
    parser.add_argument("--client-id", default="")
    parser.add_argument("--client-secret", default="")
    parser.add_argument("--output-json", default="")
    parser.add_argument("--output-csv", default="")
    return parser.parse_args()


def configure_environment(args: argparse.Namespace) -> None:
    load_dotenv(BACKEND_DIR / ".env")
    if args.duckdb_path:
        os.environ["HERMES_DUCKDB_PATH"] = args.duckdb_path
    if args.client_id:
        os.environ["ASSERTIVA_CLIENT_ID"] = args.client_id
    if args.client_secret:
        os.environ["ASSERTIVA_CLIENT_SECRET"] = args.client_secret
    if args.token:
        os.environ["ASSERTIVA_BEARER_TOKEN"] = args.token
        os.environ.setdefault("ASSERTIVA_BEARER_TOKEN_EXPIRES_IN", "1800")


def default_output_paths() -> tuple[Path, Path]:
    out_dir = BACKEND_DIR / "devdata"
    out_dir.mkdir(parents=True, exist_ok=True)
    return (
        out_dir / "assertiva-industria-batch.json",
        out_dir / "assertiva-industria-batch.csv",
    )


def select_candidates(args: argparse.Namespace) -> List[Dict[str, Any]]:
    from api.main import ProspeccaoConfig, rodar_prospeccao_icp

    config = ProspeccaoConfig(
        termo_base="",
        ufs=[uf.upper() for uf in args.ufs],
        segmentos=[args.segmento],
        limite_empresas=args.limit,
        enriquecimento_web=False,
        priorizar_com_contato=False,
    )
    resultado = rodar_prospeccao_icp(config)
    empresas: List[Dict[str, Any]] = []
    for emp in resultado.empresas:
        empresas.append(
            {
                "cnpj": emp.cnpj,
                "razao_social": emp.razao_social,
                "nome_fantasia": emp.nome_fantasia,
                "cidade": emp.cidade,
                "uf": emp.uf,
                "site": emp.site,
                "cnae_principal": emp.cnae_principal,
                "segmento": emp.segmento,
            }
        )
    return empresas


def summarize_company(candidate: Dict[str, Any], enriched: Dict[str, Any]) -> Dict[str, Any]:
    decisores = enriched.get("decisores") or []
    melhor_decisor = None
    for decisor in decisores:
        if decisor.get("melhor_whatsapp"):
            melhor_decisor = decisor
            break
    if melhor_decisor is None and decisores:
        melhor_decisor = decisores[0]

    melhor_whatsapp = None if melhor_decisor is None else melhor_decisor.get("melhor_whatsapp")
    return {
        "cnpj": candidate.get("cnpj"),
        "razao_social": candidate.get("razao_social"),
        "uf": candidate.get("uf"),
        "cidade": candidate.get("cidade"),
        "segmento": candidate.get("segmento"),
        "site": enriched.get("site") or candidate.get("site"),
        "protocolo": enriched.get("protocolo"),
        "decisor_principal": None if melhor_decisor is None else melhor_decisor.get("nome"),
        "cargo_decisor_principal": None if melhor_decisor is None else melhor_decisor.get("cargo"),
        "telefone_decisor_principal": None if melhor_whatsapp is None else melhor_whatsapp.get("numero"),
        "telefone_decisor_principal_e164": None
        if melhor_whatsapp is None
        else melhor_whatsapp.get("numero_e164"),
        "whatsapp_validado": None if melhor_whatsapp is None else melhor_whatsapp.get("whatsapp_validado"),
        "metodo_validacao": None if melhor_whatsapp is None else melhor_whatsapp.get("metodo_validacao"),
        "total_decisores": (enriched.get("resumo") or {}).get("total_decisores"),
        "total_telefones_decisores": (enriched.get("resumo") or {}).get("total_telefones_decisores"),
        "total_whatsapps_validos": (enriched.get("resumo") or {}).get("total_whatsapps_validos"),
    }


async def run_batch(args: argparse.Namespace, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    from api.assertiva_service import AssertivaCNPJService

    service = AssertivaCNPJService(
        client_id=os.getenv("ASSERTIVA_CLIENT_ID", ""),
        client_secret=os.getenv("ASSERTIVA_CLIENT_SECRET", ""),
        bearer_token=os.getenv("ASSERTIVA_BEARER_TOKEN", ""),
        bearer_token_expires_in=int(os.getenv("ASSERTIVA_BEARER_TOKEN_EXPIRES_IN", "0") or 0),
    )
    semaphore = asyncio.Semaphore(max(1, args.concurrency))

    async def process(candidate: Dict[str, Any]) -> Dict[str, Any]:
        async with semaphore:
            try:
                enriched = await service.enriquecer_empresa_com_decisores(
                    candidate["cnpj"],
                    id_finalidade=args.id_finalidade,
                    validar_whatsapp=True,
                )
                return {
                    "status": "ok",
                    "candidate": candidate,
                    "summary": summarize_company(candidate, enriched),
                    "enriched": enriched,
                }
            except Exception as exc:
                return {
                    "status": "error",
                    "candidate": candidate,
                    "error": str(exc),
                }

    tasks = [process(candidate) for candidate in candidates]
    return await asyncio.gather(*tasks)


def write_outputs(
    *,
    json_path: Path,
    csv_path: Path,
    payload: Dict[str, Any],
) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    rows = []
    for item in payload.get("items", []):
        if item.get("status") == "ok":
            row = dict(item.get("summary") or {})
        else:
            candidate = item.get("candidate") or {}
            row = {
                "cnpj": candidate.get("cnpj"),
                "razao_social": candidate.get("razao_social"),
                "uf": candidate.get("uf"),
                "cidade": candidate.get("cidade"),
                "error": item.get("error"),
            }
        rows.append(row)

    fieldnames = sorted({key for row in rows for key in row.keys()})
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    args = parse_args()
    configure_environment(args)

    try:
        candidates = select_candidates(args)
    except Exception as exc:
        print(f"[ERRO] Nao foi possivel obter candidatos do Hermes: {exc}")
        return 1

    if not candidates:
        print("[ERRO] Hermes nao retornou candidatos para o filtro informado.")
        return 1

    json_default, csv_default = default_output_paths()
    json_path = Path(args.output_json) if args.output_json else json_default
    csv_path = Path(args.output_csv) if args.output_csv else csv_default

    payload: Dict[str, Any] = {
        "filters": {
            "ufs": [uf.upper() for uf in args.ufs],
            "segmento": args.segmento,
            "limit": args.limit,
            "id_finalidade": args.id_finalidade,
            "dry_run": args.dry_run,
        },
        "candidate_count": len(candidates),
        "candidates": candidates,
    }

    if args.dry_run:
        payload["items"] = []
        write_outputs(json_path=json_path, csv_path=csv_path, payload=payload)
        print(f"[OK] Dry-run concluido. JSON: {json_path}")
        print(f"[OK] Dry-run concluido. CSV: {csv_path}")
        return 0

    items = asyncio.run(run_batch(args, candidates))
    payload["items"] = items
    write_outputs(json_path=json_path, csv_path=csv_path, payload=payload)

    ok_count = sum(1 for item in items if item.get("status") == "ok")
    error_count = len(items) - ok_count
    print(f"[OK] Batch concluido. Sucesso: {ok_count} | Erros: {error_count}")
    print(f"[ARQUIVO] JSON: {json_path}")
    print(f"[ARQUIVO] CSV: {csv_path}")
    return 0 if ok_count else 2


if __name__ == "__main__":
    raise SystemExit(main())
