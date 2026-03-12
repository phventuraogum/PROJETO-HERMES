import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class LeadRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "lead-registry-test.duckdb")
        self.prev_env = {
            "ENVIRONMENT": os.environ.get("ENVIRONMENT"),
            "HERMES_DUCKDB_PATH": os.environ.get("HERMES_DUCKDB_PATH"),
        }
        os.environ["ENVIRONMENT"] = "development"
        os.environ["HERMES_DUCKDB_PATH"] = self.db_path

        self.db_pool = importlib.import_module("api.db_pool")
        importlib.reload(self.db_pool)
        self.lead_registry = importlib.import_module("api.lead_registry")
        importlib.reload(self.lead_registry)
        self.service = self.lead_registry.LeadRegistryService()

    def tearDown(self):
        try:
            self.db_pool.close_all_connections()
        finally:
            for key, value in self.prev_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            self.tmpdir.cleanup()

    def test_create_list_and_add_items_deduplicates_by_cnpj(self):
        created = self.service.create_list("org-a", "Lista SDR", "Rodada inicial")

        added = self.service.add_items(
            "org-a",
            created["id"],
            [
                {
                    "empresa": {
                        "cnpj": "12.345.678/0001-90",
                        "razao_social": "EMPRESA A LTDA",
                        "nome_fantasia": "Empresa A",
                        "cidade": "Belo Horizonte",
                        "uf": "MG",
                        "segmento": "Servicos",
                    },
                    "score_icp": 88,
                    "source": "results_selection",
                },
                {
                    "empresa": {
                        "cnpj": "12345678000190",
                        "razao_social": "EMPRESA A DUPLICADA",
                    },
                    "score_icp": 91,
                },
                {
                    "empresa": {
                        "cnpj": "98.765.432/0001-10",
                        "razao_social": "EMPRESA B LTDA",
                        "cidade": "Sao Paulo",
                        "uf": "SP",
                    },
                },
            ],
        )

        self.assertEqual(added, 2)

        lists = self.service.list_lists("org-a")
        self.assertEqual(len(lists), 1)
        self.assertEqual(lists[0]["item_count"], 2)

        items = self.service.get_list_items("org-a", created["id"])
        cnpjs = {item["cnpj"] for item in items}
        self.assertEqual(cnpjs, {"12345678000190", "98765432000110"})
        self.assertTrue(any(item["empresa"]["razao_social"] == "EMPRESA A LTDA" for item in items))

    def test_suppressions_are_normalized_and_isolated_by_org(self):
        added = self.service.add_suppressions(
            "org-a",
            cnpjs=["12.345.678/0001-90", "12345678000190"],
            emails=["Contato@Empresa.com", "contato@empresa.com"],
            domains=["https://empresa.com.br/", "empresa.com.br"],
            reason="opt-out",
            source="manual",
        )

        self.assertEqual(added, 3)
        self.assertEqual(self.service.get_suppressed_cnpjs("org-a"), ["12345678000190"])
        self.assertEqual(self.service.get_suppressed_cnpjs("org-b"), [])

        updated = self.service.add_suppressions(
            "org-a",
            cnpjs=["12345678000190"],
            emails=["contato@empresa.com"],
            domains=["empresa.com.br"],
            reason="refresh",
            source="results_selection",
        )
        self.assertEqual(updated, 0)

        suppressions = self.service.list_suppressions("org-a")
        self.assertEqual(len(suppressions), 3)
        self.assertTrue(any(item["cnpj"] == "12345678000190" for item in suppressions))
        self.assertTrue(any(item["email"] == "contato@empresa.com" for item in suppressions))
        self.assertTrue(any(item["domain"] == "empresa.com.br" for item in suppressions))

        suppression_id = next(item["id"] for item in suppressions if item["email"] == "contato@empresa.com")
        self.assertTrue(self.service.remove_suppression("org-a", suppression_id))
        self.assertEqual(len(self.service.list_suppressions("org-a")), 2)


if __name__ == "__main__":
    unittest.main()
