#!/usr/bin/env python3
"""
Deploy remoto na VPS via SSH (senha). Não coloque senha no código.

Opções (primeira que existir ganha):
  1) Variável de ambiente HERMES_VPS_PASSWORD
  2) Arquivo .deploy/vps_password (uma linha, UTF-8) — pasta .deploy está no .gitignore

Uso:
  HERMES_VPS_PASSWORD=... python scripts/vps_deploy_remote.py
  HERMES_VPS_HOST=31.97.241.171 HERMES_VPS_BRANCH=feat/pgfn-enrichment-pipeline python scripts/vps_deploy_remote.py
"""
from __future__ import annotations

import os
import sys
import textwrap
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PASSWORD_FILE = REPO_ROOT / ".deploy" / "vps_password"


def _read_password() -> str:
    env = (os.environ.get("HERMES_VPS_PASSWORD") or "").strip()
    if env:
        return env
    if PASSWORD_FILE.is_file():
        return PASSWORD_FILE.read_text(encoding="utf-8").strip().splitlines()[0].strip()
    print(
        textwrap.dedent(
            """
            Senha não encontrada.
            Defina HERMES_VPS_PASSWORD ou crie o arquivo (uma linha):
              PROJETO-HERMES/.deploy/vps_password
            """
        ).strip(),
        file=sys.stderr,
    )
    sys.exit(2)


def main() -> None:
    import paramiko  # noqa: PLC0415

    # Windows (cp1252): saída do Docker pode ter caracteres fora da página de código.
    for stream in (sys.stdout, sys.stderr):
        try:
            if hasattr(stream, "reconfigure"):
                stream.reconfigure(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            pass

    host = (os.environ.get("HERMES_VPS_HOST") or "31.97.241.171").strip()
    user = (os.environ.get("HERMES_VPS_USER") or "root").strip()
    branch = (os.environ.get("HERMES_VPS_BRANCH") or "feat/pgfn-enrichment-pipeline").strip()
    hermes_dir = (os.environ.get("HERMES_VPS_DIR") or "/opt/hermes").strip()
    password = _read_password()

    remote = textwrap.dedent(
        f"""
        set -e
        cd "{hermes_dir}"
        git fetch origin
        # VPS às vezes tem cópia suja ou untracked que bloqueia checkout — empilha e segue.
        git stash push -u -m "hermes-deploy-auto-$(date +%s)" || true
        git checkout "{branch}"
        git pull origin "{branch}"
        bash scripts/deploy.sh
        """
    ).strip()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=host,
            username=user,
            password=password,
            timeout=25,
            allow_agent=False,
            look_for_keys=False,
        )
    except paramiko.AuthenticationException:
        print("Falha de autenticação (senha ou usuário incorretos).", file=sys.stderr)
        sys.exit(3)
    except OSError as exc:
        print(f"Erro de rede/SSH: {exc}", file=sys.stderr)
        sys.exit(4)

    try:
        stdin, stdout, stderr = client.exec_command(remote, get_pty=True, timeout=3600)
        stdin.close()
        for line in iter(stdout.readline, ""):
            if line:
                sys.stdout.write(line)
                sys.stdout.flush()
        err = stderr.read().decode("utf-8", errors="replace")
        if err:
            sys.stderr.write(err)
        code = stdout.channel.recv_exit_status()
        if code != 0:
            sys.exit(code)
    finally:
        client.close()

    print("\n--- Deploy remoto concluído (exit 0) ---")


if __name__ == "__main__":
    main()
