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


def _json_loads(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _normalize_saved_search_kind(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"dynamic", "dynamic_list", "dynamic-list", "lista_dinamica", "lista dinamica"}:
        return "dynamic"
    return "search"


def _normalize_watch_snapshot(snapshot: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    data = snapshot or {}

    def as_bool(key: str) -> bool:
        return bool(data.get(key))

    def as_int(key: str) -> int:
        try:
            return max(0, int(float(data.get(key) or 0)))
        except (TypeError, ValueError):
            return 0

    def as_str(key: str) -> Optional[str]:
        text = str(data.get(key) or "").strip()
        return text or None

    return {
        "has_site": as_bool("has_site"),
        "has_email": as_bool("has_email"),
        "has_phone": as_bool("has_phone"),
        "has_whatsapp": as_bool("has_whatsapp"),
        "has_whatsapp_validated": as_bool("has_whatsapp_validated"),
        "has_linkedin_company": as_bool("has_linkedin_company"),
        "decision_makers": as_int("decision_makers"),
        "total_contact_emails": as_int("total_contact_emails"),
        "deliverable_emails": as_int("deliverable_emails"),
        "public_email_count": as_int("public_email_count"),
        "generic_inbox_count": as_int("generic_inbox_count"),
        "whatsapp_candidates": as_int("whatsapp_candidates"),
        "validated_whatsapp_candidates": as_int("validated_whatsapp_candidates"),
        "email_pattern": as_str("email_pattern"),
    }


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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_searches (
                    id VARCHAR PRIMARY KEY,
                    org_id VARCHAR NOT NULL,
                    kind VARCHAR NOT NULL,
                    name VARCHAR NOT NULL,
                    description VARCHAR,
                    query_json VARCHAR NOT NULL,
                    source VARCHAR,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL,
                    last_run_at TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS company_watchlist (
                    id VARCHAR PRIMARY KEY,
                    org_id VARCHAR NOT NULL,
                    cnpj VARCHAR NOT NULL,
                    razao_social VARCHAR,
                    nome_fantasia VARCHAR,
                    cidade VARCHAR,
                    uf VARCHAR,
                    reason VARCHAR,
                    source VARCHAR,
                    snapshot_json VARCHAR,
                    created_at TIMESTAMP NOT NULL,
                    updated_at TIMESTAMP NOT NULL,
                    last_signal_at TIMESTAMP,
                    last_refresh_at TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS company_signals (
                    id VARCHAR PRIMARY KEY,
                    org_id VARCHAR NOT NULL,
                    watch_id VARCHAR,
                    cnpj VARCHAR NOT NULL,
                    signal_type VARCHAR NOT NULL,
                    title VARCHAR NOT NULL,
                    payload_json VARCHAR,
                    created_at TIMESTAMP NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_lead_lists_org ON lead_lists(org_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_lead_list_items_org_list ON lead_list_items(org_id, list_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_suppressions_org ON lead_suppressions(org_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_saved_searches_org_kind ON saved_searches(org_id, kind)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_watchlist_org_cnpj ON company_watchlist(org_id, cnpj)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_company_signals_org_cnpj_created ON company_signals(org_id, cnpj, created_at)")
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

    def list_saved_searches(self, org_id: str, kind: Optional[str] = None) -> List[Dict[str, Any]]:
        self.ensure_schema()
        params: List[Any] = [org_id]
        sql = """
            SELECT
                id,
                kind,
                name,
                description,
                query_json,
                source,
                created_at,
                updated_at,
                last_run_at
            FROM saved_searches
            WHERE org_id = ?
        """
        if kind:
            sql += " AND kind = ?"
            params.append(_normalize_saved_search_kind(kind))
        sql += " ORDER BY COALESCE(last_run_at, updated_at) DESC, name ASC"

        with get_connection(read_only=True) as conn:
            rows = conn.execute(sql, params).fetchall()

        return [
            {
                "id": str(row[0]),
                "kind": _normalize_saved_search_kind(row[1]),
                "name": str(row[2]),
                "description": str(row[3]) if row[3] else None,
                "config": _json_loads(row[4], {}),
                "source": str(row[5]) if row[5] else None,
                "created_at": row[6].isoformat() if row[6] else None,
                "updated_at": row[7].isoformat() if row[7] else None,
                "last_run_at": row[8].isoformat() if row[8] else None,
            }
            for row in rows
        ]

    def get_saved_search(self, org_id: str, search_id: str) -> Optional[Dict[str, Any]]:
        self.ensure_schema()
        with get_connection(read_only=True) as conn:
            row = conn.execute(
                """
                SELECT
                    id,
                    kind,
                    name,
                    description,
                    query_json,
                    source,
                    created_at,
                    updated_at,
                    last_run_at
                FROM saved_searches
                WHERE org_id = ? AND id = ?
                LIMIT 1
                """,
                [org_id, search_id],
            ).fetchone()

        if not row:
            return None

        return {
            "id": str(row[0]),
            "kind": _normalize_saved_search_kind(row[1]),
            "name": str(row[2]),
            "description": str(row[3]) if row[3] else None,
            "config": _json_loads(row[4], {}),
            "source": str(row[5]) if row[5] else None,
            "created_at": row[6].isoformat() if row[6] else None,
            "updated_at": row[7].isoformat() if row[7] else None,
            "last_run_at": row[8].isoformat() if row[8] else None,
        }

    def create_saved_search(
        self,
        org_id: str,
        *,
        name: str,
        description: Optional[str],
        config: Dict[str, Any],
        kind: str = "search",
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.ensure_schema()
        name_clean = str(name or "").strip()
        if not name_clean:
            raise ValueError("Informe um nome para a busca salva.")

        config_clean = _sanitize_jsonish(config or {})
        kind_clean = _normalize_saved_search_kind(kind)
        source_clean = str(source or "query_workbench").strip() or "query_workbench"
        now = _utcnow_iso()
        search_id = str(uuid4())

        with get_connection(read_only=False) as conn:
            conn.execute(
                """
                INSERT INTO saved_searches (
                    id,
                    org_id,
                    kind,
                    name,
                    description,
                    query_json,
                    source,
                    created_at,
                    updated_at,
                    last_run_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    search_id,
                    org_id,
                    kind_clean,
                    name_clean,
                    (description or "").strip() or None,
                    _json_dumps(config_clean),
                    source_clean,
                    now,
                    now,
                    None,
                ],
            )

        return {
            "id": search_id,
            "kind": kind_clean,
            "name": name_clean,
            "description": (description or "").strip() or None,
            "config": config_clean,
            "source": source_clean,
            "created_at": now,
            "updated_at": now,
            "last_run_at": None,
        }

    def update_saved_search(
        self,
        org_id: str,
        search_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        kind: Optional[str] = None,
        source: Optional[str] = None,
        last_run_at: Optional[str] = None,
    ) -> bool:
        self.ensure_schema()
        assignments: List[str] = []
        params: List[Any] = []

        if name is not None:
            name_clean = str(name).strip()
            if not name_clean:
                raise ValueError("Informe um nome para a busca salva.")
            assignments.append("name = ?")
            params.append(name_clean)

        if description is not None:
            assignments.append("description = ?")
            params.append(str(description).strip() or None)

        if config is not None:
            assignments.append("query_json = ?")
            params.append(_json_dumps(_sanitize_jsonish(config or {})))

        if kind is not None:
            assignments.append("kind = ?")
            params.append(_normalize_saved_search_kind(kind))

        if source is not None:
            assignments.append("source = ?")
            params.append(str(source).strip() or None)

        if last_run_at is not None:
            assignments.append("last_run_at = ?")
            params.append(last_run_at)

        if not assignments:
            return False

        assignments.append("updated_at = ?")
        params.append(_utcnow_iso())
        params.extend([org_id, search_id])

        with get_connection(read_only=False) as conn:
            existing = conn.execute(
                "SELECT 1 FROM saved_searches WHERE org_id = ? AND id = ? LIMIT 1",
                [org_id, search_id],
            ).fetchone()
            if not existing:
                return False
            conn.execute(
                f"UPDATE saved_searches SET {', '.join(assignments)} WHERE org_id = ? AND id = ?",
                params,
            )
        return True

    def touch_saved_search_run(self, org_id: str, search_id: str) -> bool:
        return self.update_saved_search(org_id, search_id, last_run_at=_utcnow_iso())

    def delete_saved_search(self, org_id: str, search_id: str) -> bool:
        self.ensure_schema()
        with get_connection(read_only=False) as conn:
            existing = conn.execute(
                "SELECT 1 FROM saved_searches WHERE org_id = ? AND id = ? LIMIT 1",
                [org_id, search_id],
            ).fetchone()
            if not existing:
                return False
            conn.execute(
                "DELETE FROM saved_searches WHERE org_id = ? AND id = ?",
                [org_id, search_id],
            )
        return True

    def list_watchlist(self, org_id: str) -> List[Dict[str, Any]]:
        self.ensure_schema()
        with get_connection(read_only=True) as conn:
            rows = conn.execute(
                """
                SELECT
                    w.id,
                    w.cnpj,
                    w.razao_social,
                    w.nome_fantasia,
                    w.cidade,
                    w.uf,
                    w.reason,
                    w.source,
                    w.snapshot_json,
                    w.created_at,
                    w.updated_at,
                    w.last_signal_at,
                    w.last_refresh_at,
                    COALESCE(s.signal_count, 0) AS signal_count,
                    s.last_signal_event_at
                FROM company_watchlist w
                LEFT JOIN (
                    SELECT
                        org_id,
                        cnpj,
                        COUNT(*) AS signal_count,
                        MAX(created_at) AS last_signal_event_at
                    FROM company_signals
                    GROUP BY org_id, cnpj
                ) s
                  ON s.org_id = w.org_id
                 AND s.cnpj = w.cnpj
                WHERE w.org_id = ?
                ORDER BY COALESCE(w.last_signal_at, w.updated_at) DESC, w.razao_social ASC
                """,
                [org_id],
            ).fetchall()

        return [
            {
                "id": str(row[0]),
                "cnpj": str(row[1]),
                "razao_social": str(row[2]) if row[2] else None,
                "nome_fantasia": str(row[3]) if row[3] else None,
                "cidade": str(row[4]) if row[4] else None,
                "uf": str(row[5]) if row[5] else None,
                "reason": str(row[6]) if row[6] else None,
                "source": str(row[7]) if row[7] else None,
                "snapshot": _json_loads(row[8], {}),
                "created_at": row[9].isoformat() if row[9] else None,
                "updated_at": row[10].isoformat() if row[10] else None,
                "last_signal_at": row[11].isoformat() if row[11] else None,
                "last_refresh_at": row[12].isoformat() if row[12] else None,
                "signal_count": int(row[13] or 0),
                "last_signal_event_at": row[14].isoformat() if row[14] else None,
            }
            for row in rows
        ]

    def get_watch_company(self, org_id: str, cnpj: str) -> Optional[Dict[str, Any]]:
        cnpj_clean = _normalize_cnpj(cnpj)
        if not cnpj_clean:
            return None

        items = [item for item in self.list_watchlist(org_id) if item["cnpj"] == cnpj_clean]
        return items[0] if items else None

    def upsert_watch_company(
        self,
        org_id: str,
        company: Dict[str, Any],
        *,
        reason: Optional[str] = None,
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.ensure_schema()
        cnpj = _normalize_cnpj((company or {}).get("cnpj"))
        if not cnpj:
            raise ValueError("Informe um CNPJ valido para seguir a empresa.")

        reason_clean = str(reason or "").strip() or None
        source_clean = str(source or "manual").strip() or "manual"
        now = _utcnow_iso()

        with get_connection(read_only=False) as conn:
            existing = conn.execute(
                """
                SELECT id, snapshot_json, reason, source, created_at, last_signal_at, last_refresh_at
                FROM company_watchlist
                WHERE org_id = ? AND cnpj = ?
                LIMIT 1
                """,
                [org_id, cnpj],
            ).fetchone()

            if existing:
                conn.execute(
                    """
                    UPDATE company_watchlist
                    SET razao_social = ?,
                        nome_fantasia = ?,
                        cidade = ?,
                        uf = ?,
                        reason = ?,
                        source = ?,
                        updated_at = ?
                    WHERE org_id = ? AND cnpj = ?
                    """,
                    [
                        (company or {}).get("razao_social"),
                        (company or {}).get("nome_fantasia"),
                        (company or {}).get("cidade"),
                        (company or {}).get("uf"),
                        reason_clean or (str(existing[2]) if existing[2] else None),
                        source_clean or (str(existing[3]) if existing[3] else None),
                        now,
                        org_id,
                        cnpj,
                    ],
                )
            else:
                conn.execute(
                    """
                    INSERT INTO company_watchlist (
                        id,
                        org_id,
                        cnpj,
                        razao_social,
                        nome_fantasia,
                        cidade,
                        uf,
                        reason,
                        source,
                        snapshot_json,
                        created_at,
                        updated_at,
                        last_signal_at,
                        last_refresh_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        str(uuid4()),
                        org_id,
                        cnpj,
                        (company or {}).get("razao_social"),
                        (company or {}).get("nome_fantasia"),
                        (company or {}).get("cidade"),
                        (company or {}).get("uf"),
                        reason_clean,
                        source_clean,
                        _json_dumps({}),
                        now,
                        now,
                        None,
                        None,
                    ],
                )

        return self.get_watch_company(org_id, cnpj) or {}

    def sync_watch_snapshot(
        self,
        org_id: str,
        cnpj: str,
        snapshot: Dict[str, Any],
        *,
        company: Optional[Dict[str, Any]] = None,
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.ensure_schema()
        cnpj_clean = _normalize_cnpj(cnpj)
        if not cnpj_clean:
            raise ValueError("Informe um CNPJ valido para atualizar a watchlist.")

        current_snapshot = _normalize_watch_snapshot(snapshot)
        now = _utcnow_iso()
        source_clean = str(source or "system").strip() or "system"

        if company is not None:
            self.upsert_watch_company(org_id, company, source=source_clean)

        with get_connection(read_only=False) as conn:
            row = conn.execute(
                """
                SELECT id, snapshot_json, last_signal_at
                FROM company_watchlist
                WHERE org_id = ? AND cnpj = ?
                LIMIT 1
                """,
                [org_id, cnpj_clean],
            ).fetchone()
            if not row:
                raise LookupError("Empresa nao esta sendo acompanhada.")

            watch_id = str(row[0])
            previous_snapshot = _normalize_watch_snapshot(_json_loads(row[1], {}))
            previous_last_signal_at = row[2].isoformat() if row[2] else None
            signals = self._derive_signals(cnpj_clean, previous_snapshot, current_snapshot)

            for signal in signals:
                conn.execute(
                    """
                    INSERT INTO company_signals (
                        id,
                        org_id,
                        watch_id,
                        cnpj,
                        signal_type,
                        title,
                        payload_json,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        str(uuid4()),
                        org_id,
                        watch_id,
                        cnpj_clean,
                        signal["signal_type"],
                        signal["title"],
                        _json_dumps(signal.get("payload") or {}),
                        now,
                    ],
                )

            conn.execute(
                """
                UPDATE company_watchlist
                SET snapshot_json = ?,
                    updated_at = ?,
                    last_refresh_at = ?,
                    last_signal_at = ?
                WHERE org_id = ? AND cnpj = ?
                """,
                [
                    _json_dumps(current_snapshot),
                    now,
                    now,
                    now if signals else previous_last_signal_at,
                    org_id,
                    cnpj_clean,
                ],
            )

        return {
            "watch": self.get_watch_company(org_id, cnpj_clean),
            "signals": signals,
        }

    def _derive_signals(
        self,
        cnpj: str,
        previous: Dict[str, Any],
        current: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        signals: List[Dict[str, Any]] = []
        previous = _normalize_watch_snapshot(previous)
        current = _normalize_watch_snapshot(current)
        is_first_snapshot = not any(previous.values())

        if is_first_snapshot:
            signals.append(
                {
                    "cnpj": cnpj,
                    "signal_type": "watch_started",
                    "title": "Empresa entrou na watchlist",
                    "payload": {"snapshot": current},
                }
            )

        for key, signal_type, title in [
            ("has_site", "site_detected", "Site comercial detectado"),
            ("has_email", "email_detected", "Email comercial detectado"),
            ("has_phone", "phone_detected", "Telefone comercial detectado"),
            ("has_whatsapp", "whatsapp_detected", "WhatsApp comercial detectado"),
            ("has_whatsapp_validated", "whatsapp_validated", "WhatsApp validado"),
            ("has_linkedin_company", "linkedin_company_detected", "LinkedIn corporativo detectado"),
        ]:
            if current.get(key) and not previous.get(key):
                signals.append(
                    {
                        "cnpj": cnpj,
                        "signal_type": signal_type,
                        "title": title,
                        "payload": {"from": previous.get(key), "to": current.get(key)},
                    }
                )

        for key, signal_type, title in [
            ("decision_makers", "decision_makers_increased", "Mais decisores resolvidos"),
            ("deliverable_emails", "deliverable_emails_increased", "Mais emails deliverable"),
            ("total_contact_emails", "contact_emails_increased", "Mais emails de contato"),
            ("public_email_count", "public_emails_increased", "Mais emails publicos encontrados"),
            ("validated_whatsapp_candidates", "validated_whatsapp_candidates_increased", "Mais WhatsApps validados"),
            ("whatsapp_candidates", "whatsapp_candidates_increased", "Mais candidatos de WhatsApp"),
        ]:
            prev_value = int(previous.get(key) or 0)
            curr_value = int(current.get(key) or 0)
            if curr_value > prev_value:
                signals.append(
                    {
                        "cnpj": cnpj,
                        "signal_type": signal_type,
                        "title": title,
                        "payload": {"from": prev_value, "to": curr_value, "delta": curr_value - prev_value},
                    }
                )

        prev_pattern = str(previous.get("email_pattern") or "").strip()
        curr_pattern = str(current.get("email_pattern") or "").strip()
        if curr_pattern and curr_pattern != prev_pattern:
            signals.append(
                {
                    "cnpj": cnpj,
                    "signal_type": "email_pattern_resolved",
                    "title": "Padrao de email corporativo atualizado",
                    "payload": {"from": prev_pattern or None, "to": curr_pattern},
                }
            )

        return signals

    def list_company_signals(self, org_id: str, cnpj: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        self.ensure_schema()
        params: List[Any] = [org_id]
        sql = """
            SELECT
                id,
                watch_id,
                cnpj,
                signal_type,
                title,
                payload_json,
                created_at
            FROM company_signals
            WHERE org_id = ?
        """
        cnpj_clean = _normalize_cnpj(cnpj)
        if cnpj_clean:
            sql += " AND cnpj = ?"
            params.append(cnpj_clean)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(max(1, min(int(limit or 100), 500)))

        with get_connection(read_only=True) as conn:
            rows = conn.execute(sql, params).fetchall()

        return [
            {
                "id": str(row[0]),
                "watch_id": str(row[1]) if row[1] else None,
                "cnpj": str(row[2]),
                "signal_type": str(row[3]),
                "title": str(row[4]),
                "payload": _json_loads(row[5], {}),
                "created_at": row[6].isoformat() if row[6] else None,
            }
            for row in rows
        ]

    def delete_watch_company(self, org_id: str, cnpj: str) -> bool:
        self.ensure_schema()
        cnpj_clean = _normalize_cnpj(cnpj)
        if not cnpj_clean:
            return False

        with get_connection(read_only=False) as conn:
            row = conn.execute(
                "SELECT id FROM company_watchlist WHERE org_id = ? AND cnpj = ? LIMIT 1",
                [org_id, cnpj_clean],
            ).fetchone()
            if not row:
                return False
            watch_id = str(row[0])
            conn.execute(
                "DELETE FROM company_signals WHERE org_id = ? AND (watch_id = ? OR cnpj = ?)",
                [org_id, watch_id, cnpj_clean],
            )
            conn.execute(
                "DELETE FROM company_watchlist WHERE org_id = ? AND cnpj = ?",
                [org_id, cnpj_clean],
            )
        return True


lead_registry_service = LeadRegistryService()
