import tempfile
import unittest
from pathlib import Path
import sys

BACKEND_DIR = str(Path(__file__).resolve().parents[1])
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from api.result_store import ResultStore


class ResultStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = ResultStore(redis_url="", base_dir=self.tempdir.name, history_limit=3)
        self.org_id = "org-teste"
        self.config = {
            "termo_base": "verde",
            "cidade": "Sao Paulo",
            "uf": "SP",
            "segmentos": ["Servicos"],
            "portes": ["ME"],
            "capital_minimo": 0,
            "limite_empresas": 10,
            "enriquecimento_web": True,
        }
        self.resultado = {
            "total_empresas": 1,
            "empresas": [
                {
                    "cnpj": "00000000000191",
                    "razao_social": "Empresa Verde",
                    "email": "contato@empresa.com.br",
                    "whatsapp_publico": "5511999999999",
                    "capital_social": 500000,
                    "score_icp": 82.4,
                    "site": "https://empresa.com.br",
                }
            ],
            "filtros_icp": {"cidade": "Sao Paulo", "uf": "SP", "portes": ["ME"], "segmentos": ["Servicos"]},
            "enriquecimento_web": {
                "total_com_enriquecimento": 1,
                "total_sem_enriquecimento": 0,
                "porcentagem_enriquecida": 100.0,
            },
        }

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_save_result_exposes_latest_payload(self) -> None:
        self.store.save_result(self.org_id, self.config, self.resultado, timestamp="2026-03-10T12:00:00+00:00")

        latest = self.store.get_latest_result(self.org_id)
        self.assertIsNotNone(latest)
        self.assertEqual(latest["resultado"]["total_empresas"], 1)

        payload = self.store.get_latest_execution_payload(self.org_id)
        self.assertEqual(payload["execucao"]["cidade"], "Sao Paulo")
        self.assertEqual(len(payload["resultados"]), 1)

    def test_history_can_be_renamed_and_deleted(self) -> None:
        self.store.save_result(self.org_id, self.config, self.resultado, timestamp="2026-03-10T12:00:00+00:00")
        history = self.store.get_history(self.org_id)
        self.assertEqual(len(history), 1)

        entry_id = history[0]["id"]
        self.assertTrue(self.store.rename_history_entry(self.org_id, entry_id, "Rodada Verde"))
        renamed = self.store.get_history(self.org_id)
        self.assertEqual(renamed[0]["nome"], "Rodada Verde")
        self.assertEqual(renamed[0]["metricas"]["taxa_email"], 100.0)

        self.assertTrue(self.store.delete_history_entry(self.org_id, entry_id))
        self.assertEqual(self.store.get_history(self.org_id), [])


if __name__ == "__main__":
    unittest.main()
