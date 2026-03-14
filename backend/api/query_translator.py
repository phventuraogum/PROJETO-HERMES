from __future__ import annotations

import json
import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional

from config import settings

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None  # type: ignore


logger = logging.getLogger(__name__)

ALL_UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
]

STATE_NAME_TO_UF = {
    "acre": "AC",
    "alagoas": "AL",
    "amapa": "AP",
    "amazonas": "AM",
    "bahia": "BA",
    "ceara": "CE",
    "distrito federal": "DF",
    "espirito santo": "ES",
    "goias": "GO",
    "maranhao": "MA",
    "mato grosso": "MT",
    "mato grosso do sul": "MS",
    "minas gerais": "MG",
    "para": "PA",
    "paraiba": "PB",
    "parana": "PR",
    "pernambuco": "PE",
    "piaui": "PI",
    "rio de janeiro": "RJ",
    "rio grande do norte": "RN",
    "rio grande do sul": "RS",
    "rondonia": "RO",
    "roraima": "RR",
    "santa catarina": "SC",
    "sao paulo": "SP",
    "sergipe": "SE",
    "tocantins": "TO",
}

SEGMENT_HINTS = {
    "clinica": "Clinicas",
    "clinicas": "Clinicas",
    "hospital": "Hospitais",
    "hospitais": "Hospitais",
    "laboratorio": "Laboratorios",
    "laboratorios": "Laboratorios",
    "farmacia": "Farmacias",
    "farmacias": "Farmacias",
    "supermercado": "Supermercados",
    "supermercados": "Supermercados",
    "transportadora": "Logistica",
    "transportadoras": "Logistica",
    "logistica": "Logistica",
    "industria": "Industria",
    "industrias": "Industria",
    "administradora de condominios": "Servicos",
    "administradoras de condominios": "Servicos",
    "imobiliaria": "Servicos",
    "imobiliarias": "Servicos",
}

PORTE_HINTS = {
    "me": "ME",
    "microempresa": "ME",
    "micro empresas": "ME",
    "microempresa": "ME",
    "epp": "EPP",
    "pequena empresa": "EPP",
    "pequenas empresas": "EPP",
    "medio": "Medio/Grande",
    "media empresa": "Medio/Grande",
    "medias empresas": "Medio/Grande",
    "medio porte": "Medio/Grande",
    "grande": "Grande",
    "grandes empresas": "Grande",
}


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def _normalize_query(value: str) -> str:
    lowered = _strip_accents(str(value or "").lower())
    return re.sub(r"\s+", " ", lowered).strip()


def _title_case_words(value: str) -> str:
    words = [part for part in re.split(r"\s+", value.strip()) if part]
    return " ".join(word.capitalize() for word in words)


def _default_front_config() -> Dict[str, Any]:
    return {
        "termo_base": "",
        "cidade": "",
        "uf": "",
        "cidades": [],
        "ufs": [],
        "capital_minimo": 0,
        "capital_maximo": None,
        "limite_empresas": 50,
        "portes": [],
        "segmentos": [],
        "cnaes": [],
        "incluir_cnae_secundario": False,
        "enriquecimento_web": True,
        "exigir_contato_acionavel": False,
        "priorizar_com_contato": True,
        "excluir_cnpjs": [],
        "idade_minima_anos": None,
        "idade_maxima_anos": None,
    }


def _unique_upper(values: List[str]) -> List[str]:
    seen: set[str] = set()
    output: List[str] = []
    for value in values:
        cleaned = str(value or "").strip().upper()
        if len(cleaned) != 2 or cleaned not in ALL_UFS or cleaned in seen:
            continue
        seen.add(cleaned)
        output.append(cleaned)
    return output


def _unique_clean(values: List[str]) -> List[str]:
    seen: set[str] = set()
    output: List[str] = []
    for value in values:
        cleaned = str(value or "").strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(cleaned)
    return output


