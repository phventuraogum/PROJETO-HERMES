import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class LocalSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        os.environ["ENVIRONMENT"] = "development"
        os.environ["HERMES_AUTH_REQUIRED"] = "false"
        os.environ["HERMES_DUCKDB_PATH"] = str(Path(cls.tmpdir.name) / "hermes-test.duckdb")

        cls.config = importlib.import_module("config")
        importlib.reload(cls.config)

        cls.db_pool = importlib.import_module("api.db_pool")
        importlib.reload(cls.db_pool)

        cls.main_integrado = importlib.import_module("api.main_integrado")
        importlib.reload(cls.main_integrado)

        from fastapi.testclient import TestClient

        cls.client = TestClient(cls.main_integrado.app)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.db_pool.close_all_connections()
        finally:
            cls.tmpdir.cleanup()

    def test_health_endpoint_uses_sample_database(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")

        detailed = self.client.get("/health/detailed")
        self.assertEqual(detailed.status_code, 200)
        self.assertEqual(detailed.json()["services"]["database"]["status"], "healthy")

    def test_prospeccao_returns_sample_results(self):
        response = self.client.post(
            "/prospeccao/run",
            json={
                "termo_base": "CLINICA",
                "cidade": "BELO HORIZONTE",
                "uf": "MG",
                "capital_minimo": 0,
                "limite_empresas": 20,
                "portes": ["ME", "EPP", "Médio/Grande"],
                "segmentos": ["Clínicas"],
                "cnaes": [],
                "enriquecimento_web": False,
                "exigir_contato_acionavel": False,
                "priorizar_com_contato": True,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertGreaterEqual(payload["total_empresas"], 1)
        self.assertGreaterEqual(len(payload["empresas"]), 1)
        self.assertEqual(payload["empresas"][0]["cidade"], "BELO HORIZONTE")

        latest = self.client.get("/prospeccao/resultado-atual")
        self.assertEqual(latest.status_code, 200)
        latest_payload = latest.json()
        self.assertEqual(latest_payload["resultado"]["total_empresas"], payload["total_empresas"])

        ultima_execucao = self.client.get("/prospeccao/ultima-execucao")
        self.assertEqual(ultima_execucao.status_code, 200)
        ultima_payload = ultima_execucao.json()
        self.assertEqual(ultima_payload["execucao"]["cidade"], "BELO HORIZONTE")
        self.assertGreaterEqual(len(ultima_payload["resultados"]), 1)

        historico = self.client.get("/prospeccao/historico")
        self.assertEqual(historico.status_code, 200)
        self.assertGreaterEqual(len(historico.json()), 1)

    def test_translate_query_endpoint_returns_structured_filters(self):
        response = self.client.post(
            "/prospeccao/translate-query",
            json={
                "query": "administradoras de condominios em MG com whatsapp valido 30 leads",
                "defaults": {
                    "enriquecimento_web": True,
                    "limite_empresas": 50,
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["config"]["ufs"], ["MG"])
        self.assertEqual(payload["config"]["limite_empresas"], 30)
        self.assertTrue(payload["config"]["exigir_contato_acionavel"])
        self.assertIn(payload["source"], {"heuristic", "hybrid"})


if __name__ == "__main__":
    unittest.main()
