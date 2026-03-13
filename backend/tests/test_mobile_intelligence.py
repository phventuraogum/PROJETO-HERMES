import asyncio
import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class MobileIntelligenceTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "mobile-intelligence.duckdb")
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
        self.mobile_intelligence = importlib.import_module("api.mobile_intelligence")
        importlib.reload(self.mobile_intelligence)

        self.registry = self.lead_registry.lead_registry_service
        self.service = self.mobile_intelligence.mobile_intelligence_service
        self._seed_database()

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

    def _seed_database(self):
        self.registry.ensure_schema()
        with self.db_pool.get_connection(read_only=False) as conn:
            conn.execute("DROP VIEW IF EXISTS vw_prospeccao_base")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS prospect_base (
                    cnpj VARCHAR,
                    razao_social VARCHAR,
                    nome_fantasia VARCHAR,
                    cidade_nome VARCHAR,
                    uf VARCHAR,
                    site VARCHAR,
                    telefone_receita VARCHAR,
                    telefone_final VARCHAR,
                    telefone_enriquecido VARCHAR,
                    whatsapp_publico VARCHAR,
                    whatsapp_enriquecido VARCHAR,
                    whatsapp_final VARCHAR,
                    outras_informacoes VARCHAR,
                    telefones_captados VARCHAR,
                    whatsapps_captados VARCHAR,
                    socios_estruturado VARCHAR
                )
                """
            )
            conn.execute("DELETE FROM prospect_base")
            conn.executemany(
                """
                INSERT INTO prospect_base VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        "15103354000139",
                        "DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA",
                        "DEODE",
                        "JUIZ DE FORA",
                        "MG",
                        "https://deodenergia.com",
                        "3232560690",
                        "3230256069",
                        "32988445566",
                        None,
                        None,
                        None,
                        None,
                        json.dumps(
                            [
                                {"valor": "32999910001", "origem": "Instagram Bio"},
                                {"valor": "(32) 3025-6069", "origem": "Receita Base"},
                            ]
                        ),
                        json.dumps(
                            [
                                {"valor": "5532999910001", "origem": "Instagram Bio", "validado": False},
                            ]
                        ),
                        json.dumps(
                            [
                                {
                                    "nome": "ANA PAULA SILVA",
                                    "qualificacao": "Socio-Administrador",
                                    "telefone": "32988112233",
                                    "whatsapp": None,
                                }
                            ]
                        ),
                    ),
                    (
                        "03023889000110",
                        "EMPRESA SEM MOBILE LTDA",
                        "SEM MOBILE",
                        "BELO HORIZONTE",
                        "MG",
                        "https://sem-mobile.com.br",
                        "3133334444",
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                        json.dumps([]),
                        json.dumps([]),
                        json.dumps([]),
                    ),
                    (
                        "02387241000160",
                        "RUMO S.A",
                        "RUMO",
                        "CURITIBA",
                        "PR",
                        "https://ri.rumolog.com/en/",
                        "4134238000",
                        "(41) 3423-8000",
                        None,
                        None,
                        None,
                        None,
                        "Fale com nosso chatbot no WhatsApp (14) 92003-0379 ou com o gerente comercial no celular 11999887766.",
                        json.dumps([]),
                        json.dumps([]),
                        json.dumps([]),
                    ),
                ],
            )
            conn.execute(
                """
                CREATE VIEW vw_prospeccao_base AS
                SELECT * FROM prospect_base
                """
            )

        self.registry.upsert_watch_company(
            "org-a",
            {
                "cnpj": "15103354000139",
                "razao_social": "DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA",
                "nome_fantasia": "DEODE",
                "cidade": "JUIZ DE FORA",
                "uf": "MG",
            },
            source="manual",
        )
        self.registry.upsert_watch_company(
            "org-a",
            {
                "cnpj": "03023889000110",
                "razao_social": "EMPRESA SEM MOBILE LTDA",
                "nome_fantasia": "SEM MOBILE",
                "cidade": "BELO HORIZONTE",
                "uf": "MG",
            },
            source="manual",
        )

    def test_resolve_mobile_waterfall_persists_verified_whatsapp(self):
        async def fake_verifier(numbers, max_batch=10):
            return {
                "5532999910001": {
                    "valido": True,
                    "numero_limpo": "5532999910001",
                    "score": 1.0,
                    "metodo": "evolution_api",
                }
            }

        with patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier):
            payload = asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "15.103.354/0001-39",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )

        self.assertEqual(payload["cnpj"], "15103354000139")
        self.assertGreaterEqual(payload["summary"]["mobile_candidates"], 2)
        self.assertEqual(payload["summary"]["verified_whatsapp_candidates"], 1)
        self.assertTrue(any(item["verified_whatsapp"] for item in payload["candidates"]))
        self.assertTrue(any(item["contact_level"] == "decision_maker" for item in payload["candidates"]))

        cached = self.service.get_cached_mobile_waterfall("15103354000139")
        self.assertIsNotNone(cached)
        assert cached is not None
        self.assertEqual(cached["summary"]["verified_whatsapp_candidates"], 1)

    def test_mobile_waterfall_uses_final_phone_and_contextual_other_info(self):
        async def fake_verifier(numbers, max_batch=10):
            return {
                "5514920030379": {
                    "valido": True,
                    "numero_limpo": "5514920030379",
                    "score": 1.0,
                    "metodo": "evolution_api",
                }
            }

        with patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier):
            payload = asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "02387241000160",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )

        candidates = {item["normalized_phone"]: item for item in payload["candidates"]}
        self.assertIn("554134238000", candidates)
        self.assertIn("5514920030379", candidates)
        self.assertIn("5511999887766", candidates)
        self.assertEqual(payload["summary"]["verified_whatsapp_candidates"], 1)
        self.assertGreaterEqual(payload["summary"]["mobile_candidates"], 2)
        self.assertTrue(candidates["5514920030379"]["verified_whatsapp"])
        self.assertEqual(candidates["5514920030379"]["phone_type"], "whatsapp_verified")

    def test_health_center_flags_gaps_for_watchlist(self):
        async def fake_verifier(numbers, max_batch=10):
            return {}

        with patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier):
            asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "15103354000139",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )
            asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "03023889000110",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )

        health = self.service.get_health_center("org-a", limit=10)
        self.assertEqual(health["summary"]["watchlist_total"], 2)
        self.assertGreaterEqual(health["summary"]["without_mobile"], 1)
        self.assertGreaterEqual(health["summary"]["without_verified_whatsapp"], 1)
        self.assertEqual(len(health["items"]), 2)
        self.assertTrue(any(item["cnpj"] == "03023889000110" and item["gap_score"] >= 2 for item in health["items"]))


if __name__ == "__main__":
    unittest.main()
