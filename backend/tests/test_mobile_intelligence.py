import asyncio
import importlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


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
                    email_receita VARCHAR,
                    email_enriquecido VARCHAR,
                    email_final VARCHAR,
                    telefone_receita VARCHAR,
                    telefone_final VARCHAR,
                    telefone_enriquecido VARCHAR,
                    whatsapp_publico VARCHAR,
                    whatsapp_enriquecido VARCHAR,
                    whatsapp_final VARCHAR,
                    outras_informacoes VARCHAR,
                    telefones_captados VARCHAR,
                    whatsapps_captados VARCHAR,
                    socios_estruturado VARCHAR,
                    linkedin_empresa VARCHAR,
                    redes_sociais_empresa VARCHAR,
                    redes_sociais_socios VARCHAR
                )
                """
            )
            conn.execute("DELETE FROM prospect_base")
            conn.executemany(
                """
                INSERT INTO prospect_base VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        "15103354000139",
                        "DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA",
                        "DEODE",
                        "JUIZ DE FORA",
                        "MG",
                        "https://deodenergia.com",
                        "contato@deodenergia.com",
                        "comercial@deodenergia.com",
                        "comercial@deodenergia.com",
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
                        "https://www.linkedin.com/company/deode/",
                        json.dumps(["https://www.instagram.com/deodeenergia/"]),
                        json.dumps([]),
                    ),
                    (
                        "03023889000110",
                        "EMPRESA SEM MOBILE LTDA",
                        "SEM MOBILE",
                        "BELO HORIZONTE",
                        "MG",
                        "https://sem-mobile.com.br",
                        None,
                        None,
                        None,
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
                        None,
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
                        None,
                        "contato@rumolog.com",
                        "contato@rumolog.com",
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
                        None,
                        json.dumps([]),
                        json.dumps([]),
                    ),
                    (
                        "11876543000121",
                        "DOMINIO FALLBACK LTDA",
                        "DOMINIO FALLBACK",
                        "SAO PAULO",
                        "SP",
                        None,
                        None,
                        None,
                        "atendimento@dominio-fallback.com.br",
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                        json.dumps([]),
                        json.dumps([]),
                        json.dumps([]),
                        None,
                        json.dumps([]),
                        json.dumps([]),
                    ),
                ],
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS company_domains (
                    cnpj VARCHAR PRIMARY KEY,
                    domain VARCHAR,
                    site_url VARCHAR,
                    domain_source VARCHAR,
                    source_url VARCHAR,
                    linkedin_company VARCHAR,
                    email_pattern VARCHAR,
                    pattern_confidence DOUBLE,
                    metadata_json VARCHAR,
                    generated_at TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS company_contacts (
                    cnpj VARCHAR,
                    contact_name VARCHAR,
                    role VARCHAR,
                    linkedin_url VARCHAR,
                    source_label VARCHAR,
                    generated_at TIMESTAMP
                )
                """
            )
            conn.execute("DELETE FROM company_domains")
            conn.execute("DELETE FROM company_contacts")
            conn.execute(
                """
                INSERT INTO company_domains (
                    cnpj, domain, site_url, domain_source, source_url, linkedin_company,
                    email_pattern, pattern_confidence, metadata_json, generated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                [
                    "03023889000110",
                    "sem-mobile.com.br",
                    "https://sem-mobile.com.br",
                    "site",
                    "https://sem-mobile.com.br",
                    "https://www.linkedin.com/company/sem-mobile/",
                    "first.last",
                    0.88,
                    json.dumps(
                        {
                            "domain_profile": {
                                "company_profiles": [
                                    {"type": "linkinbio", "url": "https://linktr.ee/semmobile"},
                                    {"type": "instagram", "url": "https://www.instagram.com/semmobile/"},
                                ]
                            },
                            "contacts": [
                                {
                                    "name": "CARLOS MENDES",
                                    "role": "Diretor Comercial",
                                    "linkedin": "https://www.linkedin.com/in/carlos-mendes-semmobile/",
                                    "source": "Contact intelligence",
                                }
                            ],
                        }
                    ),
                ],
            )
            conn.execute(
                """
                INSERT INTO company_contacts (
                    cnpj, contact_name, role, linkedin_url, source_label, generated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                [
                    "03023889000110",
                    "CARLOS MENDES",
                    "Diretor Comercial",
                    "https://www.linkedin.com/in/carlos-mendes-semmobile/",
                    "Contact intelligence",
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

    def test_mobile_waterfall_probes_site_from_corporate_email_domain(self):
        async def fake_verifier(numbers, max_batch=10):
            return {
                "5531998877665": {
                    "valido": True,
                    "numero_limpo": "5531998877665",
                    "score": 1.0,
                    "metodo": "evolution_api",
                }
            }

        site_probe = AsyncMock(
            return_value={
                "site": "https://dominio-fallback.com.br",
                "whatsapp": "(31) 99887-7665",
                "telefone": "(31) 3344-5566",
                "source": "Site fallback",
            }
        )
        external_probe = AsyncMock(return_value={})

        with (
            patch("api.mobile_intelligence._probe_site_contacts", site_probe),
            patch("api.mobile_intelligence._probe_external_whatsapp_search", external_probe),
            patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier),
        ):
            payload = asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "11876543000121",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )

        site_probe.assert_awaited_once_with("https://dominio-fallback.com.br")
        external_probe.assert_not_awaited()
        candidates = {item["normalized_phone"]: item for item in payload["candidates"]}
        self.assertIn("5531998877665", candidates)
        self.assertEqual(candidates["5531998877665"]["source_url"], "https://dominio-fallback.com.br")
        self.assertEqual(payload["summary"]["verified_whatsapp_candidates"], 1)

    def test_mobile_waterfall_uses_external_search_when_site_probe_stays_empty(self):
        async def fake_verifier(numbers, max_batch=10):
            return {
                "5531996665555": {
                    "valido": True,
                    "numero_limpo": "5531996665555",
                    "score": 1.0,
                    "metodo": "evolution_api",
                }
            }

        site_probe = AsyncMock(return_value={})
        external_probe = AsyncMock(
            return_value={
                "whatsapp": "(31) 99666-5555",
                "whatsapp_source": "Google Maps",
                "phone": "(31) 3333-4444",
                "phone_source": "Google Maps",
            }
        )

        with (
            patch("api.mobile_intelligence._probe_site_contacts", site_probe),
            patch("api.mobile_intelligence._probe_external_whatsapp_search", external_probe),
            patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier),
        ):
            payload = asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "03023889000110",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )

        awaited_urls = [call.args[0] for call in site_probe.await_args_list]
        self.assertIn("https://sem-mobile.com.br", awaited_urls)
        external_probe.assert_awaited_once()
        candidates = {item["normalized_phone"]: item for item in payload["candidates"]}
        self.assertIn("5531996665555", candidates)
        self.assertTrue(candidates["5531996665555"]["verified_whatsapp"])
        self.assertEqual(candidates["5531996665555"]["source_label"], "Google Maps")

    def test_mobile_waterfall_uses_cached_profiles_and_decision_maker_search(self):
        async def fake_verifier(numbers, max_batch=10):
            return {
                "5531997778888": {
                    "valido": True,
                    "numero_limpo": "5531997778888",
                    "score": 1.0,
                    "metodo": "evolution_api",
                }
            }

        async def fake_profile_probe(url):
            if url == "https://linktr.ee/semmobile":
                return {"site": "https://linktr.ee/semmobile", "whatsapp": "(31) 99777-8888", "source": "HTTPX"}
            return {}

        profile_probe = AsyncMock(side_effect=fake_profile_probe)
        decision_probe = AsyncMock(return_value=[])
        external_probe = AsyncMock(return_value={})

        with (
            patch("api.mobile_intelligence._probe_site_contacts", profile_probe),
            patch("api.mobile_intelligence._probe_decision_maker_public_search", decision_probe),
            patch("api.mobile_intelligence._probe_external_whatsapp_search", external_probe),
            patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier),
        ):
            payload = asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "03023889000110",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )

        awaited_urls = [call.args[0] for call in profile_probe.await_args_list]
        self.assertIn("https://sem-mobile.com.br", awaited_urls)
        self.assertIn("https://linktr.ee/semmobile", awaited_urls)
        decision_probe.assert_awaited()
        candidates = {item["normalized_phone"]: item for item in payload["candidates"]}
        self.assertIn("5531997778888", candidates)
        self.assertTrue(candidates["5531997778888"]["verified_whatsapp"])
        self.assertEqual(candidates["5531997778888"]["source_label"], "Link in bio")

    def test_collect_site_candidates_discards_mismatched_generic_domain(self):
        candidates = self.mobile_intelligence._collect_site_candidates(
            {
                "razao_social": "MAIS EPI E COMERCIO DE MAQUINAS-FERRAMENTAS LTDA",
                "nome_fantasia": None,
                "site": "https://www.maisgoias.com.br/",
                "email_final": None,
                "email_enriquecido": None,
                "email_receita": None,
                "outras_informacoes": None,
            }
        )

        self.assertEqual(candidates, [])

    def test_mobile_waterfall_uses_cached_contact_target_for_public_decision_probe(self):
        async def fake_verifier(numbers, max_batch=10):
            return {
                "5531988887777": {
                    "valido": True,
                    "numero_limpo": "5531988887777",
                    "score": 1.0,
                    "metodo": "evolution_api",
                }
            }

        site_probe = AsyncMock(return_value={})
        external_probe = AsyncMock(return_value={})
        decision_probe = AsyncMock(
            return_value=[
                {
                    "phone": "(31) 98888-7777",
                    "source_label": "Instagram decisor",
                    "source_url": "https://www.instagram.com/semmobile/",
                    "contact_name": "CARLOS MENDES",
                    "contact_role": "Diretor Comercial",
                    "contact_level": "decision_maker",
                    "kind": "whatsapp",
                    "confidence": 0.86,
                }
            ]
        )

        with (
            patch("api.mobile_intelligence._probe_site_contacts", site_probe),
            patch("api.mobile_intelligence._probe_decision_maker_public_search", decision_probe),
            patch("api.mobile_intelligence._probe_external_whatsapp_search", external_probe),
            patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier),
        ):
            payload = asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "03023889000110",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )

        decision_probe.assert_awaited()
        first_target = decision_probe.await_args_list[0].args[0]
        self.assertEqual(first_target["name"], "CARLOS MENDES")
        self.assertEqual(first_target["role"], "Diretor Comercial")
        candidates = {item["normalized_phone"]: item for item in payload["candidates"]}
        self.assertIn("5531988887777", candidates)
        self.assertEqual(candidates["5531988887777"]["contact_level"], "decision_maker")
        self.assertTrue(candidates["5531988887777"]["verified_whatsapp"])

    def test_mobile_waterfall_bootstraps_contact_intelligence_when_cache_is_missing(self):
        async def fake_verifier(numbers, max_batch=10):
            return {}

        site_probe = AsyncMock(return_value={})
        external_probe = AsyncMock(return_value={})
        decision_probe = AsyncMock(return_value=[])
        contact_bootstrap = AsyncMock(return_value={"contacts": []})

        with (
            patch("api.mobile_intelligence._probe_site_contacts", site_probe),
            patch("api.mobile_intelligence._probe_external_whatsapp_search", external_probe),
            patch("api.mobile_intelligence._probe_decision_maker_public_search", decision_probe),
            patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier),
            patch("api.contact_intelligence.contact_intelligence_service.resolve_company_intelligence", contact_bootstrap),
        ):
            asyncio.run(
                self.service.resolve_company_mobile_waterfall(
                    "11876543000121",
                    refresh=True,
                    verify_whatsapp=True,
                )
            )

        contact_bootstrap.assert_awaited_once_with("11876543000121", probe_smtp=False)

    def test_health_center_flags_gaps_for_watchlist(self):
        async def fake_verifier(numbers, max_batch=10):
            return {}

        site_probe = AsyncMock(return_value={})
        external_probe = AsyncMock(return_value={})

        with (
            patch("api.mobile_intelligence._probe_site_contacts", site_probe),
            patch("api.mobile_intelligence._probe_external_whatsapp_search", external_probe),
            patch("api.mobile_intelligence.verificar_whatsapp_lote", fake_verifier),
        ):
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
