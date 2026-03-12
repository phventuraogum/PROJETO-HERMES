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

    def test_saved_searches_support_search_and_dynamic_kinds(self):
        created = self.service.create_saved_search(
            "org-a",
            name="Administradoras MG",
            description="Busca principal",
            kind="dynamic_list",
            config={
                "termo_base": "administradora",
                "ufs": ["MG"],
                "limite_empresas": 25,
                "enriquecimento_web": True,
            },
            source="query_workbench",
        )

        self.assertEqual(created["kind"], "dynamic")
        self.assertEqual(created["config"]["termo_base"], "administradora")

        listed = self.service.list_saved_searches("org-a")
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["id"], created["id"])

        dynamic_only = self.service.list_saved_searches("org-a", kind="dynamic")
        self.assertEqual(len(dynamic_only), 1)
        self.assertEqual(dynamic_only[0]["kind"], "dynamic")

        updated = self.service.update_saved_search(
            "org-a",
            created["id"],
            name="Administradoras Brasil",
            description="Rodada nacional",
            config={"termo_base": "administradora", "ufs": ["MG", "SP"]},
            source="lead_lists_page",
        )
        self.assertTrue(updated)

        saved = self.service.get_saved_search("org-a", created["id"])
        self.assertIsNotNone(saved)
        assert saved is not None
        self.assertEqual(saved["name"], "Administradoras Brasil")
        self.assertEqual(saved["config"]["ufs"], ["MG", "SP"])

        self.assertTrue(self.service.touch_saved_search_run("org-a", created["id"]))
        saved_after_run = self.service.get_saved_search("org-a", created["id"])
        assert saved_after_run is not None
        self.assertIsNotNone(saved_after_run["last_run_at"])

        self.assertTrue(self.service.delete_saved_search("org-a", created["id"]))
        self.assertEqual(self.service.list_saved_searches("org-a"), [])

    def test_watchlist_generates_signals_from_snapshot_changes(self):
        company = {
            "cnpj": "15.103.354/0001-39",
            "razao_social": "DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA",
            "nome_fantasia": "DEODE",
            "cidade": "Juiz de Fora",
            "uf": "MG",
        }

        watch = self.service.upsert_watch_company("org-a", company, reason="monitorar decisores", source="manual")
        self.assertEqual(watch["cnpj"], "15103354000139")

        first_sync = self.service.sync_watch_snapshot(
            "org-a",
            "15103354000139",
            {
                "has_site": True,
                "has_email": True,
                "has_phone": True,
                "has_whatsapp": True,
                "has_whatsapp_validated": True,
                "decision_makers": 3,
                "deliverable_emails": 2,
                "total_contact_emails": 4,
                "public_email_count": 2,
                "whatsapp_candidates": 2,
                "validated_whatsapp_candidates": 1,
                "email_pattern": "first.last",
            },
        )

        first_signal_types = {item["signal_type"] for item in first_sync["signals"]}
        self.assertIn("watch_started", first_signal_types)
        self.assertIn("site_detected", first_signal_types)
        self.assertIn("whatsapp_validated", first_signal_types)
        self.assertIn("decision_makers_increased", first_signal_types)
        self.assertIn("deliverable_emails_increased", first_signal_types)
        self.assertIn("email_pattern_resolved", first_signal_types)

        second_sync = self.service.sync_watch_snapshot(
            "org-a",
            "15103354000139",
            {
                "has_site": True,
                "has_email": True,
                "has_phone": True,
                "has_whatsapp": True,
                "has_whatsapp_validated": True,
                "has_linkedin_company": True,
                "decision_makers": 5,
                "deliverable_emails": 4,
                "total_contact_emails": 6,
                "public_email_count": 3,
                "whatsapp_candidates": 3,
                "validated_whatsapp_candidates": 2,
                "email_pattern": "first.last",
            },
        )
        second_signal_types = {item["signal_type"] for item in second_sync["signals"]}
        self.assertIn("linkedin_company_detected", second_signal_types)
        self.assertIn("decision_makers_increased", second_signal_types)
        self.assertIn("validated_whatsapp_candidates_increased", second_signal_types)

        watchlist = self.service.list_watchlist("org-a")
        self.assertEqual(len(watchlist), 1)
        self.assertEqual(watchlist[0]["snapshot"]["decision_makers"], 5)
        self.assertGreaterEqual(watchlist[0]["signal_count"], len(first_sync["signals"]) + len(second_sync["signals"]))

        signals = self.service.list_company_signals("org-a", cnpj="15103354000139", limit=50)
        self.assertGreaterEqual(len(signals), len(first_sync["signals"]) + len(second_sync["signals"]))

        self.assertTrue(self.service.delete_watch_company("org-a", "15.103.354/0001-39"))
        self.assertEqual(self.service.list_watchlist("org-a"), [])
        self.assertEqual(self.service.list_company_signals("org-a", cnpj="15103354000139"), [])


if __name__ == "__main__":
    unittest.main()
