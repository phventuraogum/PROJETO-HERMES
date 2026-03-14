import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class RuntimeFallbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        cls.prev_env = {
            "ENVIRONMENT": os.environ.get("ENVIRONMENT"),
            "HERMES_AUTH_REQUIRED": os.environ.get("HERMES_AUTH_REQUIRED"),
            "HERMES_DUCKDB_PATH": os.environ.get("HERMES_DUCKDB_PATH"),
            "SUPABASE_URL": os.environ.get("SUPABASE_URL"),
            "SUPABASE_ANON_KEY": os.environ.get("SUPABASE_ANON_KEY"),
            "SUPABASE_SERVICE_ROLE_KEY": os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
            "SUPABASE_JWT_SECRET": os.environ.get("SUPABASE_JWT_SECRET"),
        }

        os.environ["ENVIRONMENT"] = "development"
        os.environ["HERMES_AUTH_REQUIRED"] = "false"
        os.environ["HERMES_DUCKDB_PATH"] = str(Path(cls.tmpdir.name) / "runtime-fallbacks.duckdb")
        os.environ["SUPABASE_URL"] = ""
        os.environ["SUPABASE_ANON_KEY"] = ""
        os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
        os.environ["SUPABASE_JWT_SECRET"] = ""

        cls.config = importlib.import_module("config")
        importlib.reload(cls.config)

        cls.db_pool = importlib.import_module("api.db_pool")
        importlib.reload(cls.db_pool)

        cls.lead_registry = importlib.import_module("api.lead_registry")
        importlib.reload(cls.lead_registry)

        cls.public_fiscal_data = importlib.import_module("api.public_fiscal_data")
        importlib.reload(cls.public_fiscal_data)

        cls.credits_router = importlib.import_module("api.routers.credits")
        importlib.reload(cls.credits_router)

        cls.pipeline_router = importlib.import_module("api.routers.pipeline")
        importlib.reload(cls.pipeline_router)

        cls.main_integrado = importlib.import_module("api.main_integrado")
        importlib.reload(cls.main_integrado)

        from fastapi.testclient import TestClient

        cls.client = TestClient(cls.main_integrado.app)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.db_pool.close_all_connections()
        finally:
            for key, value in cls.prev_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            cls.tmpdir.cleanup()

    def test_credits_fallback_returns_zero_and_fallback_plans(self):
        credits_response = self.client.get("/credits")
        self.assertEqual(credits_response.status_code, 200)
        self.assertEqual(credits_response.json()["saldo"], 0)

        plans_response = self.client.get("/plans")
        self.assertEqual(plans_response.status_code, 200)
        plans_payload = plans_response.json()
        self.assertEqual(plans_payload["source"], "fallback")
        self.assertGreaterEqual(len(plans_payload["plans"]), 1)

    def test_pipeline_local_fallback_supports_crud_and_sdr(self):
        payload = {
            "empresa": {
                "cnpj": "15103354000139",
                "razao_social": "DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA",
                "nome_fantasia": "DEODE",
                "email": "comercial@deodenergia.com",
                "telefone": "32330256069",
                "telefone_receita": "32330256069",
                "whatsapp": "5531991492474",
                "whatsapp_enriquecido": "5531991492474",
                "site": "https://www.deodenergia.com/",
                "cidade": "JUIZ DE FORA",
                "uf": "MG",
                "segmento": "Energia",
                "porte": "Medio/Grande",
                "capital_social": 4000000,
                "cnae_principal": "7112000",
                "cnae_descricao": "Servicos de engenharia",
                "email_enriquecido": "comercial@deodenergia.com",
                "score_icp": 77,
            },
            "estagio": "novo",
            "nota": "seed local",
            "auto_enviar_sdr": False,
            "create_ploomes_deal": False,
        }

        created = self.client.post("/pipeline", json=payload)
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["status"], "added")

        listed = self.client.get("/pipeline")
        self.assertEqual(listed.status_code, 200)
        items = listed.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["cnpj"], "15103354000139")

        moved = self.client.patch("/pipeline/15103354000139/estagio", json={"estagio": "em_analise"})
        self.assertEqual(moved.status_code, 200)

        noted = self.client.patch("/pipeline/15103354000139/nota", json={"nota": "validar proposta"})
        self.assertEqual(noted.status_code, 200)

        sdr = self.client.post("/pipeline/enviar-sdr", json={"cnpjs": ["15103354000139"]})
        self.assertEqual(sdr.status_code, 200)
        self.assertEqual(sdr.json()["enviados"], 1)

        updated = self.client.get("/pipeline")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()[0]["estagio"], "em_analise")
        self.assertEqual(updated.json()[0]["nota"], "validar proposta")
        self.assertEqual(updated.json()[0]["sdr_status"], "enviado")

        deleted = self.client.delete("/pipeline/15103354000139")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get("/pipeline").json(), [])

    def test_mixed_duckdb_endpoints_do_not_conflict(self):
        imported = self.client.post(
            "/fiscal-public/import-text",
            json={
                "content": (
                    "CNPJ;Nome Devedor;Situacao Inscricao;Numero Inscricao;Data Inscricao;Valor Originario;Valor Consolidado\n"
                    "15.103.354/0001-39;DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA;IRREGULAR;INSC-001;01/02/2026;120.000,00;145.500,25\n"
                ),
                "filename": "pgfn-fallback.csv",
                "source_label": "PGFN Dados Abertos",
            },
        )
        self.assertEqual(imported.status_code, 200)

        saved = self.client.post(
            "/saved-searches",
            json={
                "name": "Auditoria mista",
                "description": "Valida alternancia read/write no DuckDB",
                "kind": "search",
                "source": "test",
                "config": {
                    "termo_base": "CLINICA",
                    "cidade": "BELO HORIZONTE",
                    "uf": "MG",
                    "cidades": ["BELO HORIZONTE"],
                    "ufs": ["MG"],
                    "capital_minimo": 0,
                    "capital_maximo": None,
                    "limite_empresas": 10,
                    "portes": ["ME"],
                    "segmentos": ["Clinicas"],
                    "cnaes": [],
                    "incluir_cnae_secundario": False,
                    "enriquecimento_web": False,
                    "exigir_contato_acionavel": False,
                    "priorizar_com_contato": True,
                    "excluir_cnpjs": [],
                    "idade_minima_anos": None,
                    "idade_maxima_anos": None,
                },
            },
        )
        self.assertEqual(saved.status_code, 200)

        lead_list = self.client.post("/lead-lists", json={"name": "Lista auditoria", "description": "Teste"})
        self.assertEqual(lead_list.status_code, 200)

        watch = self.client.post(
            "/company-watchlist",
            json={
                "empresa": {
                    "cnpj": "15103354000139",
                    "razao_social": "DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA",
                    "cidade": "JUIZ DE FORA",
                    "uf": "MG",
                },
                "source": "test",
            },
        )
        self.assertEqual(watch.status_code, 200)

        prospect = self.client.post(
            "/prospeccao/run",
            json={
                "termo_base": "CLINICA",
                "cidade": "BELO HORIZONTE",
                "uf": "MG",
                "capital_minimo": 0,
                "limite_empresas": 20,
                "portes": ["ME", "EPP", "Medio/Grande"],
                "segmentos": ["Clinicas"],
                "cnaes": [],
                "enriquecimento_web": False,
                "exigir_contato_acionavel": False,
                "priorizar_com_contato": True,
            },
        )
        self.assertEqual(prospect.status_code, 200)

        self.assertEqual(self.client.get("/saved-searches").status_code, 200)
        self.assertEqual(self.client.get("/lead-lists").status_code, 200)
        self.assertEqual(self.client.get("/lead-suppressions").status_code, 200)
        self.assertEqual(self.client.get("/company-watchlist").status_code, 200)
        self.assertEqual(self.client.get("/company-signals").status_code, 200)
        self.assertEqual(self.client.get("/fiscal-public/meta").status_code, 200)

        lookup = self.client.get("/fiscal-public/15103354000139")
        self.assertEqual(lookup.status_code, 200)
        self.assertTrue(lookup.json()["summary"]["has_records"])


if __name__ == "__main__":
    unittest.main()
