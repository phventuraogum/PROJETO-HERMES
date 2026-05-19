#!/usr/bin/env python3
"""
VPS cutover automatizado para o novo Supabase Hermes.

Fluxo:
  1. SSH na VPS (paramiko)
  2. Backup do /opt/hermes/.env
  3. Atualiza vars Supabase + HERMES_ENCRYPTION_KEY preservando o resto
  4. git fetch + checkout + pull da branch
  5. Roda scripts/deploy.sh (build + restart + health check)
  6. Stream output em tempo real

Requer em G:/PROJETO-HERMES/.env.local:
  SSH_HERMES_PASS                       (senha root da VPS)
  SUPABASE_URL                          (do projeto novo — já em .env.local)
  SUPABASE_SERVICE_ROLE_KEY             (idem)
  SUPABASE_ANON_KEY                     (pegar no Dashboard Settings → API)
  SUPABASE_JWT_SECRET                   (idem)
  HERMES_ENCRYPTION_KEY                 (já em .env.local)
  VITE_SUPABASE_URL    (igual a SUPABASE_URL, opcional — script copia se ausente)
  VITE_SUPABASE_ANON_KEY (igual a SUPABASE_ANON_KEY, opcional — script copia)

Variáveis opcionais (sobrescreve defaults do _vps_ssh_deploy_once.py):
  SSH_HERMES_HOST    (default: 31.97.241.171)
  SSH_HERMES_USER    (default: root)
  SSH_HERMES_BRANCH  (default: feat/pgfn-enrichment-pipeline)

Uso:
  python scripts/vps_cutover.py             # dry-run (só mostra diff do .env)
  python scripts/vps_cutover.py --apply     # aplica de verdade
  python scripts/vps_cutover.py --rollback  # restaura backup do .env e re-deploy
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Dict

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

VARS_TO_UPDATE = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_JWT_SECRET",
    "HERMES_ENCRYPTION_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
]


def load_local_env() -> Dict[str, str]:
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        sys.exit(f"FAIL: {env_path} nao encontrado")
    out: Dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    # VITE_* copiam de SUPABASE_* se vazios
    out.setdefault("VITE_SUPABASE_URL", out.get("SUPABASE_URL", ""))
    out.setdefault("VITE_SUPABASE_ANON_KEY", out.get("SUPABASE_ANON_KEY", ""))
    return out


def merge_env(remote_env: str, updates: Dict[str, str]) -> tuple[str, list[str]]:
    """Mescla updates no remote_env preservando comentários e ordem.
    Retorna (novo_env, mudanças_aplicadas)."""
    lines = remote_env.splitlines()
    seen: set[str] = set()
    changes: list[str] = []
    out_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            out_lines.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in updates:
            new_val = updates[key]
            if not new_val:
                # Sem valor novo — preservar valor antigo
                out_lines.append(line)
                continue
            old_val = stripped.split("=", 1)[1].strip()
            if old_val != new_val:
                changes.append(f"  {key}: alterado")
            else:
                changes.append(f"  {key}: ja igual")
            out_lines.append(f"{key}={new_val}")
            seen.add(key)
        else:
            out_lines.append(line)

    # Vars novas (não existiam no remote)
    missing = [k for k in VARS_TO_UPDATE if k not in seen and updates.get(k)]
    if missing:
        out_lines.append("")
        out_lines.append("# === ADICIONADO pelo vps_cutover.py em " + time.strftime("%Y-%m-%d %H:%M:%S") + " ===")
        for k in missing:
            out_lines.append(f"{k}={updates[k]}")
            changes.append(f"  {k}: NOVO")

    return "\n".join(out_lines) + "\n", changes


def main():
    try:
        import paramiko
    except ImportError:
        sys.exit("FAIL: pip install paramiko (ja deveria estar instalado por _vps_ssh_deploy_once.py)")

    args = sys.argv[1:]
    dry_run = "--apply" not in args and "--rollback" not in args
    rollback = "--rollback" in args

    env = load_local_env()
    pwd = env.get("SSH_HERMES_PASS", "").strip()
    if not pwd:
        sys.exit("FAIL: defina SSH_HERMES_PASS no .env.local")

    # Validar vars obrigatórias (exceto em rollback)
    if not rollback:
        missing = [k for k in VARS_TO_UPDATE if not env.get(k)]
        if missing:
            print("ATENCAO: vars vazias em .env.local (vao ser ignoradas no merge):")
            for k in missing:
                print(f"  - {k}")
            print()
            if not dry_run and any(k in {"SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET", "HERMES_ENCRYPTION_KEY"} for k in missing):
                sys.exit("FAIL: vars criticas vazias — preencha .env.local antes de --apply")

    host = os.environ.get("SSH_HERMES_HOST") or "31.97.241.171"
    user = os.environ.get("SSH_HERMES_USER") or "root"
    branch = os.environ.get("SSH_HERMES_BRANCH") or "feat/pgfn-enrichment-pipeline"

    print(f"VPS: {user}@{host}")
    print(f"Branch: {branch}")
    print(f"Mode: {'ROLLBACK' if rollback else ('DRY-RUN' if dry_run else 'APPLY')}")
    print()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=pwd, timeout=45,
                   allow_agent=False, look_for_keys=False)

    def run(cmd: str, timeout: int = 600, stream: bool = False) -> tuple[int, str, str]:
        print(f"--- {cmd[:140]}{'...' if len(cmd) > 140 else ''}")
        _stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        if stream:
            # Stream stdout em tempo real
            for chunk in iter(lambda: stdout.channel.recv(4096), b""):
                try:
                    print(chunk.decode("utf-8", errors="replace"), end="", flush=True)
                except Exception:
                    pass
            stdout.channel.recv_exit_status()
            return stdout.channel.exit_status, "", ""
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        status = stdout.channel.recv_exit_status()
        if out:
            print(out.rstrip())
        if err:
            print(err.rstrip(), file=sys.stderr)
        return status, out, err

    try:
        # ── ROLLBACK ──────────────────────────────────────────────────
        if rollback:
            print("Listando backups disponiveis em /opt/hermes/...")
            run("ls -la /opt/hermes/.env.backup-* 2>/dev/null | tail -5")
            print()
            ans = input("Cole o nome EXATO do backup pra restaurar (ex: .env.backup-20260519-103045): ").strip()
            if not ans:
                sys.exit("Cancelado.")
            if not ans.startswith(".env.backup-"):
                sys.exit("Nome invalido.")
            run(f"cd /opt/hermes && cp {ans} .env && echo 'Restaurado'")
            print("\nRebuild + restart...")
            run("cd /opt/hermes && bash scripts/deploy.sh", timeout=3600, stream=True)
            return

        # ── DRY-RUN ou APPLY ─────────────────────────────────────────
        # 1. Pegar .env remoto
        sftp = client.open_sftp()
        try:
            with sftp.file("/opt/hermes/.env", "r") as f:
                remote_env = f.read().decode("utf-8", errors="replace")
        except FileNotFoundError:
            sys.exit("FAIL: /opt/hermes/.env nao existe na VPS")
        finally:
            sftp.close()

        # 2. Calcular merge
        updates = {k: env.get(k, "") for k in VARS_TO_UPDATE if env.get(k)}
        new_env, changes = merge_env(remote_env, updates)

        print("Mudancas no .env remoto:")
        for c in changes:
            print(c)
        print()

        if dry_run:
            print("DRY-RUN concluido. Rode com --apply pra aplicar.")
            return

        # 3. Backup
        backup_name = f".env.backup-{time.strftime('%Y%m%d-%H%M%S')}"
        run(f"cp /opt/hermes/.env /opt/hermes/{backup_name}")
        print(f"Backup salvo: /opt/hermes/{backup_name}")

        # 4. Upload novo .env
        sftp = client.open_sftp()
        try:
            with sftp.file("/opt/hermes/.env.new", "w") as f:
                f.write(new_env)
            # Move atomico
            run("mv /opt/hermes/.env.new /opt/hermes/.env && chmod 600 /opt/hermes/.env")
        finally:
            sftp.close()
        print(".env atualizado")

        # 5. Git pull
        run("cd /opt/hermes && git fetch origin", timeout=180)
        run(f"cd /opt/hermes && git checkout {branch} && git pull origin {branch}", timeout=180)

        # 6. Deploy
        print("\n=== Rodando scripts/deploy.sh (stream) ===\n")
        rc, _, _ = run("cd /opt/hermes && bash scripts/deploy.sh", timeout=3600, stream=True)
        print(f"\n=== Deploy exit: {rc} ===")
        if rc != 0:
            print(f"\nFALHOU. Pra rollback rode: python scripts/vps_cutover.py --rollback")
            print(f"E aponta o backup: /opt/hermes/{backup_name}")

    finally:
        client.close()


if __name__ == "__main__":
    main()
