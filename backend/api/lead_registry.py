from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from api.db_pool import close_all_connections, get_connection

logger = logging.getLogger(__name__)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_cnpj(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits[:14]


def _normalize_email(value: Any) -> Optional[str]:
    email = str(value or "").strip().lower()
    return email or None


def _normalize_domain(value: Any) -> Optional[str]:
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if "@" in raw:
        raw = raw.split("@", 1)[1]
    raw = raw.replace("https://", "").replace("http://", "").strip("/")
    return raw or None


def _sanitize_jsonish(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _sanitize_jsonish(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_sanitize_jsonish(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_jsonish(item) for item in value]
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def _json_dumps(value: Any) -> str:
    sanitized = _sanitize_jsonish(value)
    return json.dumps(sanitized, ensure_ascii=False, allow_nan=False, default=str)


class LeadRegistryService:
    def ensure_schema(self) -> None:
        with get_connection(read_only=False) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS lead_lists (
                    id VARCHAR PRIMARY KEY,
                    org_id VARCHAR NOT NULL,
                    name VARCHAR NOT NULL,
                    description VARCHAR,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS lead_list_items (
                    id VARCHAR PRIMARY KEY,
                    list_id VARCHAR NOT NULL,
                    org_id VARCHAR NOT NULL,
                    cnpj VARCHAR NOT NULL,
                    razao_social VARCHAR,
                    nome_fantasia VARCHAR,
                    cidade VARCHAR,
                    uf VARCHAR,
                    segmento VARCHAR,
                    porte VARCHAR,
                    score_icp DOUBLE,
                    source VARCHAR,
                    company_json VARCHAR,
                    added_at TIMESTAMP NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS lead_suppressions (
                    id VARCHAR PRIMARY KEY,
                    org_id VARCHAR NOT NULL,
                    cnpj VARCHAR,
                    email VARCHAR,
                    domain VARCHAR,
                    reason VARCHAR,
                    source VARCHAR,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
                """
            )
        close_all_connections()

    def list_lists(self, org_id: str) -> List[Dict[str, Any]]:
        self.ensure_schema()
        with get_connection(read_only=True) as conn:
            rows = conn.execute(
                """
                SELECT
                    l.id,
                    l.name,
                    l.description,
                    l.created_at,
                    l.updated_at,
                    COUNT(i.id) AS item_count,
                    MAX(i.added_at) AS last_item_added_at
                FROM lead_lists l
                LEFT JOIN lead_list_items i
                    ON i.org_id = l.org_id
                   AND i.list_id = l.id
                WHERE l.org_id = ?
                GROUP BY l.id, l.name, l.description, l.created_at, l.updated_at
                ORDER BY COALESCE(MAX(i.added_at), l.updated_at) DESC, l.name ASC
                """,
                [org_id],
            ).fetchall()

        return [
            {
                "id": str(row[0]),
                "name": str(row[1]),
                "description": str(row[2]) if row[2] else None,
                "created_at": row[3].isoformat() if row[3] else None,
                "updated_at": row[4].isoformat() if row[4] else None,
                "item_count": int(row[5] or 0),
                "last_item_added_at": row[6].isoformat() if row[6] else None,
            }
            for row in rows
        ]

    def create_list(self, org_id: str, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        self.ensure_schema()
        name_clean = str(name or "").strip()
        if not name_clean:
            raise ValueError("Informe um nome para a lista.")

        now = _utcnow_iso()
        list_id = str(uuid4())

        with get_connection(read_only=False) as conn:
            conn.execute(
                """
                INSERT INTO lead_lists (id, org_id, name, description, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [list_id, org_id, name_clean, (description or "").strip() or None, now, now],
            )

        return {
            "id": list_id,
            "name": name_clean,
            "description": (description or "").strip() or None,
            "created_at": now,
            "updated_at": now,
            "item_count": 0,
            "last_item_added_at": None,
        }

    def update_list(self, org_id: str, list_id: str, *, name: Optional[str], description: Optional[str]) -> bool:
        self.ensure_schema()
        assignments: List[str] = []
        params: List[Any] = []

        if name is not None:
            name_clean = str(name).strip()
            if not name_clean:
                raise ValueError("Informe um nome para a lista.")
            assignments.append("name = ?")
            params.append(name_clean)

        if description is not None:
            assignments.append("description = ?")
            params.append(str(description).strip() or None)

        if not assignments:
            return False

        assignments.append("updated_at = ?")
        params.append(_utcnow_iso())
        params.extend([org_id, list_id])

        with get_connection(read_only=False) as conn:
            existing = conn.execute(
                "SELECT 1 FROM lead_lists WHERE org_id = ? AND id = ? LIMIT 1",
                [org_id, list_id],
            ).fetchone()
            if not existing:
                return False
            conn.execute(
                f"UPDATE lead_lists SET {', '.join(assignments)} WHERE org_id = ? AND id = ?",
                params,
            )
        return True

    def delete_list(self, org_id: str, list_id: str) -> bool:
        self.ensure_schema()
        with get_connection(read_only=False) as conn:
            existing = conn.execute(
                "SELECT 1 FROM lead_lists WHERE org_id = ? AND id = ? LIMIT 1",
                [org_id, list_id],
            ).fetchone()
            if not existing:
                return False
            conn.execute(
                "DELETE FROM lead_list_items WHERE org_id = ? AND list_id = ?",
                [org_id, list_id],
            )
            conn.execute(
                "DELETE FROM lead_lists WHERE org_id = ? AND id = ?",
                [org_id, list_id],
            )
        return True

    def get_list_items(self, org_id: str, list_id: str) -> List[Dict[str, Any]]:
        self.ensure_schema()
        with get_connection(read_only=True) as conn:
            rows = conn.execute(
                """
                SELECT
                    id,
                    cnpj,
                    razao_social,
                    nome_fantasia,
                    cidade,
                    uf,
                    segmento,
                    porte,
                    score_icp,
                    source,
                    company_json,
                    added_at
                FROM lead_list_items
                WHERE org_id = ? AND list_id = ?
                ORDER BY added_at DESC, razao_social ASC
                """,
                [org_id, list_id],
            ).fetchall()

        items: List[Dict[str, Any]] = []
        for row in rows:
            payload: Dict[str, Any] = {}
            if row[10]:
                try:
                    payload = json.loads(row[10])
                except Exception as exc:
                    logger.warning("Falha ao desserializar lead_list_items.company_json: %s", exc)
            if not payload:
                payload = {
                    "cnpj": str(row[1]),
                    "razao_social": str(row[2]) if row[2] else None,
                    "nome_fantasia": str(row[3]) if row[3] else None,
                    "cidade": str(row[4]) if row[4] else None,
                    "uf": str(row[5]) if row[5] else None,
                    "segmento": str(row[6]) if row[6] else None,
                    "porte": str(row[7]) if row[7] else None,
                    "score_icp": float(row[8]) if row[8] is not None else None,
                }
            items.append(
                {
                    "id": str(row[0]),
                    "cnpj": str(row[1]),
                    "score_icp": float(row[8]) if row[8] is not None else None,
                    "source": str(row[9]) if row[9] else None,
                    "added_at": row[11].isoformat() if row[11] else None,
                    "empresa": payload,
                }
            )
        return items

    def add_items(self, org_id: str, list_id: str, items: List[Dict[str, Any]]) -> int:
        self.ensure_schema()
        if not items:
            return 0

        with get_connection(read_only=False) as conn:
            exists = conn.execute(
                "SELECT 1 FROM lead_lists WHERE org_id = ? AND id = ? LIMIT 1",
                [org_id, list_id],
            ).fetchone()
            if not exists:
                raise LookupError("Lista não encontrada.")

            added = 0
            now = _utcnow_iso()
            seen: set[str] = set()
            for item in items:
                empresa = item.get("empresa") if isinstance(item.get("empresa"), dict) else item
                cnpj = _normalize_cnpj((empresa or {}).get("cnpj"))
                if not cnpj or cnpj in seen:
                    continue
                seen.add(cnpj)

                score_icp = item.get("score_icp")
                if score_icp is None and isinstance(empresa, dict):
                    score_icp = empresa.get("score_icp")

                source = str(item.get("source") or "results_selection").strip() or "results_selection"
                payload = _sanitize_jsonish(empresa or {})

                conn.execute(
                    "DELETE FROM lead_list_items WHERE org_id = ? AND list_id = ? AND cnpj = ?",
                    [org_id, list_id, cnpj],
                )
                conn.execute(
                    """
                    INSERT INTO lead_list_items (
                        id,
                        list_id,
                        org_id,
                        cnpj,
                        razao_social,
                        nome_fantasia,
                        cidade,
                        uf,
                        segmento,
                        porte,
                        score_icp,
                        source,
                        company_json,
                        added_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        str(uuid4()),
                        list_id,
                        org_id,
                        cnpj,
                        (payload or {}).get("razao_social"),
                        (payload or {}).get("nome_fantasia"),
                        (payload or {}).get("cidade"),
                        (payload or {}).get("uf"),
                        (payload or {}).get("segmento"),
                        (payload or {}).get("porte"),
                        float(score_icp) if score_icp is not None else None,
                        source,
                        _json_dumps(payload),
                        now,
                    ],
                )
                added += 1

            conn.execute(
                "UPDATE lead_lists SET updated_at = ? WHERE org_id = ? AND id = ?",
                [now, org_id, list_id],
            )

        return added

    def remove_list_item(self, org_id: str, list_id: str, cnpj: str) -> bool:
        self.ensure_schema()
        cnpj_clean = _normalize_cnpj(cnpj)
        if not cnpj_clean:
            return False

        with get_connection(read_only=False) as conn:
            existing = conn.execute(
                """
                SELECT 1
                FROM lead_list_items
                WHERE org_id = ? AND list_id = ? AND cnpj = ?
                LIMIT 1
                """,
                [org_id, list_id, cnpj_clean],
            ).fetchone()
            if not existing:
                return False
            conn.execute(
                "DELETE FROM lead_list_items WHERE org_id = ? AND list_id = ? AND cnpj = ?",
                [org_id, list_id, cnpj_clean],
            )
            conn.execute(
                "UPDATE lead_lists SET updated_at = ? WHERE org_id = ? AND id = ?",
                [_utcnow_iso(), org_id, list_id],
            )
        return True

    def list_suppressions(self, org_id: str) -> List[Dict[str, Any]]:
        self.ensure_schema()
        with get_connection(read_only=True) as conn:
            rows = conn.execute(
                """
                SELECT id, cnpj, email, domain, reason, source, created_at, updated_at
                FROM lead_suppressions
                WHERE org_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                [org_id],
            ).fetchall()

        return [
            {
                "id": str(row[0]),
                "cnpj": str(row[1]) if row[1] else None,
                "email": str(row[2]) if row[2] else None,
                "domain": str(row[3]) if row[3] else None,
                "reason": str(row[4]) if row[4] else None,
                "source": str(row[5]) if row[5] else None,
                "created_at": row[6].isoformat() if row[6] else None,
                "updated_at": row[7].isoformat() if row[7] else None,
            }
            for row in rows
        ]

    def add_suppressions(
        self,
        org_id: str,
        *,
        cnpjs: Optional[List[str]] = None,
        emails: Optional[List[str]] = None,
        domains: Optional[List[str]] = None,
        reason: Optional[str] = None,
        source: Optional[str] = None,
    ) -> int:
        self.ensure_schema()
        normalized_cnpjs = sorted({_normalize_cnpj(cnpj) for cnpj in (cnpjs or []) if _normalize_cnpj(cnpj)})
        normalized_emails = sorted({_normalize_email(email) for email in (emails or []) if _normalize_email(email)})
        normalized_domains = sorted({_normalize_domain(domain) for domain in (domains or []) if _normalize_domain(domain)})

        if not normalized_cnpjs and not normalized_emails and not normalized_domains:
            return 0

        reason_clean = str(reason or "").strip() or None
        source_clean = str(source or "manual").strip() or "manual"
        now = _utcnow_iso()
        added = 0

        with get_connection(read_only=False) as conn:
            for cnpj in normalized_cnpjs:
                added += self._upsert_suppression_row(
                    conn,
                    org_id,
                    cnpj=cnpj,
                    email=None,
                    domain=None,
                    reason=reason_clean,
                    source=source_clean,
                    now=now,
                )
            for email in normalized_emails:
                added += self._upsert_suppression_row(
                    conn,
                    org_id,
                    cnpj=None,
                    email=email,
                    domain=None,
                    reason=reason_clean,
                    source=source_clean,
                    now=now,
                )
            for domain in normalized_domains:
                added += self._upsert_suppression_row(
                    conn,
                    org_id,
                    cnpj=None,
                    email=None,
                    domain=domain,
                    reason=reason_clean,
                    source=source_clean,
                    now=now,
                )

        return added

    def _upsert_suppression_row(
        self,
        conn: Any,
        org_id: str,
        *,
        cnpj: Optional[str],
        email: Optional[str],
        domain: Optional[str],
        reason: Optional[str],
        source: str,
        now: str,
    ) -> int:
        existing = conn.execute(
            """
            SELECT id
            FROM lead_suppressions
            WHERE org_id = ?
              AND COALESCE(cnpj, '') = COALESCE(?, '')
              AND COALESCE(email, '') = COALESCE(?, '')
              AND COALESCE(domain, '') = COALESCE(?, '')
            LIMIT 1
            """,
            [org_id, cnpj, email, domain],
        ).fetchone()

        if existing:
            conn.execute(
                """
                UPDATE lead_suppressions
                SET reason = ?, source = ?, updated_at = ?
                WHERE id = ?
                """,
                [reason, source, now, str(existing[0])],
            )
            return 0

        conn.execute(
            """
            INSERT INTO lead_suppressions (
                id,
                org_id,
                cnpj,
                email,
                domain,
                reason,
                source,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [str(uuid4()), org_id, cnpj, email, domain, reason, source, now, now],
        )
        return 1

    def remove_suppression(self, org_id: str, suppression_id: str) -> bool:
        self.ensure_schema()
        with get_connection(read_only=False) as conn:
            existing = conn.execute(
                "SELECT 1 FROM lead_suppressions WHERE org_id = ? AND id = ? LIMIT 1",
                [org_id, suppression_id],
            ).fetchone()
            if not existing:
                return False
            conn.execute(
                "DELETE FROM lead_suppressions WHERE org_id = ? AND id = ?",
                [org_id, suppression_id],
            )
        return True

    def get_suppressed_cnpjs(self, org_id: str) -> List[str]:
        self.ensure_schema()
        with get_connection(read_only=True) as conn:
            rows = conn.execute(
                """
                SELECT DISTINCT cnpj
                FROM lead_suppressions
                WHERE org_id = ?
                  AND cnpj IS NOT NULL
                  AND cnpj <> ''
                ORDER BY cnpj ASC
                """,
                [org_id],
            ).fetchall()
        return [str(row[0]) for row in rows if row and row[0]]


lead_registry_service = LeadRegistryService()
