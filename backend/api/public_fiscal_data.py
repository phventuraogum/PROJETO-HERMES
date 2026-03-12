"""
Consulta fiscal publica manual.

Fase 1:
- importa snapshots publicos/manualizados da PGFN ou datasets equivalentes
- consulta por CNPJ sobre a ultima base importada por organizacao
- prepara a estrutura para provider oficial no futuro
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import re
import unicodedata
import uuid
from datetime import date, datetime, timezone
from typing import Any, Iterable

from api.db_pool import get_connection

logger = logging.getLogger(__name__)


DEFAULT_PROVIDER = "pgfn_open_data_manual"
DEFAULT_SOURCE_LABEL = "PGFN Dados Abertos"

_HEADER_ALIASES = {
    "cnpj": {
        "cnpj",
        "cpf_cnpj",
        "cpf_cnpj_devedor",
        "cpfoucnpj",
        "cpfoucnpjdevedor",
        "documento",
        "documento_devedor",
        "nr_cnpj",
        "numero_cnpj",
    },
    "nome_devedor": {
        "nome_devedor",
        "devedor",
        "nome",
        "nome_razao_social",
        "razao_social",
        "nome_do_devedor",
    },
    "situacao": {
        "situacao",
        "situacao_inscricao",
        "situacao_da_inscricao",
        "status",
        "status_inscricao",
    },
    "numero_inscricao": {
        "numero_inscricao",
        "numero_da_inscricao",
        "inscricao",
        "inscricao_da_divida_ativa",
        "numero_inscricao_divida_ativa",
    },
    "data_inscricao": {
        "data_inscricao",
        "data_da_inscricao",
        "dt_inscricao",
        "data",
        "data_inscricao_divida_ativa",
    },
    "valor_originario": {
        "valor_originario",
        "valor_original",
        "valor_origem",
        "valor_principal",
        "vl_originario",
        "vl_original",
    },
    "valor_consolidado": {
        "valor_consolidado",
        "valor_atualizado",
        "valor_total",
        "valor_inscrito",
        "vl_consolidado",
        "vl_total",
    },
    "tipo_credito": {
        "tipo_credito",
        "natureza_credito",
        "natureza_divida",
        "tipo_divida",
        "origem_credito",
    },
    "tipo_devedor": {
        "tipo_devedor",
        "classificacao_devedor",
        "perfil_devedor",
        "tipo_pessoa",
    },
    "indicador_ajuizado": {
        "indicador_ajuizado",
        "ajuizado",
        "indicador_judicial",
        "divida_ajuizada",
        "inscricao_ajuizada",
    },
    "unidade_responsavel": {
        "unidade_responsavel",
        "orgao_responsavel",
        "procuradoria",
        "unidade",
    },
    "processo_judicial": {
        "processo_judicial",
        "numero_processo",
        "processo",
        "processo_execucao",
    },
    "source_url": {
        "source_url",
        "url_fonte",
        "link_fonte",
        "url",
    },
}


def _normalize_header(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def _normalize_cnpj(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))[:14]


def _parse_brl_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("R$", "").replace(" ", "")
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _parse_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None

    formats = (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d/%m/%y",
    )
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def _parse_bool(value: Any) -> bool | None:
    if value in (None, ""):
        return None
    text = _normalize_header(str(value))
    if text in {"1", "true", "sim", "s", "ajuizado", "yes"}:
        return True
    if text in {"0", "false", "nao", "n", "not", "na"}:
        return False
    return None


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, default=str)


def _decode_file_bytes(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _detect_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
        return dialect.delimiter
    except csv.Error:
        pass

    candidates = {
        ";": sample.count(";"),
        ",": sample.count(","),
        "\t": sample.count("\t"),
        "|": sample.count("|"),
    }
    return max(candidates, key=candidates.get)


class PublicFiscalDataService:
    def ensure_tables(self) -> None:
        with get_connection(read_only=False) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS fiscal_public_imports (
                    id VARCHAR PRIMARY KEY,
                    org_id VARCHAR NOT NULL,
                    provider VARCHAR NOT NULL,
                    source_label VARCHAR,
                    filename VARCHAR,
                    file_sha256 VARCHAR,
                    notes VARCHAR,
                    status VARCHAR NOT NULL,
                    record_count INTEGER NOT NULL DEFAULT 0,
                    unique_cnpjs INTEGER NOT NULL DEFAULT 0,
                    skipped_rows INTEGER NOT NULL DEFAULT 0,
                    imported_at TIMESTAMP NOT NULL,
                    column_map_json VARCHAR
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS fiscal_public_debts (
                    id VARCHAR PRIMARY KEY,
                    import_id VARCHAR NOT NULL,
                    org_id VARCHAR NOT NULL,
                    provider VARCHAR NOT NULL,
                    cnpj VARCHAR NOT NULL,
                    nome_devedor VARCHAR,
                    situacao VARCHAR,
                    numero_inscricao VARCHAR,
                    data_inscricao DATE,
                    valor_originario DOUBLE,
                    valor_consolidado DOUBLE,
                    tipo_credito VARCHAR,
                    tipo_devedor VARCHAR,
                    indicador_ajuizado BOOLEAN,
                    unidade_responsavel VARCHAR,
                    processo_judicial VARCHAR,
                    source_url VARCHAR,
                    raw_payload_json VARCHAR,
                    imported_at TIMESTAMP NOT NULL
                )
                """
            )

    def _resolve_column_map(self, headers: Iterable[str]) -> dict[str, str]:
        raw_headers = [str(header or "").strip() for header in headers if str(header or "").strip()]
        normalized = {header: _normalize_header(header) for header in raw_headers}
        resolved: dict[str, str] = {}

        for canonical, aliases in _HEADER_ALIASES.items():
            for header, normalized_header in normalized.items():
                if normalized_header == canonical or normalized_header in aliases:
                    resolved[canonical] = header
                    break

        for header, normalized_header in normalized.items():
            if "cnpj" in normalized_header and "cnpj" not in resolved:
                resolved["cnpj"] = header
            if "devedor" in normalized_header and "nome_devedor" not in resolved:
                resolved["nome_devedor"] = header
            if "situacao" in normalized_header and "situacao" not in resolved:
                resolved["situacao"] = header
            if "inscricao" in normalized_header and "numero" in normalized_header and "numero_inscricao" not in resolved:
                resolved["numero_inscricao"] = header
            if normalized_header.startswith("data_") and "inscricao" in normalized_header and "data_inscricao" not in resolved:
                resolved["data_inscricao"] = header
            if "consolid" in normalized_header and "valor_consolidado" not in resolved:
                resolved["valor_consolidado"] = header
            if ("origin" in normalized_header or "original" in normalized_header) and "valor_originario" not in resolved:
                resolved["valor_originario"] = header

        return resolved

    def _extract_rows(self, content: bytes, filename: str | None = None) -> tuple[list[dict[str, Any]], dict[str, str]]:
        text = _decode_file_bytes(content)
        stripped = text.lstrip()
        rows: list[dict[str, Any]]

        if stripped.startswith("[") or stripped.startswith("{"):
            payload = json.loads(text)
            if isinstance(payload, dict):
                if isinstance(payload.get("items"), list):
                    rows = [dict(item) for item in payload["items"] if isinstance(item, dict)]
                elif isinstance(payload.get("data"), list):
                    rows = [dict(item) for item in payload["data"] if isinstance(item, dict)]
                else:
                    rows = [payload]
            elif isinstance(payload, list):
                rows = [dict(item) for item in payload if isinstance(item, dict)]
            else:
                raise ValueError("JSON de importacao invalido")
        else:
            delimiter = _detect_delimiter(text[:4096])
            reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
            rows = [dict(row) for row in reader if row]

        if not rows:
            raise ValueError("Nenhum registro encontrado no arquivo enviado")

        headers = list(rows[0].keys())
        column_map = self._resolve_column_map(headers)
        if "cnpj" not in column_map:
            raise ValueError("Nao foi possivel localizar a coluna de CNPJ no arquivo")

        return rows, column_map

    def import_snapshot(
        self,
        org_id: str,
        content: bytes,
        *,
        filename: str | None = None,
        provider: str = DEFAULT_PROVIDER,
        source_label: str = DEFAULT_SOURCE_LABEL,
        notes: str | None = None,
    ) -> dict[str, Any]:
        self.ensure_tables()

        rows, column_map = self._extract_rows(content, filename)
        import_id = str(uuid.uuid4())
        imported_at = datetime.now(timezone.utc).isoformat()
        file_sha256 = hashlib.sha256(content).hexdigest()

        parsed_rows: list[tuple[Any, ...]] = []
        skipped_rows = 0
        unique_cnpjs: set[str] = set()

        for row in rows:
            cnpj = _normalize_cnpj(row.get(column_map["cnpj"]))
            if len(cnpj) != 14:
                skipped_rows += 1
                continue

            unique_cnpjs.add(cnpj)
            record = {
                "id": str(uuid.uuid4()),
                "import_id": import_id,
                "org_id": org_id,
                "provider": provider,
                "cnpj": cnpj,
                "nome_devedor": str(row.get(column_map.get("nome_devedor", ""), "") or "").strip() or None,
                "situacao": str(row.get(column_map.get("situacao", ""), "") or "").strip() or None,
                "numero_inscricao": str(row.get(column_map.get("numero_inscricao", ""), "") or "").strip() or None,
                "data_inscricao": _parse_date(row.get(column_map.get("data_inscricao", ""))),
                "valor_originario": _parse_brl_number(row.get(column_map.get("valor_originario", ""))),
                "valor_consolidado": _parse_brl_number(row.get(column_map.get("valor_consolidado", ""))),
                "tipo_credito": str(row.get(column_map.get("tipo_credito", ""), "") or "").strip() or None,
                "tipo_devedor": str(row.get(column_map.get("tipo_devedor", ""), "") or "").strip() or None,
                "indicador_ajuizado": _parse_bool(row.get(column_map.get("indicador_ajuizado", ""))),
                "unidade_responsavel": str(row.get(column_map.get("unidade_responsavel", ""), "") or "").strip() or None,
                "processo_judicial": str(row.get(column_map.get("processo_judicial", ""), "") or "").strip() or None,
                "source_url": str(row.get(column_map.get("source_url", ""), "") or "").strip() or None,
                "raw_payload_json": _json_dumps(row),
                "imported_at": imported_at,
            }
            parsed_rows.append(
                (
                    record["id"],
                    record["import_id"],
                    record["org_id"],
                    record["provider"],
                    record["cnpj"],
                    record["nome_devedor"],
                    record["situacao"],
                    record["numero_inscricao"],
                    record["data_inscricao"],
                    record["valor_originario"],
                    record["valor_consolidado"],
                    record["tipo_credito"],
                    record["tipo_devedor"],
                    record["indicador_ajuizado"],
                    record["unidade_responsavel"],
                    record["processo_judicial"],
                    record["source_url"],
                    record["raw_payload_json"],
                    record["imported_at"],
                )
            )

        if not parsed_rows:
            raise ValueError("Nenhum CNPJ corporativo valido foi encontrado no arquivo")

        with get_connection(read_only=False) as conn:
            conn.execute(
                """
                INSERT INTO fiscal_public_imports (
                    id,
                    org_id,
                    provider,
                    source_label,
                    filename,
                    file_sha256,
                    notes,
                    status,
                    record_count,
                    unique_cnpjs,
                    skipped_rows,
                    imported_at,
                    column_map_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    import_id,
                    org_id,
                    provider,
                    source_label,
                    filename,
                    file_sha256,
                    notes,
                    "completed",
                    len(parsed_rows),
                    len(unique_cnpjs),
                    skipped_rows,
                    imported_at,
                    _json_dumps(column_map),
                ],
            )
            conn.executemany(
                """
                INSERT INTO fiscal_public_debts (
                    id,
                    import_id,
                    org_id,
                    provider,
                    cnpj,
                    nome_devedor,
                    situacao,
                    numero_inscricao,
                    data_inscricao,
                    valor_originario,
                    valor_consolidado,
                    tipo_credito,
                    tipo_devedor,
                    indicador_ajuizado,
                    unidade_responsavel,
                    processo_judicial,
                    source_url,
                    raw_payload_json,
                    imported_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                parsed_rows,
            )

        logger.info(
            "Importacao fiscal publica concluida | org=%s import_id=%s registros=%s cnpjs=%s skipped=%s",
            org_id,
            import_id,
            len(parsed_rows),
            len(unique_cnpjs),
            skipped_rows,
        )
        return self.get_latest_snapshot_meta(org_id) or {}

    def get_latest_snapshot_meta(self, org_id: str) -> dict[str, Any] | None:
        self.ensure_tables()
        with get_connection(read_only=True) as conn:
            row = conn.execute(
                """
                SELECT
                    id,
                    provider,
                    source_label,
                    filename,
                    notes,
                    status,
                    record_count,
                    unique_cnpjs,
                    skipped_rows,
                    imported_at,
                    column_map_json
                FROM fiscal_public_imports
                WHERE org_id = ?
                ORDER BY imported_at DESC
                LIMIT 1
                """,
                [org_id],
            ).fetchone()

        if not row:
            return None

        column_map = json.loads(row[10]) if row[10] else {}
        return {
            "id": str(row[0]),
            "provider": str(row[1]),
            "source_label": str(row[2]) if row[2] else None,
            "filename": str(row[3]) if row[3] else None,
            "notes": str(row[4]) if row[4] else None,
            "status": str(row[5]),
            "record_count": int(row[6] or 0),
            "unique_cnpjs": int(row[7] or 0),
            "skipped_rows": int(row[8] or 0),
            "imported_at": row[9].isoformat() if hasattr(row[9], "isoformat") else str(row[9]),
            "column_map": column_map,
        }

    def lookup_cnpj(self, org_id: str, cnpj: str) -> dict[str, Any]:
        self.ensure_tables()
        cnpj_normalized = _normalize_cnpj(cnpj)
        snapshot = self.get_latest_snapshot_meta(org_id)

        if not snapshot:
            return {
                "cnpj": cnpj_normalized,
                "snapshot": None,
                "summary": {
                    "has_snapshot": False,
                    "has_records": False,
                    "total_records": 0,
                    "total_valor_originario": 0.0,
                    "total_valor_consolidado": 0.0,
                    "ajuizadas": 0,
                    "latest_data_inscricao": None,
                    "nome_devedor": None,
                    "situacoes": [],
                },
                "records": [],
            }

        with get_connection(read_only=True) as conn:
            rows = conn.execute(
                """
                SELECT
                    id,
                    cnpj,
                    nome_devedor,
                    situacao,
                    numero_inscricao,
                    data_inscricao,
                    valor_originario,
                    valor_consolidado,
                    tipo_credito,
                    tipo_devedor,
                    indicador_ajuizado,
                    unidade_responsavel,
                    processo_judicial,
                    source_url,
                    imported_at
                FROM fiscal_public_debts
                WHERE org_id = ? AND import_id = ? AND cnpj = ?
                ORDER BY data_inscricao DESC NULLS LAST, valor_consolidado DESC NULLS LAST
                """,
                [org_id, snapshot["id"], cnpj_normalized],
            ).fetchall()

        records = []
        total_valor_originario = 0.0
        total_valor_consolidado = 0.0
        ajuizadas = 0
        latest_data: str | None = None
        nome_devedor: str | None = None
        situacoes: set[str] = set()

        for row in rows:
            data_inscricao = row[5].isoformat() if hasattr(row[5], "isoformat") else (str(row[5]) if row[5] else None)
            imported_at = row[14].isoformat() if hasattr(row[14], "isoformat") else (str(row[14]) if row[14] else None)
            record = {
                "id": str(row[0]),
                "cnpj": str(row[1]),
                "nome_devedor": str(row[2]) if row[2] else None,
                "situacao": str(row[3]) if row[3] else None,
                "numero_inscricao": str(row[4]) if row[4] else None,
                "data_inscricao": data_inscricao,
                "valor_originario": float(row[6]) if row[6] is not None else None,
                "valor_consolidado": float(row[7]) if row[7] is not None else None,
                "tipo_credito": str(row[8]) if row[8] else None,
                "tipo_devedor": str(row[9]) if row[9] else None,
                "indicador_ajuizado": bool(row[10]) if row[10] is not None else None,
                "unidade_responsavel": str(row[11]) if row[11] else None,
                "processo_judicial": str(row[12]) if row[12] else None,
                "source_url": str(row[13]) if row[13] else None,
                "imported_at": imported_at,
            }
            records.append(record)
            total_valor_originario += record["valor_originario"] or 0.0
            total_valor_consolidado += record["valor_consolidado"] or 0.0
            if record["indicador_ajuizado"]:
                ajuizadas += 1
            if record["situacao"]:
                situacoes.add(record["situacao"])
            if not latest_data and data_inscricao:
                latest_data = data_inscricao
            if not nome_devedor and record["nome_devedor"]:
                nome_devedor = record["nome_devedor"]

        return {
            "cnpj": cnpj_normalized,
            "snapshot": snapshot,
            "summary": {
                "has_snapshot": True,
                "has_records": bool(records),
                "total_records": len(records),
                "total_valor_originario": total_valor_originario,
                "total_valor_consolidado": total_valor_consolidado,
                "ajuizadas": ajuizadas,
                "latest_data_inscricao": latest_data,
                "nome_devedor": nome_devedor,
                "situacoes": sorted(situacoes),
            },
            "records": records,
        }


public_fiscal_data_service = PublicFiscalDataService()
