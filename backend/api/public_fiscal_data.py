"""
Consulta fiscal publica manual.
"""

from __future__ import annotations

import csv
import glob
import hashlib
import io
import json
import logging
import os
import re
import shutil
import tempfile
import unicodedata
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from api.db_pool import get_connection

logger = logging.getLogger(__name__)


DEFAULT_PROVIDER = "pgfn_open_data_manual"
DEFAULT_SOURCE_LABEL = "PGFN Dados Abertos"

_SUPPORTED_IMPORT_SUFFIXES = {".csv", ".tsv", ".txt", ".json", ".zip"}

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
    "tipo_pessoa": {
        "tipo_pessoa",
        "tipo_de_pessoa",
        "tp_pessoa",
    },
    "uf_devedor": {
        "uf_devedor",
        "uf",
        "estado",
        "uf_do_devedor",
    },
    "situacao": {
        "situacao",
        "situacao_inscricao",
        "situacao_da_inscricao",
        "status",
        "status_inscricao",
    },
    "tipo_situacao_inscricao": {
        "tipo_situacao_inscricao",
        "tipo_da_situacao_inscricao",
        "tipo_status_inscricao",
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
    "receita_principal": {
        "receita_principal",
        "receita",
        "codigo_receita_principal",
    },
    "tipo_devedor": {
        "tipo_devedor",
        "classificacao_devedor",
        "perfil_devedor",
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
    "entidade_responsavel": {
        "entidade_responsavel",
        "entidade",
        "orgao_origem",
    },
    "unidade_inscricao": {
        "unidade_inscricao",
        "unidade_da_inscricao",
        "unidade_origem",
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


def _decode_file_bytes(content: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace"), "utf-8"


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


def _strip_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _sql_escape(value: str) -> str:
    return str(value).replace("\\", "\\\\").replace("'", "''")


def _sql_literal(value: str | None) -> str:
    if value is None:
        return "NULL"
    return f"'{_sql_escape(value)}'"


def _sql_identifier(value: str) -> str:
    return '"' + str(value).replace('"', '""') + '"'


def _column_map_payload(column_maps: dict[str, dict[str, str]]) -> dict[str, Any]:
    if len(column_maps) == 1:
        return next(iter(column_maps.values()))
    return {"members": column_maps}


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
                    tipo_pessoa VARCHAR,
                    uf_devedor VARCHAR,
                    situacao VARCHAR,
                    tipo_situacao_inscricao VARCHAR,
                    numero_inscricao VARCHAR,
                    data_inscricao DATE,
                    valor_originario DOUBLE,
                    valor_consolidado DOUBLE,
                    tipo_credito VARCHAR,
                    receita_principal VARCHAR,
                    tipo_devedor VARCHAR,
                    indicador_ajuizado BOOLEAN,
                    unidade_responsavel VARCHAR,
                    entidade_responsavel VARCHAR,
                    unidade_inscricao VARCHAR,
                    processo_judicial VARCHAR,
                    source_url VARCHAR,
                    source_file_name VARCHAR,
                    source_member_name VARCHAR,
                    raw_payload_json VARCHAR,
                    imported_at TIMESTAMP NOT NULL
                )
                """
            )
            self._ensure_columns(
                conn,
                "fiscal_public_debts",
                {
                    "tipo_pessoa": "VARCHAR",
                    "uf_devedor": "VARCHAR",
                    "tipo_situacao_inscricao": "VARCHAR",
                    "receita_principal": "VARCHAR",
                    "entidade_responsavel": "VARCHAR",
                    "unidade_inscricao": "VARCHAR",
                    "source_file_name": "VARCHAR",
                    "source_member_name": "VARCHAR",
                },
            )

    def _ensure_columns(self, conn: Any, table_name: str, columns: dict[str, str]) -> None:
        existing = {
            str(row[1]).lower()
            for row in conn.execute(f"PRAGMA table_info('{_sql_escape(table_name)}')").fetchall()
        }
        for column_name, ddl in columns.items():
            if column_name.lower() not in existing:
                conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}")

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
            if normalized_header == "tipo_pessoa" and "tipo_pessoa" not in resolved:
                resolved["tipo_pessoa"] = header
            if normalized_header in {"uf", "uf_devedor"} and "uf_devedor" not in resolved:
                resolved["uf_devedor"] = header
            if "situacao" in normalized_header and "situacao" not in resolved:
                resolved["situacao"] = header
            if "tipo_situacao" in normalized_header and "tipo_situacao_inscricao" not in resolved:
                resolved["tipo_situacao_inscricao"] = header
            if "inscricao" in normalized_header and "numero" in normalized_header and "numero_inscricao" not in resolved:
                resolved["numero_inscricao"] = header
            if normalized_header.startswith("data_") and "inscricao" in normalized_header and "data_inscricao" not in resolved:
                resolved["data_inscricao"] = header
            if "consolid" in normalized_header and "valor_consolidado" not in resolved:
                resolved["valor_consolidado"] = header
            if ("origin" in normalized_header or "original" in normalized_header) and "valor_originario" not in resolved:
                resolved["valor_originario"] = header
            if "receita" in normalized_header and "receita_principal" not in resolved:
                resolved["receita_principal"] = header

        return resolved

    def _archive_members(self, archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
        members = [
            info
            for info in archive.infolist()
            if not info.is_dir() and Path(info.filename).suffix.lower() in {".csv", ".tsv", ".txt", ".json"}
        ]
        if not members:
            raise ValueError("O arquivo ZIP nao contem CSV/TSV/JSON suportado")
        return members

    def _extract_rows(self, content: bytes, filename: str | None = None) -> tuple[list[dict[str, Any]], dict[str, str]]:
        text, _ = _decode_file_bytes(content)
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
            raise ValueError(f"Nenhum registro encontrado no arquivo {filename or 'enviado'}")

        headers = list(rows[0].keys())
        column_map = self._resolve_column_map(headers)
        if "cnpj" not in column_map:
            raise ValueError(f"Nao foi possivel localizar a coluna de CNPJ em {filename or 'arquivo'}")

        return rows, column_map

    def _row_value(self, row: dict[str, Any], column_map: dict[str, str], canonical: str) -> Any:
        header = column_map.get(canonical)
        if not header:
            return None
        return row.get(header)

    def _insert_manual_rows(
        self,
        conn: Any,
        *,
        import_id: str,
        org_id: str,
        provider: str,
        imported_at: str,
        rows: list[dict[str, Any]],
        column_map: dict[str, str],
        source_file_name: str | None,
        source_member_name: str | None,
    ) -> tuple[int, int]:
        parsed_rows: list[tuple[Any, ...]] = []
        skipped_rows = 0

        for row in rows:
            cnpj = _normalize_cnpj(self._row_value(row, column_map, "cnpj"))
            if len(cnpj) != 14:
                skipped_rows += 1
                continue

            parsed_rows.append(
                (
                    str(uuid.uuid4()),
                    import_id,
                    org_id,
                    provider,
                    cnpj,
                    _strip_text(self._row_value(row, column_map, "nome_devedor")),
                    _strip_text(self._row_value(row, column_map, "tipo_pessoa")),
                    _strip_text(self._row_value(row, column_map, "uf_devedor")),
                    _strip_text(self._row_value(row, column_map, "situacao")),
                    _strip_text(self._row_value(row, column_map, "tipo_situacao_inscricao")),
                    _strip_text(self._row_value(row, column_map, "numero_inscricao")),
                    _parse_date(self._row_value(row, column_map, "data_inscricao")),
                    _parse_brl_number(self._row_value(row, column_map, "valor_originario")),
                    _parse_brl_number(self._row_value(row, column_map, "valor_consolidado")),
                    _strip_text(self._row_value(row, column_map, "tipo_credito")),
                    _strip_text(self._row_value(row, column_map, "receita_principal")),
                    _strip_text(self._row_value(row, column_map, "tipo_devedor")),
                    _parse_bool(self._row_value(row, column_map, "indicador_ajuizado")),
                    _strip_text(self._row_value(row, column_map, "unidade_responsavel")),
                    _strip_text(self._row_value(row, column_map, "entidade_responsavel")),
                    _strip_text(self._row_value(row, column_map, "unidade_inscricao")),
                    _strip_text(self._row_value(row, column_map, "processo_judicial")),
                    _strip_text(self._row_value(row, column_map, "source_url")),
                    source_file_name,
                    source_member_name,
                    _json_dumps(row),
                    imported_at,
                )
            )

        if parsed_rows:
            conn.executemany(
                """
                INSERT INTO fiscal_public_debts (
                    id,
                    import_id,
                    org_id,
                    provider,
                    cnpj,
                    nome_devedor,
                    tipo_pessoa,
                    uf_devedor,
                    situacao,
                    tipo_situacao_inscricao,
                    numero_inscricao,
                    data_inscricao,
                    valor_originario,
                    valor_consolidado,
                    tipo_credito,
                    receita_principal,
                    tipo_devedor,
                    indicador_ajuizado,
                    unidade_responsavel,
                    entidade_responsavel,
                    unidade_inscricao,
                    processo_judicial,
                    source_url,
                    source_file_name,
                    source_member_name,
                    raw_payload_json,
                    imported_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                parsed_rows,
            )

        return len(parsed_rows), skipped_rows

    def _sample_file_text(self, path: str) -> tuple[str, str]:
        with open(path, "rb") as fh:
            sample_bytes = fh.read(8192)
        return _decode_file_bytes(sample_bytes)

    def _detect_file_settings(self, path: str) -> tuple[str, str]:
        suffix = Path(path).suffix.lower()
        if suffix == ".tsv":
            _, encoding = self._sample_file_text(path)
            if encoding == "utf-8-sig":
                encoding = "utf-8"
            return "\t", encoding
        sample_text, encoding = self._sample_file_text(path)
        if encoding == "utf-8-sig":
            encoding = "utf-8"
        delimiter = _detect_delimiter(sample_text)
        return delimiter, encoding

    def _csv_scan_sql(self, path: str, delimiter: str, encoding: str) -> str:
        escaped_path = _sql_escape(os.path.abspath(path))
        escaped_delimiter = delimiter.replace("'", "''")
        escaped_encoding = encoding.replace("'", "''")
        return (
            f"read_csv_auto('{escaped_path}', auto_detect=true, delim='{escaped_delimiter}', "
            f"header=true, all_varchar=true, ignore_errors=true, encoding='{escaped_encoding}')"
        )

    def _text_expr(self, source_expr: str) -> str:
        return f"NULLIF(TRIM(CAST({source_expr} AS VARCHAR)), '')"

    def _cnpj_expr(self, source_expr: str) -> str:
        return (
            "REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(CAST("
            + source_expr
            + " AS VARCHAR), '')), '.', ''), '/', ''), '-', ''), ' ', '')"
        )

    def _number_expr(self, source_expr: str) -> str:
        cleaned = (
            "REPLACE(REPLACE(TRIM(COALESCE(CAST("
            + source_expr
            + " AS VARCHAR), '')), 'R$', ''), ' ', '')"
        )
        return (
            "CASE "
            f"WHEN {cleaned} = '' THEN NULL "
            f"WHEN STRPOS({cleaned}, ',') > 0 AND STRPOS({cleaned}, '.') > 0 THEN "
            f"TRY_CAST(REPLACE(REPLACE({cleaned}, '.', ''), ',', '.') AS DOUBLE) "
            f"WHEN STRPOS({cleaned}, ',') > 0 THEN TRY_CAST(REPLACE({cleaned}, ',', '.') AS DOUBLE) "
            f"ELSE TRY_CAST({cleaned} AS DOUBLE) END"
        )

    def _date_expr(self, source_expr: str) -> str:
        trimmed = f"TRIM(COALESCE(CAST({source_expr} AS VARCHAR), ''))"
        return (
            "CAST(COALESCE("
            f"TRY_STRPTIME({trimmed}, '%Y-%m-%d'), "
            f"TRY_STRPTIME({trimmed}, '%d/%m/%Y'), "
            f"TRY_STRPTIME({trimmed}, '%d-%m-%Y'), "
            f"TRY_STRPTIME({trimmed}, '%Y/%m/%d'), "
            f"TRY_STRPTIME({trimmed}, '%d/%m/%y')"
            ") AS DATE)"
        )

    def _bool_expr(self, source_expr: str) -> str:
        normalized = f"LOWER(TRIM(COALESCE(CAST({source_expr} AS VARCHAR), '')))"
        return (
            "CASE "
            f"WHEN {normalized} IN ('1', 'true', 'sim', 's', 'ajuizado', 'yes') THEN TRUE "
            f"WHEN {normalized} IN ('0', 'false', 'nao', 'n', 'not', 'na') THEN FALSE "
            "ELSE NULL END"
        )

    def _column_expr(self, column_map: dict[str, str], canonical: str) -> str:
        source = column_map.get(canonical)
        if not source:
            return "NULL"
        quoted = _sql_identifier(source)
        if canonical == "cnpj":
            return self._cnpj_expr(quoted)
        if canonical in {
            "nome_devedor",
            "tipo_pessoa",
            "uf_devedor",
            "situacao",
            "tipo_situacao_inscricao",
            "numero_inscricao",
            "tipo_credito",
            "receita_principal",
            "tipo_devedor",
            "unidade_responsavel",
            "entidade_responsavel",
            "unidade_inscricao",
            "processo_judicial",
            "source_url",
        }:
            return self._text_expr(quoted)
        if canonical in {"valor_originario", "valor_consolidado"}:
            return self._number_expr(quoted)
        if canonical == "data_inscricao":
            return self._date_expr(quoted)
        if canonical == "indicador_ajuizado":
            return self._bool_expr(quoted)
        return self._text_expr(quoted)

    def _bulk_insert_csv_file(
        self,
        conn: Any,
        *,
        import_id: str,
        org_id: str,
        provider: str,
        imported_at: str,
        path: str,
        source_file_name: str | None,
        source_member_name: str | None,
    ) -> tuple[dict[str, str], int]:
        delimiter, encoding = self._detect_file_settings(path)
        scan_sql = self._csv_scan_sql(path, delimiter, encoding)
        columns = [str(row[0]) for row in conn.execute(f"DESCRIBE SELECT * FROM {scan_sql}").fetchall()]
        column_map = self._resolve_column_map(columns)
        if "cnpj" not in column_map:
            raise ValueError(f"Nao foi possivel localizar a coluna de CNPJ em {source_member_name or source_file_name or path}")

        cnpj_expr = self._column_expr(column_map, "cnpj")
        total_rows = int(conn.execute(f"SELECT COUNT(*) FROM {scan_sql}").fetchone()[0] or 0)
        valid_rows = int(
            conn.execute(f"SELECT COUNT(*) FROM {scan_sql} WHERE LENGTH({cnpj_expr}) = 14").fetchone()[0] or 0
        )
        skipped_rows = max(total_rows - valid_rows, 0)

        file_token = hashlib.sha1(
            f"{source_file_name or path}::{source_member_name or ''}".encode("utf-8")
        ).hexdigest()[:12]
        conn.execute(
            f"""
            INSERT INTO fiscal_public_debts (
                id,
                import_id,
                org_id,
                provider,
                cnpj,
                nome_devedor,
                tipo_pessoa,
                uf_devedor,
                situacao,
                tipo_situacao_inscricao,
                numero_inscricao,
                data_inscricao,
                valor_originario,
                valor_consolidado,
                tipo_credito,
                receita_principal,
                tipo_devedor,
                indicador_ajuizado,
                unidade_responsavel,
                entidade_responsavel,
                unidade_inscricao,
                processo_judicial,
                source_url,
                source_file_name,
                source_member_name,
                raw_payload_json,
                imported_at
            )
            SELECT
                CONCAT({_sql_literal(import_id + '-' + file_token + '-')}, CAST(ROW_NUMBER() OVER () AS VARCHAR)) AS id,
                {_sql_literal(import_id)} AS import_id,
                {_sql_literal(org_id)} AS org_id,
                {_sql_literal(provider)} AS provider,
                {cnpj_expr} AS cnpj,
                {self._column_expr(column_map, 'nome_devedor')} AS nome_devedor,
                {self._column_expr(column_map, 'tipo_pessoa')} AS tipo_pessoa,
                {self._column_expr(column_map, 'uf_devedor')} AS uf_devedor,
                {self._column_expr(column_map, 'situacao')} AS situacao,
                {self._column_expr(column_map, 'tipo_situacao_inscricao')} AS tipo_situacao_inscricao,
                {self._column_expr(column_map, 'numero_inscricao')} AS numero_inscricao,
                {self._column_expr(column_map, 'data_inscricao')} AS data_inscricao,
                {self._column_expr(column_map, 'valor_originario')} AS valor_originario,
                {self._column_expr(column_map, 'valor_consolidado')} AS valor_consolidado,
                {self._column_expr(column_map, 'tipo_credito')} AS tipo_credito,
                {self._column_expr(column_map, 'receita_principal')} AS receita_principal,
                {self._column_expr(column_map, 'tipo_devedor')} AS tipo_devedor,
                {self._column_expr(column_map, 'indicador_ajuizado')} AS indicador_ajuizado,
                {self._column_expr(column_map, 'unidade_responsavel')} AS unidade_responsavel,
                {self._column_expr(column_map, 'entidade_responsavel')} AS entidade_responsavel,
                {self._column_expr(column_map, 'unidade_inscricao')} AS unidade_inscricao,
                {self._column_expr(column_map, 'processo_judicial')} AS processo_judicial,
                {self._column_expr(column_map, 'source_url')} AS source_url,
                {_sql_literal(source_file_name)} AS source_file_name,
                {_sql_literal(source_member_name)} AS source_member_name,
                NULL AS raw_payload_json,
                CAST({_sql_literal(imported_at)} AS TIMESTAMP) AS imported_at
            FROM {scan_sql}
            WHERE LENGTH({cnpj_expr}) = 14
            """
        )
        return column_map, skipped_rows

    def _snapshot_stats(self, conn: Any, import_id: str) -> tuple[int, int]:
        row = conn.execute(
            """
            SELECT COUNT(*), COUNT(DISTINCT cnpj)
            FROM fiscal_public_debts
            WHERE import_id = ?
            """,
            [import_id],
        ).fetchone()
        return int(row[0] or 0), int(row[1] or 0)

    def _write_import_meta(
        self,
        conn: Any,
        *,
        import_id: str,
        org_id: str,
        provider: str,
        source_label: str,
        filename: str | None,
        file_sha256: str | None,
        notes: str | None,
        record_count: int,
        unique_cnpjs: int,
        skipped_rows: int,
        imported_at: str,
        column_maps: dict[str, dict[str, str]],
    ) -> None:
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
                record_count,
                unique_cnpjs,
                skipped_rows,
                imported_at,
                _json_dumps(_column_map_payload(column_maps)),
            ],
        )

    def _cleanup_import(self, import_id: str) -> None:
        with get_connection(read_only=False) as conn:
            conn.execute("DELETE FROM fiscal_public_debts WHERE import_id = ?", [import_id])
            conn.execute("DELETE FROM fiscal_public_imports WHERE id = ?", [import_id])

    def _expand_paths(self, paths: Iterable[str]) -> list[str]:
        resolved: list[str] = []
        seen: set[str] = set()
        for raw_path in paths:
            path = str(raw_path or "").strip().strip('"')
            if not path:
                continue

            candidates: list[str] = []
            if any(token in path for token in "*?[]"):
                candidates.extend(glob.glob(path, recursive=True))
            else:
                candidates.append(path)

            for candidate in candidates:
                candidate_path = Path(candidate)
                if candidate_path.is_dir():
                    for child in sorted(candidate_path.rglob("*")):
                        if child.is_file() and child.suffix.lower() in _SUPPORTED_IMPORT_SUFFIXES:
                            child_resolved = str(child.resolve())
                            if child_resolved not in seen:
                                seen.add(child_resolved)
                                resolved.append(child_resolved)
                elif candidate_path.is_file() and candidate_path.suffix.lower() in _SUPPORTED_IMPORT_SUFFIXES:
                    resolved_path = str(candidate_path.resolve())
                    if resolved_path not in seen:
                        seen.add(resolved_path)
                        resolved.append(resolved_path)
        return sorted(resolved)

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

        import_id = str(uuid.uuid4())
        imported_at = datetime.now(timezone.utc).isoformat()
        file_sha256 = hashlib.sha256(content).hexdigest()
        column_maps: dict[str, dict[str, str]] = {}
        skipped_rows = 0

        try:
            with get_connection(read_only=False) as conn:
                if zipfile.is_zipfile(io.BytesIO(content)):
                    with zipfile.ZipFile(io.BytesIO(content)) as archive:
                        for member in self._archive_members(archive):
                            member_content = archive.read(member)
                            rows, column_map = self._extract_rows(member_content, member.filename)
                            column_maps[member.filename] = column_map
                            _, local_skipped = self._insert_manual_rows(
                                conn,
                                import_id=import_id,
                                org_id=org_id,
                                provider=provider,
                                imported_at=imported_at,
                                rows=rows,
                                column_map=column_map,
                                source_file_name=filename or Path(member.filename).name,
                                source_member_name=member.filename,
                            )
                            skipped_rows += local_skipped
                else:
                    rows, column_map = self._extract_rows(content, filename)
                    label = filename or "snapshot_manual"
                    column_maps[label] = column_map
                    _, skipped_rows = self._insert_manual_rows(
                        conn,
                        import_id=import_id,
                        org_id=org_id,
                        provider=provider,
                        imported_at=imported_at,
                        rows=rows,
                        column_map=column_map,
                        source_file_name=filename,
                        source_member_name=None,
                    )

                record_count, unique_cnpjs = self._snapshot_stats(conn, import_id)
                if record_count <= 0:
                    raise ValueError("Nenhum CNPJ corporativo valido foi encontrado no arquivo")

                self._write_import_meta(
                    conn,
                    import_id=import_id,
                    org_id=org_id,
                    provider=provider,
                    source_label=source_label,
                    filename=filename,
                    file_sha256=file_sha256,
                    notes=notes,
                    record_count=record_count,
                    unique_cnpjs=unique_cnpjs,
                    skipped_rows=skipped_rows,
                    imported_at=imported_at,
                    column_maps=column_maps,
                )
        except Exception:
            self._cleanup_import(import_id)
            raise

        logger.info(
            "Importacao fiscal publica concluida | org=%s import_id=%s registros=%s cnpjs=%s skipped=%s",
            org_id,
            import_id,
            record_count,
            unique_cnpjs,
            skipped_rows,
        )
        return self.get_latest_snapshot_meta(org_id) or {}

    def import_snapshot_paths(
        self,
        org_id: str,
        paths: Iterable[str],
        *,
        provider: str = DEFAULT_PROVIDER,
        source_label: str = DEFAULT_SOURCE_LABEL,
        notes: str | None = None,
        filename: str | None = None,
    ) -> dict[str, Any]:
        self.ensure_tables()

        resolved_paths = self._expand_paths(paths)
        if not resolved_paths:
            raise ValueError("Nenhum arquivo suportado foi encontrado nos caminhos informados")

        import_id = str(uuid.uuid4())
        imported_at = datetime.now(timezone.utc).isoformat()
        skipped_rows = 0
        column_maps: dict[str, dict[str, str]] = {}
        file_sha256 = hashlib.sha256("\n".join(resolved_paths).encode("utf-8")).hexdigest()
        snapshot_filename = filename or "; ".join(Path(path).name for path in resolved_paths[:3])
        if len(resolved_paths) > 3:
            snapshot_filename = f"{snapshot_filename}; +{len(resolved_paths) - 3} arquivos"

        try:
            with get_connection(read_only=False) as conn:
                for path in resolved_paths:
                    suffix = Path(path).suffix.lower()
                    base_name = Path(path).name
                    if suffix == ".zip":
                        with zipfile.ZipFile(path) as archive:
                            for member in self._archive_members(archive):
                                with tempfile.NamedTemporaryFile(
                                    prefix="pgfn-member-",
                                    suffix=Path(member.filename).suffix,
                                    delete=False,
                                ) as temp_file:
                                    with archive.open(member) as member_stream:
                                        shutil.copyfileobj(member_stream, temp_file)
                                    temp_path = temp_file.name

                                try:
                                    member_suffix = Path(member.filename).suffix.lower()
                                    if member_suffix == ".json":
                                        with open(temp_path, "rb") as temp_json:
                                            rows, column_map = self._extract_rows(temp_json.read(), member.filename)
                                        column_maps[f"{base_name}::{member.filename}"] = column_map
                                        _, local_skipped = self._insert_manual_rows(
                                            conn,
                                            import_id=import_id,
                                            org_id=org_id,
                                            provider=provider,
                                            imported_at=imported_at,
                                            rows=rows,
                                            column_map=column_map,
                                            source_file_name=base_name,
                                            source_member_name=member.filename,
                                        )
                                    else:
                                        column_map, local_skipped = self._bulk_insert_csv_file(
                                            conn,
                                            import_id=import_id,
                                            org_id=org_id,
                                            provider=provider,
                                            imported_at=imported_at,
                                            path=temp_path,
                                            source_file_name=base_name,
                                            source_member_name=member.filename,
                                        )
                                        column_maps[f"{base_name}::{member.filename}"] = column_map
                                    skipped_rows += local_skipped
                                finally:
                                    try:
                                        os.remove(temp_path)
                                    except OSError:
                                        pass
                    elif suffix == ".json":
                        with open(path, "rb") as fh:
                            rows, column_map = self._extract_rows(fh.read(), base_name)
                        column_maps[base_name] = column_map
                        _, local_skipped = self._insert_manual_rows(
                            conn,
                            import_id=import_id,
                            org_id=org_id,
                            provider=provider,
                            imported_at=imported_at,
                            rows=rows,
                            column_map=column_map,
                            source_file_name=base_name,
                            source_member_name=None,
                        )
                        skipped_rows += local_skipped
                    else:
                        column_map, local_skipped = self._bulk_insert_csv_file(
                            conn,
                            import_id=import_id,
                            org_id=org_id,
                            provider=provider,
                            imported_at=imported_at,
                            path=path,
                            source_file_name=base_name,
                            source_member_name=None,
                        )
                        column_maps[base_name] = column_map
                        skipped_rows += local_skipped

                record_count, unique_cnpjs = self._snapshot_stats(conn, import_id)
                if record_count <= 0:
                    raise ValueError("Nenhum CNPJ corporativo valido foi encontrado nos arquivos informados")

                self._write_import_meta(
                    conn,
                    import_id=import_id,
                    org_id=org_id,
                    provider=provider,
                    source_label=source_label,
                    filename=snapshot_filename,
                    file_sha256=file_sha256,
                    notes=notes,
                    record_count=record_count,
                    unique_cnpjs=unique_cnpjs,
                    skipped_rows=skipped_rows,
                    imported_at=imported_at,
                    column_maps=column_maps,
                )
        except Exception:
            self._cleanup_import(import_id)
            raise

        logger.info(
            "Importacao fiscal publica por caminho concluida | org=%s import_id=%s registros=%s cnpjs=%s arquivos=%s skipped=%s",
            org_id,
            import_id,
            record_count,
            unique_cnpjs,
            len(resolved_paths),
            skipped_rows,
        )
        return self.get_latest_snapshot_meta(org_id) or {}

    def get_latest_snapshot_meta(self, org_id: str) -> dict[str, Any] | None:
        self.ensure_tables()
        # fiscal_public_* vive em app.duckdb (read_only=False no pool)
        with get_connection(read_only=False) as conn:
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
                    "ufs": [],
                    "tipos_credito": [],
                    "fontes": [],
                },
                "records": [],
            }

        with get_connection(read_only=False) as conn:
            rows = conn.execute(
                """
                SELECT
                    id,
                    cnpj,
                    nome_devedor,
                    tipo_pessoa,
                    uf_devedor,
                    situacao,
                    tipo_situacao_inscricao,
                    numero_inscricao,
                    data_inscricao,
                    valor_originario,
                    valor_consolidado,
                    tipo_credito,
                    receita_principal,
                    tipo_devedor,
                    indicador_ajuizado,
                    unidade_responsavel,
                    entidade_responsavel,
                    unidade_inscricao,
                    processo_judicial,
                    source_url,
                    source_file_name,
                    source_member_name,
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
        ufs: set[str] = set()
        tipos_credito: set[str] = set()
        fontes: set[str] = set()

        for row in rows:
            data_inscricao = row[8].isoformat() if hasattr(row[8], "isoformat") else (str(row[8]) if row[8] else None)
            imported_at = row[22].isoformat() if hasattr(row[22], "isoformat") else (str(row[22]) if row[22] else None)
            record = {
                "id": str(row[0]),
                "cnpj": str(row[1]),
                "nome_devedor": str(row[2]) if row[2] else None,
                "tipo_pessoa": str(row[3]) if row[3] else None,
                "uf_devedor": str(row[4]) if row[4] else None,
                "situacao": str(row[5]) if row[5] else None,
                "tipo_situacao_inscricao": str(row[6]) if row[6] else None,
                "numero_inscricao": str(row[7]) if row[7] else None,
                "data_inscricao": data_inscricao,
                "valor_originario": float(row[9]) if row[9] is not None else None,
                "valor_consolidado": float(row[10]) if row[10] is not None else None,
                "tipo_credito": str(row[11]) if row[11] else None,
                "receita_principal": str(row[12]) if row[12] else None,
                "tipo_devedor": str(row[13]) if row[13] else None,
                "indicador_ajuizado": bool(row[14]) if row[14] is not None else None,
                "unidade_responsavel": str(row[15]) if row[15] else None,
                "entidade_responsavel": str(row[16]) if row[16] else None,
                "unidade_inscricao": str(row[17]) if row[17] else None,
                "processo_judicial": str(row[18]) if row[18] else None,
                "source_url": str(row[19]) if row[19] else None,
                "source_file_name": str(row[20]) if row[20] else None,
                "source_member_name": str(row[21]) if row[21] else None,
                "imported_at": imported_at,
            }
            records.append(record)
            total_valor_originario += record["valor_originario"] or 0.0
            total_valor_consolidado += record["valor_consolidado"] or 0.0
            if record["indicador_ajuizado"]:
                ajuizadas += 1
            if record["situacao"]:
                situacoes.add(record["situacao"])
            if record["uf_devedor"]:
                ufs.add(record["uf_devedor"])
            if record["tipo_credito"]:
                tipos_credito.add(record["tipo_credito"])
            elif record["receita_principal"]:
                tipos_credito.add(record["receita_principal"])
            if record["source_member_name"]:
                fontes.add(record["source_member_name"])
            elif record["source_file_name"]:
                fontes.add(record["source_file_name"])
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
                "ufs": sorted(ufs),
                "tipos_credito": sorted(tipos_credito),
                "fontes": sorted(fontes),
            },
            "records": records,
        }

    def _fechada_substrings_from_env(self) -> list[str]:
        raw = os.getenv(
            "HERMES_PG_PUBLIC_FISCAL_SITUACAO_FECHADA_SUBSTR",
            "quit,baix,exclu,pago,cancel,anul",
        )
        return [x.strip() for x in raw.split(",") if x.strip()]

    def _sql_situacao_divida_aberta(self) -> str:
        """
        Fragmento SQL: linha da dívida considerada 'em aberto' para fins de prospecção.
        Situação vazia/desconhecida conta como aberta (evita descartar import incompleto).
        """
        patterns = self._fechada_substrings_from_env()
        if not patterns:
            return "1=1"
        parts: list[str] = []
        for p in patterns:
            esc = p.replace("'", "''").upper()
            parts.append(f"UPPER(COALESCE(situacao,'')) NOT LIKE '%{esc}%'")
        inner = " AND ".join(parts)
        return f"(TRIM(COALESCE(situacao,'')) = '' OR ({inner}))"

    def batch_cnpjs_divida_aberta(self, org_id: str, cnpjs: list[str]) -> set[str]:
        """
        CNPJs que possuem ao menos uma inscrição considerada em aberto no snapshot PGFN mais recente.
        Usado para filtrar prospecção (ex.: cliente interno focado em recuperação de crédito).
        """
        self.ensure_tables()
        normalized = [_normalize_cnpj(c) for c in cnpjs]
        normalized = [c for c in normalized if len(c) == 14]
        if not normalized:
            return set()
        snapshot = self.get_latest_snapshot_meta(org_id)
        if not snapshot:
            logger.warning("batch_cnpjs_divida_aberta: sem snapshot PGFN importado para org_id=%s", org_id)
            return set()
        import_id = snapshot["id"]
        situacao_sql = self._sql_situacao_divida_aberta()
        out: set[str] = set()
        chunk_size = min(500, max(50, _env_int_chunk()))
        with get_connection(read_only=False) as conn:
            for i in range(0, len(normalized), chunk_size):
                chunk = normalized[i : i + chunk_size]
                placeholders = ", ".join(["?"] * len(chunk))
                sql = f"""
                    SELECT DISTINCT cnpj
                    FROM fiscal_public_debts
                    WHERE org_id = ?
                      AND import_id = ?
                      AND cnpj IN ({placeholders})
                      AND ({situacao_sql})
                """
                rows = conn.execute(sql, [org_id, import_id] + chunk).fetchall()
                for r in rows:
                    out.add(str(r[0]))
        return out


def _env_int_chunk() -> int:
    raw = os.getenv("HERMES_PG_PUBLIC_BATCH_CHUNK", "450").strip()
    try:
        return max(50, int(raw))
    except ValueError:
        return 450


public_fiscal_data_service = PublicFiscalDataService()
