import asyncio
import sys
from pathlib import Path
from typing import Dict, Any

import httpx
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / ".env")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from core_scraper import (  # noqa: E402
    BRAVE_SEARCH_API_KEY,
    FIRECRAWL_API_BASE,
    FIRECRAWL_API_KEY,
    GOOGLE_SEARCH_API_KEY,
    GOOGLE_SEARCH_CX,
    SEARCH_PROVIDER_ORDER,
    TAVILY_API_KEY,
    SEARXNG_URL,
    _extrair_contatos_firecrawl,
    buscar_google,
    get_effective_search_provider_order,
    get_search_provider_status,
)


def _print_probe_result(result: Dict[str, Any]) -> None:
    status = "OK" if result["ok"] else result.get("status", "FAIL")
    print(f"[{status}] {result['name']}: {result['message']}")
    if result.get("sample"):
        print(f"      amostra: {result['sample']}")


async def _probe_searxng(query: str) -> Dict[str, Any]:
    if not SEARXNG_URL:
        return {"name": "searxng", "ok": True, "status": "SKIP", "message": "SEARXNG_URL nao configurado"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"{SEARXNG_URL.rstrip('/')}/search",
                params={
                    "q": query,
                    "format": "json",
                    "language": "pt-BR",
                    "categories": "general",
                },
            )
            if resp.status_code != 200:
                return {
                    "name": "searxng",
                    "ok": False,
                    "message": f"HTTP {resp.status_code}",
                }
            results = resp.json().get("results", [])
            if not results:
                return {"name": "searxng", "ok": False, "message": "sem resultados"}
            top = results[0]
            return {
                "name": "searxng",
                "ok": True,
                "message": f"{len(results)} resultados",
                "sample": f"{top.get('title', '').strip()} -> {top.get('url', '').strip()}",
            }
    except Exception as exc:
        return {"name": "searxng", "ok": False, "message": str(exc)}


async def _probe_tavily(query: str) -> Dict[str, Any]:
    if not TAVILY_API_KEY:
        return {"name": "tavily", "ok": True, "status": "SKIP", "message": "TAVILY_API_KEY nao configurada"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "topic": "general",
                    "search_depth": "basic",
                    "max_results": 3,
                    "include_answer": False,
                    "include_raw_content": False,
                },
            )
            if resp.status_code != 200:
                return {
                    "name": "tavily",
                    "ok": False,
                    "message": f"HTTP {resp.status_code}",
                }
            results = resp.json().get("results", [])
            if not results:
                return {"name": "tavily", "ok": False, "message": "sem resultados"}
            top = results[0]
            return {
                "name": "tavily",
                "ok": True,
                "message": f"{len(results)} resultados",
                "sample": f"{top.get('title', '').strip()} -> {top.get('url', '').strip()}",
            }
    except Exception as exc:
        return {"name": "tavily", "ok": False, "message": str(exc)}


async def _probe_google(query: str) -> Dict[str, Any]:
    if not (GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX):
        return {"name": "google", "ok": True, "status": "SKIP", "message": "GOOGLE_SEARCH_API_KEY/GOOGLE_SEARCH_CX nao configurados"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/customsearch/v1",
                params={
                    "key": GOOGLE_SEARCH_API_KEY,
                    "cx": GOOGLE_SEARCH_CX,
                    "q": query,
                    "num": 3,
                    "gl": "br",
                    "hl": "pt",
                },
            )
            if resp.status_code != 200:
                return {
                    "name": "google",
                    "ok": False,
                    "message": f"HTTP {resp.status_code}",
                }
            results = resp.json().get("items", [])
            if not results:
                return {"name": "google", "ok": False, "message": "sem resultados"}
            top = results[0]
            return {
                "name": "google",
                "ok": True,
                "message": f"{len(results)} resultados",
                "sample": f"{top.get('title', '').strip()} -> {top.get('link', '').strip()}",
            }
    except Exception as exc:
        return {"name": "google", "ok": False, "message": str(exc)}


async def _probe_brave(query: str) -> Dict[str, Any]:
    if not BRAVE_SEARCH_API_KEY:
        return {"name": "brave", "ok": True, "status": "SKIP", "message": "BRAVE_SEARCH_API_KEY nao configurada"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
                },
                params={
                    "q": query,
                    "count": 3,
                    "country": "BR",
                    "search_lang": "pt-br",
                },
            )
            if resp.status_code != 200:
                return {
                    "name": "brave",
                    "ok": False,
                    "message": f"HTTP {resp.status_code}",
                }
            results = (resp.json().get("web") or {}).get("results", [])
            if not results:
                return {"name": "brave", "ok": False, "message": "sem resultados"}
            top = results[0]
            return {
                "name": "brave",
                "ok": True,
                "message": f"{len(results)} resultados",
                "sample": f"{top.get('title', '').strip()} -> {top.get('url', '').strip()}",
            }
    except Exception as exc:
        return {"name": "brave", "ok": False, "message": str(exc)}


async def _probe_firecrawl(url: str) -> Dict[str, Any]:
    if not FIRECRAWL_API_KEY:
        return {"name": "firecrawl", "ok": True, "status": "SKIP", "message": "FIRECRAWL_API_KEY nao configurada"}

    try:
        contatos = await _extrair_contatos_firecrawl(url)
        if not contatos:
            return {"name": "firecrawl", "ok": False, "message": "sem dados de contato"}

        amostras = []
        for chave in ("email", "whatsapp", "telefone", "linkedin_empresa"):
            valor = contatos.get(chave)
            if valor:
                amostras.append(f"{chave}={valor}")

        return {
            "name": "firecrawl",
            "ok": bool(amostras),
            "message": "scrape respondeu" if amostras else "scrape sem contatos relevantes",
            "sample": " | ".join(amostras[:3]) if amostras else str(contatos.get("site") or url),
        }
    except Exception as exc:
        return {"name": "firecrawl", "ok": False, "message": str(exc)}


async def _probe_cascade(query: str) -> Dict[str, Any]:
    try:
        results = await buscar_google(query, num_results=5)
        if not results:
            return {"name": "cascade", "ok": False, "message": "nenhum resultado na cascata final"}
        top = results[0]
        return {
            "name": "cascade",
            "ok": True,
            "message": f"{len(results)} resultados na cadeia efetiva",
            "sample": f"{top.get('titulo', '').strip()} -> {top.get('link', '').strip()}",
        }
    except Exception as exc:
        return {"name": "cascade", "ok": False, "message": str(exc)}


async def main() -> int:
    query = " ".join(sys.argv[1:]).strip() or '"TOTVS" contato email whatsapp linkedin brasil'

    print("Query:", query)
    print("Ordem configurada:", " -> ".join(SEARCH_PROVIDER_ORDER))
    print("Ordem efetiva:", " -> ".join(get_effective_search_provider_order()))
    print("Config atual:")
    for provider in get_search_provider_status():
        status = "on" if provider["enabled"] else "off"
        print(f"  - {provider['provider']}: {status} ({provider['detail']})")
    firecrawl_status = "on" if FIRECRAWL_API_KEY else "off"
    print(f"  - firecrawl: {firecrawl_status} ({FIRECRAWL_API_BASE})")
    print("")

    results = [
        await _probe_searxng(query),
        await _probe_tavily(query),
        await _probe_google(query),
        await _probe_brave(query),
        await _probe_firecrawl("https://www.totvs.com/contato/"),
        await _probe_cascade(query),
    ]

    for result in results:
        _print_probe_result(result)

    has_failure = any(result["name"] == "cascade" and not result["ok"] for result in results)
    return 1 if has_failure else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
