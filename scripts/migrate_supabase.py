"""
Hermes — migração Supabase OLD (yxln...) → NEW (gibmow...).

Comandos:
  python scripts/migrate_supabase.py inspect              # inventário do antigo
  python scripts/migrate_supabase.py create-admin-users   # cria admin@pinn.com + admin@om.com do zero
  python scripts/migrate_supabase.py migrate-users        # (legado) migra users do antigo preservando UUID
  python scripts/migrate_supabase.py create-orgs          # cria Pinn + OM MKT vinculando admins
  python scripts/migrate_supabase.py migrate-data         # copia pipeline_leads, leads_outbound (skip se source vazio)
  python scripts/migrate_supabase.py setup-integrations   # popula org_integrations_private (chaves Assertiva)
  python scripts/migrate_supabase.py fresh                # create-admin-users → create-orgs → setup-integrations

Requer em .env.local:
  SUPABASE_OLD_URL, SUPABASE_OLD_SERVICE_ROLE_KEY
  SUPABASE_URL,     SUPABASE_SERVICE_ROLE_KEY
  HERMES_ENCRYPTION_KEY
  ASSERTIVA_PINN_CLIENT_ID, ASSERTIVA_PINN_CLIENT_SECRET   (opcional — vazio pula Pinn)
  ASSERTIVA_OM_CLIENT_ID,   ASSERTIVA_OM_CLIENT_SECRET     (opcional — vazio pula OM)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import httpx

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Tabelas do schema novo que vamos popular (ordem importa pra FKs)
MIGRATE_TABLES = [
    "organizations",     # primeiro (referenciada pelas outras)
    "org_members",
    "pipeline_leads",
    "leads_outbound",
    "sdr_activities",
    "org_integrations",  # webhook Kommo público
]


def _load_env() -> dict[str, str]:
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        sys.exit(f"FAIL: {env_path} não encontrado.")
    out: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _require(env: dict, *keys: str) -> tuple[str, ...]:
    missing = [k for k in keys if not env.get(k)]
    if missing:
        sys.exit(f"FAIL: faltam em .env.local: {', '.join(missing)}")
    return tuple(env[k] for k in keys)


def _headers(key: str) -> dict[str, str]:
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


# ────────────────────────────────────────────────────────────────────────
# Admin API helpers (auth.users)
# ────────────────────────────────────────────────────────────────────────
def list_users(url: str, key: str) -> list[dict]:
    """Lista TODOS users via paginação (Admin API)."""
    out = []
    page = 1
    while True:
        r = httpx.get(
            f"{url}/auth/v1/admin/users",
            params={"page": page, "per_page": 200},
            headers=_headers(key),
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        users = data.get("users", data) if isinstance(data, dict) else data
        if not users:
            break
        out.extend(users)
        if len(users) < 200:
            break
        page += 1
    return out


def create_user_preserving_id(url: str, key: str, user: dict) -> dict:
    """Cria user no destino preservando id, email, metadata e email_confirmed_at.
    Senhas NÃO são exportáveis pelo Supabase (hash é gerado servidor-side e admin API
    não retorna). Estratégia: cria com password aleatório forte + força email reset
    no primeiro login. OU usar magic-link logo após.
    """
    import secrets
    payload = {
        "id": user.get("id"),
        "email": user.get("email"),
        "email_confirm": bool(user.get("email_confirmed_at")),
        "password": secrets.token_urlsafe(24),  # placeholder; reset depois
        "user_metadata": user.get("user_metadata") or {},
        "app_metadata": user.get("app_metadata") or {},
    }
    r = httpx.post(
        f"{url}/auth/v1/admin/users",
        json=payload,
        headers=_headers(key),
        timeout=30,
    )
    if r.status_code not in (200, 201):
        return {"error": f"{r.status_code}: {r.text}", "email": user.get("email")}
    return r.json()


# ────────────────────────────────────────────────────────────────────────
# PostgREST helpers (data tables)
# ────────────────────────────────────────────────────────────────────────
def get_rows(url: str, key: str, table: str, limit: int = 1000, offset: int = 0) -> list[dict]:
    r = httpx.get(
        f"{url}/rest/v1/{table}",
        params={"select": "*", "limit": str(limit), "offset": str(offset)},
        headers=_headers(key),
        timeout=60,
    )
    if r.status_code != 200:
        print(f"  WARN: GET {table} -> {r.status_code}: {r.text[:200]}")
        return []
    return r.json()


def count_rows(url: str, key: str, table: str) -> int:
    r = httpx.get(
        f"{url}/rest/v1/{table}",
        params={"select": "count"},
        headers={**_headers(key), "Prefer": "count=exact"},
        timeout=30,
    )
    if r.status_code != 200:
        return -1
    cr = r.headers.get("Content-Range", "")
    if "/" in cr:
        return int(cr.split("/")[-1])
    return 0


def upsert_rows(url: str, key: str, table: str, rows: list[dict]) -> tuple[int, str]:
    if not rows:
        return 0, ""
    r = httpx.post(
        f"{url}/rest/v1/{table}",
        json=rows,
        headers={**_headers(key), "Prefer": "resolution=merge-duplicates,return=minimal"},
        timeout=120,
    )
    if r.status_code not in (200, 201, 204):
        return 0, f"{r.status_code}: {r.text[:400]}"
    return len(rows), ""


# ────────────────────────────────────────────────────────────────────────
# Comandos
# ────────────────────────────────────────────────────────────────────────
def cmd_inspect():
    env = _load_env()
    old_url, old_key = _require(env, "SUPABASE_OLD_URL", "SUPABASE_OLD_SERVICE_ROLE_KEY")
    new_url, new_key = _require(env, "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")

    print(f"SOURCE: {old_url}")
    print(f"DEST  : {new_url}")
    print()

    print("── auth.users (source) ──")
    users_old = list_users(old_url, old_key)
    print(f"  Total: {len(users_old)}")
    for u in users_old[:20]:
        print(f"  - {u.get('email')} (id={u.get('id')[:8]}... confirmed={bool(u.get('email_confirmed_at'))})")
    if len(users_old) > 20:
        print(f"  ... + {len(users_old) - 20}")
    print()

    print("── auth.users (dest) ──")
    users_new = list_users(new_url, new_key)
    print(f"  Total: {len(users_new)}")
    print()

    print("── rows source vs dest ──")
    print(f"  {'tabela':<32} {'source':>10} {'dest':>10}")
    for t in MIGRATE_TABLES:
        # No source pode não existir, no dest sempre existe
        src = count_rows(old_url, old_key, t)
        dst = count_rows(new_url, new_key, t)
        src_str = str(src) if src >= 0 else "(não existe)"
        dst_str = str(dst) if dst >= 0 else "(não existe)"
        print(f"  {t:<32} {src_str:>10} {dst_str:>10}")


def cmd_create_admin_users():
    """Cria admin@pinn.com e admin@om.com no projeto novo, com senha temporária forte.
    Senhas exibidas só uma vez no output — Pedro precisa guardar OU usar o reset password."""
    import secrets
    env = _load_env()
    new_url, new_key = _require(env, "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")

    targets = [
        {"email": "admin@pinn.com",  "name": "Admin Pinn"},
        {"email": "admin@om.com",    "name": "Admin OM MKT"},
    ]

    print(f"Criando {len(targets)} admins no projeto novo...")
    print()
    created = []
    for t in targets:
        # Senha temporária forte (16 chars URL-safe)
        temp_pwd = secrets.token_urlsafe(16)
        payload = {
            "email": t["email"],
            "password": temp_pwd,
            "email_confirm": True,                       # bypass confirmação por email
            "user_metadata": {"display_name": t["name"]},
        }
        r = httpx.post(
            f"{new_url}/auth/v1/admin/users",
            json=payload,
            headers=_headers(new_key),
            timeout=30,
        )
        if r.status_code in (200, 201):
            user = r.json()
            created.append({**t, "id": user["id"], "password": temp_pwd})
            print(f"  [ok] {t['email']:<20} id={user['id'][:8]}...")
        else:
            print(f"  [fail] {t['email']}: {r.status_code}: {r.text[:200]}")

    if created:
        print()
        print("=" * 70)
        print("SENHAS TEMPORÁRIAS — guarde e troque no primeiro login")
        print("=" * 70)
        for c in created:
            print(f"  {c['email']:<20} senha: {c['password']}")
        print("=" * 70)
        print("Pra forçar reset: Dashboard → Authentication → Users → ... → Send password reset")


def cmd_migrate_users():
    env = _load_env()
    old_url, old_key = _require(env, "SUPABASE_OLD_URL", "SUPABASE_OLD_SERVICE_ROLE_KEY")
    new_url, new_key = _require(env, "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")

    print("Listando users do source...")
    users = list_users(old_url, old_key)
    print(f"  {len(users)} users encontrados")
    print()

    print("Criando users no dest (senha placeholder; usuário precisa Reset depois)...")
    ok = 0
    fail = []
    for u in users:
        res = create_user_preserving_id(new_url, new_key, u)
        if "error" in res:
            fail.append(res)
            print(f"  [fail] {u.get('email')}: {res['error'][:120]}")
        else:
            ok += 1
            print(f"  [ok]   {u.get('email')} (id preservado: {u.get('id')[:8]}...)")

    print()
    print(f"Resultado: {ok} criados, {len(fail)} falhas")
    if fail:
        print("\nFalhas:")
        for f in fail:
            print(f"  - {f.get('email')}: {f['error'][:200]}")


def cmd_create_orgs():
    """Cria 2 orgs: Pinn e OM MKT, vinculando admin@pinn.com e admin@om.com como owner."""
    env = _load_env()
    new_url, new_key = _require(env, "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")

    users = list_users(new_url, new_key)
    by_email = {u.get("email"): u for u in users}

    pinn_user = by_email.get("admin@pinn.com")
    om_user = by_email.get("admin@om.com")

    if not pinn_user:
        sys.exit("FAIL: admin@pinn.com não existe no destino. Roda migrate-users primeiro.")
    if not om_user:
        sys.exit("FAIL: admin@om.com não existe no destino. Roda migrate-users primeiro.")

    orgs = [
        {"name": "Pinn", "slug": "pinn", "owner_id": pinn_user["id"]},
        {"name": "OM MKT", "slug": "om-mkt", "owner_id": om_user["id"]},
    ]

    print("Criando organizations...")
    for o in orgs:
        # UPSERT por slug
        r = httpx.post(
            f"{new_url}/rest/v1/organizations",
            json=o,
            headers={**_headers(new_key), "Prefer": "resolution=merge-duplicates,return=representation"},
            timeout=30,
        )
        if r.status_code in (200, 201):
            data = r.json()
            row = data[0] if isinstance(data, list) else data
            print(f"  [ok] {o['name']:<12} id={row.get('id','?')[:8]}... owner={o['owner_id'][:8]}...")
        else:
            print(f"  [fail] {o['name']}: {r.status_code}: {r.text[:200]}")

    print()
    print("Vinculando owners em org_members...")
    # Pegar ids reais das orgs criadas
    r = httpx.get(
        f"{new_url}/rest/v1/organizations",
        params={"select": "id,slug,owner_id", "slug": "in.(pinn,om-mkt)"},
        headers=_headers(new_key),
    )
    orgs_db = r.json()
    members = [
        {"org_id": o["id"], "user_id": o["owner_id"], "role": "owner"}
        for o in orgs_db
    ]
    r = httpx.post(
        f"{new_url}/rest/v1/org_members",
        json=members,
        headers={**_headers(new_key), "Prefer": "resolution=merge-duplicates,return=minimal"},
        timeout=30,
    )
    if r.status_code in (200, 201, 204):
        print(f"  [ok] {len(members)} org_members criados")
    else:
        print(f"  [fail] {r.status_code}: {r.text[:200]}")


def cmd_migrate_data():
    """Migra dados de pipeline_leads, leads_outbound, etc. — best-effort com remap de org_id."""
    env = _load_env()
    old_url, old_key = _require(env, "SUPABASE_OLD_URL", "SUPABASE_OLD_SERVICE_ROLE_KEY")
    new_url, new_key = _require(env, "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")

    # Pegar org_id default (Pinn) pra remapear leads sem org_id ou com org_id antigo
    r = httpx.get(
        f"{new_url}/rest/v1/organizations",
        params={"select": "id", "slug": "eq.pinn"},
        headers=_headers(new_key),
    )
    pinn_org_id = (r.json() or [{}])[0].get("id")
    if not pinn_org_id:
        sys.exit("FAIL: org Pinn não existe. Roda create-orgs primeiro.")

    for table in ["pipeline_leads", "leads_outbound", "sdr_activities", "org_integrations"]:
        print(f"\n── {table} ──")
        offset = 0
        total = 0
        while True:
            rows = get_rows(old_url, old_key, table, limit=500, offset=offset)
            if not rows:
                break
            # Remap org_id: se TEXT 'default' ou ausente, vira pinn_org_id (UUID)
            for r in rows:
                org = r.get("org_id")
                if not org or org in ("default", "", None) or len(str(org)) < 32:
                    r["org_id"] = pinn_org_id
            n, err = upsert_rows(new_url, new_key, table, rows)
            if err:
                print(f"  WARN offset={offset}: {err}")
                break
            total += n
            print(f"  {total} migradas...")
            if len(rows) < 500:
                break
            offset += 500
        print(f"  TOTAL {table}: {total}")


def cmd_setup_integrations():
    """Popula org_integrations_private com chaves Assertiva criptografadas."""
    env = _load_env()
    new_url, new_key, enc_key = _require(env, "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HERMES_ENCRYPTION_KEY")

    # Pegar org ids
    r = httpx.get(
        f"{new_url}/rest/v1/organizations",
        params={"select": "id,slug"},
        headers=_headers(new_key),
    )
    orgs = {o["slug"]: o["id"] for o in r.json()}

    def insert(slug: str, client_id: str, client_secret: str):
        if not client_id or not client_secret:
            print(f"  [skip] {slug}: ASSERTIVA_*_CLIENT_ID ou ASSERTIVA_*_CLIENT_SECRET vazios em .env.local")
            return
        org_id = orgs.get(slug)
        if not org_id:
            print(f"  [skip] {slug}: org não existe no destino")
            return

        # Criptografar client_secret via RPC encrypt_secret(plain, key)
        rpc = httpx.post(
            f"{new_url}/rest/v1/rpc/encrypt_secret",
            json={"plain": client_secret, "key": enc_key},
            headers=_headers(new_key),
            timeout=15,
        )
        if rpc.status_code != 200:
            print(f"  [fail] {slug}: encrypt_secret RPC retornou {rpc.status_code}: {rpc.text[:200]}")
            return
        enc_secret = rpc.json()

        # Upsert
        row = {
            "org_id": org_id,
            "assertiva_client_id": client_id,
            "assertiva_client_secret_enc": enc_secret,
            "assertiva_finalidade": 5,
        }
        r2 = httpx.post(
            f"{new_url}/rest/v1/org_integrations_private",
            json=row,
            headers={**_headers(new_key), "Prefer": "resolution=merge-duplicates,return=minimal"},
            timeout=15,
        )
        if r2.status_code in (200, 201, 204):
            print(f"  [ok] {slug}: client_id + secret criptografado salvos")
        else:
            print(f"  [fail] {slug}: {r2.status_code}: {r2.text[:200]}")

    insert("pinn",   env.get("ASSERTIVA_PINN_CLIENT_ID", ""), env.get("ASSERTIVA_PINN_CLIENT_SECRET", ""))
    insert("om-mkt", env.get("ASSERTIVA_OM_CLIENT_ID", ""),   env.get("ASSERTIVA_OM_CLIENT_SECRET", ""))


def cmd_full():
    cmd_inspect()
    print("\n\n==== migrate-users ====")
    cmd_migrate_users()
    print("\n\n==== create-orgs ====")
    cmd_create_orgs()
    print("\n\n==== migrate-data ====")
    cmd_migrate_data()
    print("\n\n==== setup-integrations ====")
    cmd_setup_integrations()


def cmd_fresh():
    """Fluxo limpo (source vazio): só cria admins, orgs e integrations."""
    cmd_create_admin_users()
    print("\n\n==== create-orgs ====")
    cmd_create_orgs()
    print("\n\n==== setup-integrations ====")
    cmd_setup_integrations()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    fn = {
        "inspect": cmd_inspect,
        "create-admin-users": cmd_create_admin_users,
        "migrate-users": cmd_migrate_users,
        "create-orgs": cmd_create_orgs,
        "migrate-data": cmd_migrate_data,
        "setup-integrations": cmd_setup_integrations,
        "full": cmd_full,
        "fresh": cmd_fresh,
    }.get(cmd)
    if not fn:
        print(__doc__)
        sys.exit(f"Comando desconhecido: {cmd}")
    fn()