def _normalize_front_config(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    base = _default_front_config()
    incoming = raw or {}

    cidades = incoming.get("cidades") or ([incoming.get("cidade")] if incoming.get("cidade") else [])
    ufs = incoming.get("ufs") or ([incoming.get("uf")] if incoming.get("uf") else [])
    cnaes = incoming.get("cnaes") or []
    portes = incoming.get("portes") or []
    segmentos = incoming.get("segmentos") or []
    excluir = incoming.get("excluir_cnpjs") or []

    base.update(
        {
            "termo_base": str(incoming.get("termo_base") or base["termo_base"]).strip(),
            "cidade": str(incoming.get("cidade") or "").strip(),
            "uf": str(incoming.get("uf") or "").strip().upper(),
            "cidades": _unique_clean([_title_case_words(str(item)) for item in cidades if str(item or "").strip()]),
            "ufs": _unique_upper([str(item) for item in ufs]),
            "capital_minimo": int(float(incoming.get("capital_minimo") or 0)),
            "capital_maximo": (
                int(float(incoming.get("capital_maximo")))
                if incoming.get("capital_maximo") not in (None, "", 0)
                else None
            ),
            "limite_empresas": max(1, min(int(float(incoming.get("limite_empresas") or 50)), 1000)),
            "portes": _unique_clean([str(item) for item in portes]),
            "segmentos": _unique_clean([str(item) for item in segmentos]),
            "cnaes": _unique_clean([re.sub(r"\D", "", str(item)) for item in cnaes]),
            "incluir_cnae_secundario": bool(incoming.get("incluir_cnae_secundario")),
            "enriquecimento_web": bool(incoming.get("enriquecimento_web", True)),
            "exigir_contato_acionavel": bool(incoming.get("exigir_contato_acionavel")),
            "priorizar_com_contato": bool(incoming.get("priorizar_com_contato", True)),
            "excluir_cnpjs": _unique_clean([re.sub(r"\D", "", str(item)) for item in excluir]),
            "idade_minima_anos": (
                int(float(incoming.get("idade_minima_anos")))
                if incoming.get("idade_minima_anos") not in (None, "")
                else None
            ),
            "idade_maxima_anos": (
                int(float(incoming.get("idade_maxima_anos")))
                if incoming.get("idade_maxima_anos") not in (None, "")
                else None
            ),
        }
    )

    if base["cidades"] and not base["cidade"]:
        base["cidade"] = base["cidades"][0]
    if base["ufs"] and not base["uf"]:
        base["uf"] = base["ufs"][0]

    return base


def _merge_front_configs(base: Dict[str, Any], patch: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = _normalize_front_config(base)
    if not patch:
        return merged

    for key, value in patch.items():
        if value in (None, "", []):
            continue
        if key in {"cidades", "segmentos", "portes", "excluir_cnpjs"}:
            merged[key] = _unique_clean(list(merged.get(key) or []) + list(value or []))
        elif key == "ufs":
            merged[key] = _unique_upper(list(merged.get(key) or []) + list(value or []))
        elif key == "cnaes":
            merged[key] = _unique_clean(list(merged.get(key) or []) + [re.sub(r"\D", "", str(item)) for item in value or []])
        else:
            merged[key] = value

    if merged["cidades"]:
        merged["cidade"] = merged["cidades"][0]
    if merged["ufs"]:
        merged["uf"] = merged["ufs"][0]
    return _normalize_front_config(merged)


def _parse_numeric_value(token: str) -> Optional[int]:
    raw = _normalize_query(token)
    if not raw:
        return None
    multiplier = 1
    if "bilh" in raw:
        multiplier = 1_000_000_000
    elif re.search(r"\bmi\b", raw) or "milhao" in raw or "milhoes" in raw:
        multiplier = 1_000_000
    elif "mil" in raw:
        multiplier = 1_000

    numeric = re.sub(r"[^0-9,\.]", "", raw)
    if not numeric:
        return None

    if "," in numeric and "." in numeric:
        numeric = numeric.replace(".", "").replace(",", ".")
    elif "," in numeric:
        numeric = numeric.replace(",", ".")

    try:
        return int(float(numeric) * multiplier)
    except ValueError:
        return None


def _extract_city(normalized_query: str) -> Optional[str]:
    patterns = [
        r"(?:na cidade de|cidade de)\s+([a-z ]{3,})(?=\s+(?:com|para|cnae|capital|whatsapp|email|telefone|limite|top)\b|$)",
        r"\bem\s+([a-z ]{3,})(?:\s*[/,-]\s*(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to))(?=\s|$)",
        r"\bem\s+([a-z ]{3,})(?=\s+(?:com|para|cnae|capital|whatsapp|email|telefone|limite|top)\b|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized_query)
        if not match:
            continue
        value = match.group(1).strip()
        if value in STATE_NAME_TO_UF:
            continue
        return _title_case_words(value)
    return None


def _extract_termo_base(query: str) -> str:
    normalized = _normalize_query(query)
    cleaned = normalized
    removal_patterns = [
        r"\bcnae[s]?\s*[:=]?\s*[\d,\-\/\s]+",
        r"\b(?:brasil inteiro|todo o brasil|nacional(?:mente)?)\b",
        r"\b(?:com|sem)\s+enriquecimento\b",
        r"\b(?:com|somente com)\s+(?:whatsapp|email|telefone|contato(?: acionavel)?)\b",
        r"\b(?:capital|faturamento)\s+(?:entre|acima de|maior que|a partir de|minimo de|ate|até|abaixo de|menor que|maximo de)\s+[a-z0-9\$,\.\s]+",
        r"\b(?:limite|top)\s+\d+\b",
        r"\b\d+\s+(?:leads|empresas|resultados|contatos)\b",
        r"\b(?:na cidade de|cidade de)\s+[a-z ]+",
        r"\bem\s+[a-z ]+(?:\s*[/,-]\s*(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to))?",
    ]
    for pattern in removal_patterns:
        cleaned = re.sub(pattern, " ", cleaned)

    for state_name in STATE_NAME_TO_UF:
        cleaned = re.sub(rf"\b{re.escape(state_name)}\b", " ", cleaned)
    for uf in ALL_UFS:
        cleaned = re.sub(rf"\b{uf.lower()}\b", " ", cleaned)

    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.;:-")
    return cleaned or query.strip()


def _heuristic_parse(query: str) -> Dict[str, Any]:
    normalized = _normalize_query(query)
    config: Dict[str, Any] = {
        "termo_base": _extract_termo_base(query),
        "cidades": [],
        "ufs": [],
        "portes": [],
        "segmentos": [],
        "cnaes": [],
    }
    highlights: List[str] = []

    cnaes = []
    for match in re.findall(r"\b\d{4}-?\d\/?\d{2}\b|\b\d{7}\b", query):
        digits = re.sub(r"\D", "", match)
        if len(digits) == 7:
            cnaes.append(digits)
    if cnaes:
        config["cnaes"] = _unique_clean(cnaes)
        highlights.append(f"{len(config['cnaes'])} CNAE(s)")

    if any(term in normalized for term in ("brasil inteiro", "todo o brasil", "nacional", "nacionalmente")):
        config["ufs"] = list(ALL_UFS)
        highlights.append("Brasil inteiro")
    else:
        found_ufs: List[str] = []
        for state_name, uf in STATE_NAME_TO_UF.items():
            if re.search(rf"\b{re.escape(state_name)}\b", normalized):
                found_ufs.append(uf)
        for uf in ALL_UFS:
            if re.search(rf"\b{uf.lower()}\b", normalized):
                found_ufs.append(uf)
        config["ufs"] = _unique_upper(found_ufs)
        if config["ufs"]:
            highlights.append(", ".join(config["ufs"]))

    cidade = _extract_city(normalized)
    if cidade:
        config["cidades"] = [cidade]
        highlights.append(cidade)

    between_match = re.search(
        r"\b(?:capital|faturamento)\s+(?:entre)\s+([a-z0-9\$,\.\s]+?)\s+(?:e|a)\s+([a-z0-9\$,\.\s]+?)(?=\s+(?:com|para|cnae|whatsapp|email|telefone|limite|top)\b|$)",
        normalized,
    )
    if between_match:
        minimum = _parse_numeric_value(between_match.group(1))
        maximum = _parse_numeric_value(between_match.group(2))
        if minimum is not None:
            config["capital_minimo"] = minimum
        if maximum is not None:
            config["capital_maximo"] = maximum
        if minimum is not None or maximum is not None:
            highlights.append("faixa de capital")
    else:
        min_match = re.search(
            r"\b(?:capital|faturamento)?\s*(?:acima de|maior que|a partir de|minimo de)\s+([a-z0-9\$,\.\s]+?)(?=\s+(?:com|para|cnae|whatsapp|email|telefone|limite|top)\b|$)",
            normalized,
        )
        max_match = re.search(
            r"\b(?:capital|faturamento)?\s*(?:ate|até|abaixo de|menor que|maximo de)\s+([a-z0-9\$,\.\s]+?)(?=\s+(?:com|para|cnae|whatsapp|email|telefone|limite|top)\b|$)",
            normalized,
        )
        minimum = _parse_numeric_value(min_match.group(1)) if min_match else None
        maximum = _parse_numeric_value(max_match.group(1)) if max_match else None
        if minimum is not None:
            config["capital_minimo"] = minimum
            highlights.append("capital minimo")
        if maximum is not None:
            config["capital_maximo"] = maximum
            highlights.append("capital maximo")

    limit_matches = re.findall(r"\b(\d{1,4})\s*(?:leads|empresas|resultados|contatos)\b", normalized)
    if not limit_matches:
        limit_match = re.search(r"\b(?:limite|top)\s+(\d{1,4})\b", normalized)
        if limit_match:
            limit_matches = [limit_match.group(1)]
    if limit_matches:
        config["limite_empresas"] = max(1, min(int(limit_matches[0]), 1000))
        highlights.append(f"{config['limite_empresas']} leads")

    lower_ports = normalized
    detected_portes: List[str] = []
    for hint, porte in PORTE_HINTS.items():
        if re.search(rf"\b{re.escape(hint)}\b", lower_ports):
            detected_portes.append(porte)
    if detected_portes:
        config["portes"] = _unique_clean(detected_portes)

    detected_segmentos: List[str] = []
    for hint, segmento in SEGMENT_HINTS.items():
        if hint in normalized:
            detected_segmentos.append(segmento)
    if detected_segmentos:
        config["segmentos"] = _unique_clean(detected_segmentos)

    if "sem enriquecimento" in normalized or "modo rapido" in normalized or "modo rapido" in normalized:
        config["enriquecimento_web"] = False
        highlights.append("sem enriquecimento web")
    elif "com enriquecimento" in normalized or "enriquecimento web" in normalized:
        config["enriquecimento_web"] = True

    if any(term in normalized for term in ("com whatsapp", "whatsapp valido", "contato acionavel", "somente com contato", "com contato valido")):
        config["exigir_contato_acionavel"] = True
        config["priorizar_com_contato"] = True
        highlights.append("contato acionavel")
    elif "nao priorizar contato" in normalized or "sem priorizar contato" in normalized:
        config["priorizar_com_contato"] = False

    if config["cidades"]:
        config["cidade"] = config["cidades"][0]
    if config["ufs"]:
        config["uf"] = config["ufs"][0]
    config["highlights"] = highlights
    return config


class QueryTranslatorService:
    def __init__(self) -> None:
        api_key = settings.OPENAI_API_KEY or settings.OPENROUTER_API_KEY
        self.use_openrouter = bool(settings.OPENROUTER_API_KEY and not settings.OPENAI_API_KEY)
        self.model = "openai/gpt-4o-mini" if self.use_openrouter else "gpt-4o-mini"
        self.client = None
        if api_key and AsyncOpenAI is not None:
            kwargs: Dict[str, Any] = {"api_key": api_key}
            if self.use_openrouter:
                kwargs["base_url"] = "https://openrouter.ai/api/v1"
            try:
                self.client = AsyncOpenAI(**kwargs)
            except Exception as exc:
                logger.warning("Falha ao inicializar cliente de query translator IA: %s", exc)
                self.client = None

    async def _translate_with_ai(
        self,
        query: str,
        defaults: Dict[str, Any],
        heuristic: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        if self.client is None:
            return None

        prompt = (
            "Converta a query de prospeccao abaixo para um JSON estrito com os campos: "
            "termo_base, cidades, ufs, capital_minimo, capital_maximo, limite_empresas, "
            "portes, segmentos, cnaes, enriquecimento_web, exigir_contato_acionavel, "
            "priorizar_com_contato, incluir_cnae_secundario, idade_minima_anos, idade_maxima_anos. "
            "Use apenas valores coerentes para prospeccao B2B no Brasil. "
            "Se um campo nao estiver claro, preserve o valor atual dos defaults. "
            "Nunca invente CNPJs. Para 'Brasil inteiro', retorne todas as UFs em ufs. "
            "Responda apenas JSON valido.\n\n"
            f"Query do usuario: {query}\n"
            f"Defaults atuais: {json.dumps(defaults, ensure_ascii=False)}\n"
            f"Heuristica local: {json.dumps({k: v for k, v in heuristic.items() if k != 'highlights'}, ensure_ascii=False)}"
        )

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": "Voce traduz instrucoes comerciais em filtros estruturados de prospeccao. Responda somente JSON valido.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=700,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or "{}"
        return json.loads(content)

    async def translate_query(
        self,
        query: str,
        defaults: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        prompt = str(query or "").strip()
        if not prompt:
            raise ValueError("Informe uma query para traduzir.")

        normalized_defaults = _normalize_front_config(defaults)
        heuristic = _heuristic_parse(prompt)
        config = _merge_front_configs(normalized_defaults, heuristic)
        source = "heuristic"
        warnings: List[str] = []

        try:
            ai_result = await self._translate_with_ai(prompt, normalized_defaults, heuristic)
        except Exception as exc:
            logger.info("Falha ao traduzir query com IA, usando heuristica: %s", exc)
            ai_result = None
            warnings.append("IA indisponivel; heuristica local aplicada.")

        if ai_result:
            config = _merge_front_configs(config, ai_result)
            source = "hybrid"
        elif self.client is None:
            warnings.append("IA nao configurada; heuristica local aplicada.")

        if not config.get("termo_base"):
            config["termo_base"] = prompt

        config = _normalize_front_config(config)
        highlights = heuristic.get("highlights") or []

        return {
            "query": prompt,
            "source": source,
            "config": config,
            "highlights": highlights,
            "warnings": _unique_clean(warnings),
        }


query_translator_service = QueryTranslatorService()
