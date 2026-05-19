"""
Supabase admin script — aplica DDL e inspeciona schema do projeto ativo.

Uso:
  python scripts/supabase_admin.py check         # smoke test conexão
  python scripts/supabase_admin.py revoke-execsql  # aplica MAI-04
  python scripts/supabase_admin.py list-policies   # inspeciona RLS (MAI-11)
  python scripts/supabase_admin.py list-tables     # lista tabelas do schema public
  python scripts/supabase_admin.py exec "<SQL>"   # SQL ad-hoc

Requer:
  G:/PROJETO-HERMES/.env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
  pip install supabase python-dotenv  (já em backend/requirements.txt)

ATENÇÃO:
  - Usa service_role key — bypass de RLS.
  - Roda DDL via função exec_sql(). Se o schema for novo (projeto recém-reativado),
    rode primeiro scripts/all_migrations.sql no SQL Editor pra criar exec_sql.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Windows console default = cp1252; força UTF-8 pra evitar UnicodeEncodeError.
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

OK = "[ok]"
FAIL = "[fail]"


def _load_env() -> tuple[str, str]:
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        sys.exit(f"FAIL: {env_path} não encontrado. Crie com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.")
    url = key = ""
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPABASE_URL="):
            url = line.split("=", 1)[1].strip()
        elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            key = line.split("=", 1)[1].strip()
    if not url or not key:
        sys.exit("FAIL: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local")
    return url, key


def _client():
    from supabase import create_client
    url, key = _load_env()
    return create_client(url, key)


def _exec_sql(query: str) -> dict:
    """Roda SQL via RPC exec_sql (existe após all_migrations.sql)."""
    sb = _client()
    try:
        resp = sb.rpc("exec_sql", {"query": query}).execute()
        return {"ok": True, "data": resp.data}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def check():
    """Smoke test: tenta uma chamada trivial."""
    print(f"URL: {_load_env()[0]}")
    sb = _client()
    print("Cliente criado OK.\n")

    # Tenta exec_sql com query inofensiva
    print("Testando exec_sql(SELECT 1)...")
    res = _exec_sql("SELECT 1 AS smoke")
    if res["ok"]:
        print(f"  [ok]exec_sql funciona. Response: {res['data']}")
    else:
        print(f"  [fail]exec_sql falhou: {res['error']}")
        # Extrai ref do URL pra mostrar link certo
        url = _load_env()[0]
        ref = url.replace("https://", "").split(".")[0]
        print("\nPROVAVELMENTE o schema ainda nao foi criado. Rode primeiro:")
        print(f"  1. Abra https://supabase.com/dashboard/project/{ref}/sql/new")
        print("  2. Cole o conteudo de scripts/hermes_canonical_schema.sql")
        print("  3. Run")
        print(f"  4. Volte aqui e rode 'python scripts/supabase_admin.py check' de novo")
        return

    # Tenta listar tabelas via REST PostgREST (sem exec_sql)
    print("\nTabelas no schema public (via PostgREST OpenAPI):")
    try:
        import httpx
        url, key = _load_env()
        r = httpx.get(
            f"{url}/rest/v1/",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=10,
        )
        if r.status_code == 200:
            spec = r.json()
            tables = sorted((spec.get("definitions") or {}).keys())
            for t in tables[:30]:
                print(f"  - {t}")
            if len(tables) > 30:
                print(f"  ... e mais {len(tables) - 30}")
        else:
            print(f"  PostgREST retornou {r.status_code}")
    except Exception as e:
        print(f"  Erro consultando PostgREST: {e}")


def revoke_execsql():
    """MAI-04: REVOKE EXECUTE de exec_sql para anon/authenticated/PUBLIC."""
    sql_path = Path(__file__).resolve().parent / "security_revoke_exec_sql.sql"
    print(f"Aplicando {sql_path.name}...\n")
    sql = sql_path.read_text(encoding="utf-8")

    # Quebra por ';' e filtra vazios + DO blocks
    # Como exec_sql aceita uma query por vez (e o nosso SQL tem múltiplos statements),
    # vou rodar cada statement separado.
    statements = []
    buf = []
    in_dollar = False
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        buf.append(line)
        if "$$" in line:
            in_dollar = not in_dollar
        if stripped.endswith(";") and not in_dollar:
            statements.append("\n".join(buf).strip())
            buf = []

    for i, stmt in enumerate(statements, 1):
        print(f"[{i}/{len(statements)}] {stmt[:80]}{'...' if len(stmt) > 80 else ''}")
        res = _exec_sql(stmt)
        if res["ok"]:
            print(f"    [ok]{res['data']}")
        else:
            print(f"    [fail]{res['error']}")
            return

    print("\n[ok] MAI-04 APLICADO. Verificacao:")
    verify = _exec_sql(
        "SELECT proname, pg_catalog.pg_get_userbyid(pronamespace) AS owner, "
        "array_to_string(proacl, ', ') AS acl "
        "FROM pg_proc WHERE proname = 'exec_sql' AND pronamespace = 'public'::regnamespace"
    )
    print(json.dumps(verify, indent=2, ensure_ascii=False))


def list_policies():
    """MAI-11: lista todas RLS policies do schema public."""
    res = _exec_sql(
        "SELECT schemaname, tablename, policyname, permissive, roles, cmd, "
        "qual::text AS using_expr, with_check::text AS with_check_expr "
        "FROM pg_policies "
        "WHERE schemaname = 'public' "
        "ORDER BY tablename, policyname"
    )
    if not res["ok"]:
        print(f"FAIL: {res['error']}")
        return
    data = res["data"]
    if not data:
        print("Nenhuma RLS policy no schema public.")
        return

    # data vem como {"status":"ok"} do nosso exec_sql — ele não retorna rows.
    # Pra pegar rows, precisamos de outro mecanismo. Workaround: usar
    # REST direto na view pg_policies (não é exposta) ou criar uma view.
    print("NOTA: exec_sql atual só retorna status. Pra ler pg_policies,")
    print("rode esse SELECT direto no SQL Editor e cole o resultado:")
    print()
    print("SELECT schemaname, tablename, policyname, permissive, roles, cmd,")
    print("       qual::text AS using_expr, with_check::text AS with_check_expr")
    print("FROM pg_policies")
    print("WHERE schemaname = 'public'")
    print("ORDER BY tablename, policyname;")


def list_tables():
    """Lista tabelas via PostgREST OpenAPI."""
    import httpx
    url, key = _load_env()
    r = httpx.get(
        f"{url}/rest/v1/",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=10,
    )
    r.raise_for_status()
    spec = r.json()
    tables = sorted((spec.get("definitions") or {}).keys())
    for t in tables:
        print(t)
    print(f"\nTotal: {len(tables)} tabelas")


def exec_adhoc(sql: str):
    res = _exec_sql(sql)
    print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "check":
        check()
    elif cmd == "revoke-execsql":
        revoke_execsql()
    elif cmd == "list-policies":
        list_policies()
    elif cmd == "list-tables":
        list_tables()
    elif cmd == "exec":
        if len(sys.argv) < 3:
            sys.exit("FAIL: forneça o SQL como segundo argumento")
        exec_adhoc(sys.argv[2])
    else:
        print(f"Comando desconhecido: {cmd}")
        print(__doc__)
        sys.exit(1)
