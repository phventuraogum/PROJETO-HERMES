import contextlib
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api.jobs_enhanced import enrich_company_by_cnpj_enhanced


class JobsEnhancedTests(unittest.TestCase):
    def test_uses_complete_enrichment_service_without_fallback(self):
        service_calls = []
        persisted = []
        cache_sets = []

        class FakeReadResult:
            def fetchone(self):
                return (
                    "12345678000199",
                    "EMPRESA TESTE LTDA",
                    "Empresa Teste",
                    "BELO HORIZONTE",
                    "MG",
                    "8640201",
                    "https://empresa.com.br",
                    "contato@receita.com.br",
                    None,
                    None,
                    None,
                    None,
                    None,
                )

            def fetchall(self):
                return [("MARIA TESTE",), ("JOAO TESTE",)]

        class FakeConn:
            def execute(self, sql, params=None):
                if "FROM vw_prospeccao_base" in sql or "FROM socios" in sql:
                    return FakeReadResult()
                persisted.append((sql, params))
                return self

        fake_conn = FakeConn()

        @contextlib.contextmanager
        def fake_get_connection(read_only=True):
            yield fake_conn

        class FakeService:
            async def enrich_company_complete(self, **kwargs):
                service_calls.append(kwargs)
                return {
                    "site": "https://empresa.com.br",
                    "contatos_web": {
                        "email_enriquecido": "contato@empresa.com.br",
                        "telefone_enriquecido": "(31) 3333-4444",
                    },
                    "whatsapp_ultra": {"numero": "5531999999999", "fonte": "Instagram Bio"},
                    "instagram": {"url": "https://instagram.com/empresa"},
                }

        fake_enrichment_module = types.ModuleType("api.enrichment_service")
        fake_enrichment_module.EnrichmentService = lambda: FakeService()

        fake_db_module = types.ModuleType("api.db_pool")
        fake_db_module.get_connection = fake_get_connection

        fake_merge_module = types.ModuleType("api.enrichment_merge")
        fake_merge_module.merge_enrichment_payload = lambda existing, payload: {
            **existing,
            "site": payload.get("site") or existing.get("site"),
            "email_enriquecido": (payload.get("contatos_web") or {}).get("email_enriquecido"),
            "telefone_enriquecido": (payload.get("contatos_web") or {}).get("telefone_enriquecido"),
            "whatsapp_publico": None,
            "whatsapp_enriquecido": (payload.get("whatsapp_ultra") or {}).get("numero"),
            "outras_informacoes": "Instagram",
        }

        fake_cache_service_module = types.ModuleType("api.cache_service")

        class FakeCacheService:
            def set(self, prefix, value, ttl=None, **kwargs):
                cache_sets.append((prefix, value, ttl, kwargs))
                return True

        fake_cache_service_module.cache_service = FakeCacheService()

        fake_jobs_module = types.ModuleType("api.jobs")

        def _unexpected_fallback(_cnpj):
            raise AssertionError("fallback basico nao deveria ser usado")

        fake_jobs_module.enrich_company_by_cnpj = _unexpected_fallback

        with mock.patch.dict(
            sys.modules,
            {
                "api.enrichment_service": fake_enrichment_module,
                "api.db_pool": fake_db_module,
                "api.enrichment_merge": fake_merge_module,
                "api.cache_service": fake_cache_service_module,
                "api.jobs": fake_jobs_module,
            },
        ):
            result = enrich_company_by_cnpj_enhanced("12345678000199")

        self.assertEqual(result["status"], "enriched")
        self.assertEqual(result["email"], "contato@empresa.com.br")
        self.assertEqual(result["whatsapp"], "5531999999999")
        self.assertEqual(service_calls[0]["cnae"], "8640201")
        self.assertEqual(service_calls[0]["site"], "https://empresa.com.br")
        self.assertEqual(service_calls[0]["socios"], ["MARIA TESTE", "JOAO TESTE"])
        insert_sql = next(sql for sql, _ in persisted if "INSERT OR REPLACE" in sql)
        self.assertIn("email_enriquecido", insert_sql)
        self.assertIn("whatsapp_enriquecido", insert_sql)
        self.assertEqual(cache_sets[0][0], "whatsapp_ultra_company")
        self.assertEqual(cache_sets[0][3]["cnpj"], "12345678000199")


if __name__ == "__main__":
    unittest.main()
