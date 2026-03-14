from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.build_verde_test_db import build_verde_database  # noqa: E402


BACKEND_PORT = 8010
FRONTEND_PORT = 8081
DB_PATH = BACKEND_DIR / "devdata" / "hermes-verde-real.duckdb"
API_BASE = f"http://127.0.0.1:{BACKEND_PORT}"
APP_BASE = f"http://127.0.0.1:{FRONTEND_PORT}"


def wait_for_http(url: str, timeout: float = 120.0) -> None:
    started = time.time()
    last_error: Exception | None = None
    while time.time() - started < timeout:
        try:
            with urlopen(url, timeout=5) as resp:
                if resp.status < 500:
                    return
        except Exception as exc:  # pragma: no cover - script runtime
            last_error = exc
            time.sleep(1)
    raise RuntimeError(f"Timeout esperando {url}: {last_error}")


def request_stream_result(url: str, payload: dict, timeout: float = 300.0) -> tuple[list[str], dict]:
    import httpx

    events: list[str] = []
    current_event: str | None = None
    result_payload: dict | None = None
    with httpx.Client(timeout=timeout) as client:
        with client.stream("POST", url, json=payload, headers={"X-Org-Id": "default"}) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                if line.startswith("event:"):
                    current_event = line.split(":", 1)[1].strip()
                    events.append(current_event)
                    continue
                if line.startswith("data:") and current_event == "result":
                    result_payload = json.loads(line.split(":", 1)[1].strip())
                    break
                if line.startswith("data:") and current_event == "error":
                    raise RuntimeError(line.split(":", 1)[1].strip())
    if result_payload is None:
        raise RuntimeError("Stream terminou sem payload final de resultado")
    return events, result_payload


def start_backend(db_path: Path) -> subprocess.Popen[str]:
    env = os.environ.copy()
    env["HERMES_DUCKDB_PATH"] = str(db_path)
    env["PYTHONIOENCODING"] = "utf-8"
    env["CORS_ORIGINS"] = ",".join(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            f"http://localhost:{FRONTEND_PORT}",
            f"http://127.0.0.1:{FRONTEND_PORT}",
        ]
    )
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "api.main_integrado:app", "--host", "127.0.0.1", "--port", str(BACKEND_PORT)],
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )


def start_frontend() -> subprocess.Popen[str]:
    env = os.environ.copy()
    env["VITE_HERMES_API_BASE_URL"] = API_BASE
    npm_bin = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm_bin:
        raise RuntimeError("npm nao encontrado no PATH")
    return subprocess.Popen(
        [npm_bin, "run", "dev", "--", "--host", "127.0.0.1", "--port", str(FRONTEND_PORT), "--strictPort"],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )


def stop_process(proc: subprocess.Popen[str] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:  # pragma: no cover - script runtime
        proc.kill()
        proc.wait(timeout=10)


def run_front_validation(expected_total: int, expected_names: list[str]) -> dict:
    from playwright.sync_api import sync_playwright

    summary: dict = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})

        page.goto(f"{APP_BASE}/login", wait_until="networkidle")
        page.get_by_label("Email").fill("dev@hermes.local")
        page.get_by_label("Senha").fill("dev-session")
        page.get_by_role("button", name="Entrar", exact=True).click()
        page.wait_for_url(f"{APP_BASE}/app", timeout=15000)

        page.get_by_role("button", name="SP", exact=True).click()
        page.get_by_role("button", name="Configurações avançadas").click()
        page.locator('button[role="switch"]').first.click()
        page.locator("#limite").fill(str(expected_total))
        page.get_by_role("button", name="Rodar prospecção", exact=True).click()

        page.get_by_role("button", name="Ver resultados", exact=True).wait_for(timeout=300000)
        page.get_by_role("button", name="Ver resultados", exact=True).click()
        page.wait_for_url(f"{APP_BASE}/results", timeout=20000)
        page.get_by_text("Resultados da Prospecção").wait_for(timeout=20000)

        body_text = page.locator("body").inner_text()
        missing = [name for name in expected_names if name not in body_text]

        email_icons = page.locator('[title^="E-mail:"]').count()
        whatsapp_icons = page.locator('[title^="WhatsApp:"]').count()
        site_icons = page.locator('[title^="https://"], [title^="http://"]').count()
        linkedin_icons = page.locator('[title="LinkedIn"]').count()

        summary = {
            "names_found": len(expected_names) - len(missing),
            "missing_names": missing,
            "email_icons": email_icons,
            "whatsapp_icons": whatsapp_icons,
            "linkedin_icons": linkedin_icons,
            "site_icons": site_icons,
            "results_url": page.url,
        }
        browser.close()
    return summary


def main() -> int:
    backend_proc: subprocess.Popen[str] | None = None
    frontend_proc: subprocess.Popen[str] | None = None
    try:
        db_path = Path(build_verde_database(DB_PATH))

        backend_proc = start_backend(db_path)
        wait_for_http(f"{API_BASE}/docs", timeout=120)

        payload = {
            "termo_base": "",
            "cidade": "",
            "uf": "",
            "cidades": [],
            "ufs": ["MG", "SP"],
            "capital_minimo": 0,
            "capital_maximo": None,
            "limite_empresas": 5,
            "portes": ["ME", "EPP", "Médio/Grande"],
            "segmentos": [],
            "cnaes": [],
            "enriquecimento_web": True,
            "exigir_contato_acionavel": False,
            "priorizar_com_contato": True,
            "excluir_cnpjs": [],
            "idade_minima_anos": None,
            "idade_maxima_anos": None,
        }

        events, run_payload = request_stream_result(f"{API_BASE}/prospeccao/run-stream", payload, timeout=600)

        companies = run_payload.get("empresas", [])
        names = [c.get("nome_fantasia") or c.get("razao_social") for c in companies]

        frontend_proc = start_frontend()
        wait_for_http(APP_BASE, timeout=120)
        front_summary = run_front_validation(run_payload.get("total_empresas", 0), names)

        summary = {
            "db_path": str(db_path),
            "backend": {
                "run_status": "stream-ok",
                "stream_events": events,
                "total_empresas": run_payload.get("total_empresas"),
                "companies": [
                    {
                        "nome": c.get("nome_fantasia") or c.get("razao_social"),
                        "cidade": c.get("cidade"),
                        "uf": c.get("uf"),
                        "site": c.get("site"),
                        "email": c.get("email_enriquecido") or c.get("email"),
                        "whatsapp": c.get("whatsapp_enriquecido") or c.get("whatsapp_publico"),
                        "linkedin_empresa": c.get("linkedin_empresa"),
                        "socios": [
                            {
                                "nome": s.get("nome"),
                                "email": s.get("email"),
                                "whatsapp": s.get("whatsapp"),
                                "linkedin": s.get("linkedin"),
                            }
                            for s in (c.get("socios_estruturado") or [])
                        ],
                    }
                    for c in companies
                ],
            },
            "frontend": front_summary,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    finally:
        stop_process(frontend_proc)
        stop_process(backend_proc)


if __name__ == "__main__":
    raise SystemExit(main())
