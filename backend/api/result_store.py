"""
Persistência compartilhada dos resultados de prospecção.

Usa Redis quando disponível para suportar múltiplos workers e faz fallback
para arquivos JSON locais para não depender do navegador do usuário.
"""
from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha1
from pathlib import Path
from typing import Any, Optional

from config import settings

try:
    from redis import Redis
except ImportError:
    Redis = None  # type: ignore

logger = logging.getLogger(__name__)


def _as_float(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(number) or math.isinf(number):
        return 0.0
    return number


def _sanitize_json_value(value: Any) -> Any:
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, dict):
        return {str(key): _sanitize_json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_sanitize_json_value(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_json_value(item) for item in value]
    return value


def _org_filename(org_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", (org_id or "default").strip()).strip("-").lower()
    if not safe:
        safe = "default"
    digest = sha1((org_id or "default").encode("utf-8")).hexdigest()[:10]
    return f"{safe}-{digest}.json"


class ResultStore:
    def __init__(
        self,
        redis_url: Optional[str] = None,
        base_dir: Optional[str | Path] = None,
        history_limit: Optional[int] = None,
    ) -> None:
        self.history_limit = max(1, int(history_limit or settings.RESULT_HISTORY_LIMIT))
        self.base_dir = Path(base_dir or settings.RESULT_STORE_DIR)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.redis_client = None

        target_redis_url = settings.REDIS_URL if redis_url is None else redis_url
        if Redis is None or not target_redis_url:
            return

        try:
            client = Redis.from_url(target_redis_url, decode_responses=True)
            client.ping()
            self.redis_client = client
            logger.info("ResultStore usando Redis")
        except Exception as exc:
            logger.warning("ResultStore sem Redis; usando arquivos locais: %s", exc)

    def _default_state(self) -> dict[str, Any]:
        return {"latest": None, "history": []}

    def _file_path(self, org_id: str) -> Path:
        return self.base_dir / _org_filename(org_id)

    def _redis_key(self, kind: str, org_id: str) -> str:
        return f"hermes:results:{kind}:{org_id or 'default'}"

    def _read_file_state(self, org_id: str) -> dict[str, Any]:
        path = self._file_path(org_id)
        if not path.exists():
            return self._default_state()
        try:
            return _sanitize_json_value(json.loads(path.read_text(encoding="utf-8")))
        except Exception as exc:
            logger.warning("Falha ao ler result store local de %s: %s", org_id, exc)
            return self._default_state()

    def _write_file_state(self, org_id: str, state: dict[str, Any]) -> None:
        path = self._file_path(org_id)
        tmp_path = path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(_sanitize_json_value(state), ensure_ascii=False, default=str, allow_nan=False),
            encoding="utf-8",
        )
        tmp_path.replace(path)

    def _load_state(self, org_id: str) -> dict[str, Any]:
        if self.redis_client is not None:
            try:
                latest_raw = self.redis_client.get(self._redis_key("latest", org_id))
                history_raw = self.redis_client.get(self._redis_key("history", org_id))
                return {
                    "latest": _sanitize_json_value(json.loads(latest_raw)) if latest_raw else None,
                    "history": _sanitize_json_value(json.loads(history_raw)) if history_raw else [],
                }
            except Exception as exc:
                logger.warning("Falha ao ler result store no Redis para %s: %s", org_id, exc)
        return self._read_file_state(org_id)

    def _save_state(self, org_id: str, state: dict[str, Any]) -> None:
        normalized = _sanitize_json_value({
            "latest": state.get("latest"),
            "history": (state.get("history") or [])[: self.history_limit],
        })

        if self.redis_client is not None:
            try:
                pipe = self.redis_client.pipeline()
                pipe.set(
                    self._redis_key("latest", org_id),
                    json.dumps(normalized["latest"], ensure_ascii=False, default=str, allow_nan=False),
                )
                pipe.set(
                    self._redis_key("history", org_id),
                    json.dumps(normalized["history"], ensure_ascii=False, default=str, allow_nan=False),
                )
                pipe.execute()
            except Exception as exc:
                logger.warning("Falha ao salvar result store no Redis para %s: %s", org_id, exc)

        self._write_file_state(org_id, normalized)

    def _next_entry_id(self, history: list[dict[str, Any]]) -> str:
        current = int(time.time() * 1000)
        existing = {str(item.get("id", "")) for item in history}
        while str(current) in existing:
            current += 1
        return str(current)

    def _build_execucao(
        self,
        entry_id: str,
        timestamp: str,
        config: dict[str, Any],
        resultado: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "id": int(entry_id) if entry_id.isdigit() else 0,
            "timestamp": timestamp,
            "termo": config.get("termo_base") or config.get("termo") or "",
            "cidade": config.get("cidade") or "",
            "uf": config.get("uf") or "",
            "total_empresas": int(resultado.get("total_empresas") or len(resultado.get("empresas") or [])),
            "filtros_icp": resultado.get("filtros_icp") or {},
            "enriquecimento_web": resultado.get("enriquecimento_web") or {},
        }

    def _build_metricas(self, empresas: list[dict[str, Any]]) -> dict[str, Any]:
        total = len(empresas) or 1
        com_email = 0
        com_whatsapp = 0
        enriquecidas = 0
        soma_score = 0.0
        soma_capital = 0.0

        for empresa in empresas:
            if empresa.get("email") or empresa.get("email_enriquecido"):
                com_email += 1
            if empresa.get("whatsapp_publico") or empresa.get("whatsapp_enriquecido"):
                com_whatsapp += 1
            if empresa.get("site") or empresa.get("email_enriquecido") or empresa.get("whatsapp_enriquecido"):
                enriquecidas += 1
            soma_score += _as_float(empresa.get("score_icp"))
            soma_capital += _as_float(empresa.get("capital_social"))

        return {
            "score_medio": round(soma_score / total, 1),
            "taxa_email": round((com_email / total) * 100, 1),
            "taxa_whatsapp": round((com_whatsapp / total) * 100, 1),
            "capital_medio": soma_capital / total,
            "enriquecidas": enriquecidas,
        }

    def save_result(
        self,
        org_id: str,
        config: dict[str, Any],
        resultado: dict[str, Any],
        timestamp: Optional[str] = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_state(org_id)
            history = list(state.get("history") or [])
            entry_id = self._next_entry_id(history)
            effective_timestamp = timestamp or datetime.now(timezone.utc).isoformat()
            config_sanitized = _sanitize_json_value(deepcopy(config))
            resultado_sanitized = _sanitize_json_value(deepcopy(resultado))
            execucao = self._build_execucao(entry_id, effective_timestamp, config_sanitized, resultado_sanitized)
            latest_payload = {
                "timestamp": effective_timestamp,
                "config": config_sanitized,
                "resultado": resultado_sanitized,
                "execucao": execucao,
            }
            history_entry = {
                "id": entry_id,
                "timestamp": execucao["timestamp"],
                "config": config_sanitized,
                "resultado": {"total_empresas": execucao["total_empresas"]},
                "metricas": self._build_metricas(list(resultado_sanitized.get("empresas") or [])),
                "execucao": execucao,
            }
            state["latest"] = latest_payload
            state["history"] = [history_entry, *history][: self.history_limit]
            self._save_state(org_id, state)
            return latest_payload

    def get_latest_result(self, org_id: str) -> Optional[dict[str, Any]]:
        return self._load_state(org_id).get("latest")

    def get_latest_execution_payload(self, org_id: str) -> dict[str, Any]:
        latest = self.get_latest_result(org_id)
        if not latest:
            return {"execucao": None, "resultados": []}
        return {
            "execucao": latest.get("execucao"),
            "resultados": ((latest.get("resultado") or {}).get("empresas") or []),
        }

    def get_execucoes(self, org_id: str) -> list[dict[str, Any]]:
        state = self._load_state(org_id)
        history = list(state.get("history") or [])
        execucoes = [item.get("execucao") for item in history if item.get("execucao")]
        if execucoes:
            return execucoes

        latest = state.get("latest") or {}
        execucao = latest.get("execucao")
        return [execucao] if execucao else []

    def get_history(self, org_id: str) -> list[dict[str, Any]]:
        return list(self._load_state(org_id).get("history") or [])

    def rename_history_entry(self, org_id: str, entry_id: str, nome: str) -> bool:
        with self._lock:
            state = self._load_state(org_id)
            changed = False
            for item in state.get("history") or []:
                if str(item.get("id")) == entry_id:
                    item["nome"] = nome
                    changed = True
                    break
            if changed:
                self._save_state(org_id, state)
            return changed

    def delete_history_entry(self, org_id: str, entry_id: str) -> bool:
        with self._lock:
            state = self._load_state(org_id)
            history = list(state.get("history") or [])
            filtered = [item for item in history if str(item.get("id")) != entry_id]
            if len(filtered) == len(history):
                return False
            state["history"] = filtered
            self._save_state(org_id, state)
            return True


result_store = ResultStore()
