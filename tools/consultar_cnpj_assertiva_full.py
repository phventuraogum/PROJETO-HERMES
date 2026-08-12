"""
Consulta única no Hermes/Assertiva para um CNPJ:
  - GET /localize/v3/cnpj  (dados PJ + lista de sócios)
  - GET /localize/v3/cpf   (para CADA sócio PF: telefones, e-mails, endereços, etc.)

Salva o JSON bruto consolidado em --output-json e imprime um resumo legível.
NÃO consulta nada de dívida (PGFN/Serasa), só os endpoints Localize.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any

import httpx

REPO = Path(__file__).resolve().parents[1]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from tools.enrich_leads_assertiva_decisores import (  # noqa: E402
    AssertivaClient,
    CreditTracker,
    _norm_cnpj,
    _norm_cpf,
)


def _digits(value: str) -> str:
    return re.sub(r"\D+", "", value or "")


async def _amain(args: argparse.Namespace) -> int:
    cnpj = _norm_cnpj(args.cnpj)
    if not cnpj:
        print(f"CNPJ inválido: {args.cnpj}", file=sys.stderr)
        return 2

    credits = CreditTracker(limit=max(1, int(args.max_credits)))
    client = AssertivaClient(
        args.client_id,
        args.client_secret,
        id_finalidade=int(args.id_finalidade),
    )

    timeout = httpx.Timeout(60.0, connect=20.0)
    async with httpx.AsyncClient(timeout=timeout) as http:
        await client.prime_token()

        cnpj_payload = await client.consultar_cnpj(http, credits, cnpj)
        if not isinstance(cnpj_payload, dict) or cnpj_payload.get("encontrado") is False:
            print(json.dumps({"erro": "cnpj_nao_encontrado", "payload": cnpj_payload}, ensure_ascii=False, indent=2))
            return 1

        # extrai sócios PF para consulta encadeada
        resposta = cnpj_payload.get("resposta") if isinstance(cnpj_payload.get("resposta"), dict) else cnpj_payload
        socios_raw = resposta.get("socios", []) if isinstance(resposta, dict) else []
        socios: list[dict[str, Any]] = []
        if isinstance(socios_raw, list):
            for s in socios_raw:
                if not isinstance(s, dict):
                    continue
                cpf = _norm_cpf(
                    str(
                        s.get("cpfCnpj")
                        or s.get("cpf_cnpj")
                        or s.get("documento")
                        or s.get("cpf")
                        or ""
                    )
                )
                socios.append(
                    {
                        "nome": str(
                            s.get("nome")
                            or s.get("nomeOuRazaoSocial")
                            or s.get("nomeRazaoSocial")
                            or ""
                        ),
                        "cpf": cpf,
                        "cargo": str(
                            s.get("cargo")
                            or s.get("qualificacao")
                            or s.get("qualificacaoSocio")
                            or ""
                        ),
                        "raw": s,
                    }
                )

        pf_lookup: dict[str, dict[str, Any]] = {}
        for socio in socios:
            cpf = socio["cpf"]
            if not cpf:
                continue
            pf_payload = await client.consultar_cpf(http, credits, cpf)
            pf_lookup[cpf] = pf_payload

    consolidated = {
        "consulta": {
            "cnpj": cnpj,
            "id_finalidade": int(args.id_finalidade),
            "creditos_usados": credits.used,
        },
        "cnpj_payload": cnpj_payload,
        "socios": [
            {
                "nome": s["nome"],
                "cpf": s["cpf"],
                "cargo": s["cargo"],
                "cnpj_socio_raw": s["raw"],
                "pf_payload": pf_lookup.get(s["cpf"]),
            }
            for s in socios
        ],
    }

    out_path = Path(args.output_json)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(consolidated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "cnpj": cnpj,
                "creditos_usados": credits.used,
                "qtd_socios": len(socios),
                "qtd_socios_pf_consultados": len(pf_lookup),
                "output_json": str(out_path),
            },
            ensure_ascii=False,
        )
    )
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser()
    p.add_argument("--cnpj", required=True)
    p.add_argument("--client-id", required=True)
    p.add_argument("--client-secret", required=True)
    p.add_argument("--id-finalidade", type=int, default=5)
    p.add_argument("--max-credits", type=int, default=20)
    p.add_argument("--output-json", default="exports/pinn/cnpj_consulta.json")
    return p


def main() -> int:
    args = build_arg_parser().parse_args()
    return asyncio.run(_amain(args))


if __name__ == "__main__":
    raise SystemExit(main())
