import contextlib
import re
import sys
import types
import unittest
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api.jobs_enhanced import enrich_company_by_cnpj_enhanced, resolve_contact_intelligence_job


def _normalizar_whatsapp_br(numero: str | None) -> str | None:
    digits = re.sub(r"[^\d]", "", str(numero or ""))
    if not digits:
        return None
    if digits.startswith("55"):
        digits = digits[2:]
    if len(digits) == 10:
        digits = digits[:2] + "9" + digits[2:]
    if len(digits) != 11:
        return None
    return "55" + digits


class JobsEnhancedTests(unittest.TestCase):
    def _run_job(self, *, service_result, merge_result, validation_results):
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
                    "(31) 3333-4444",
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
                return service_result

        fake_enrichment_module = types.ModuleType("api.enrichment_service")
        fake_enrichment_module.EnrichmentService = lambda: FakeService()

        fake_db_module = types.ModuleType("api.db_pool")
        fake_db_module.get_connection = fake_get_connection
        fake_db_module.close_all_connections = lambda: None

        fake_merge_module = types.ModuleType("api.enrichment_merge")
        fake_merge_module.merge_enrichment_payload = lambda existing, payload: {
            **existing,
            **merge_result(existing, payload),
        }

        fake_cache_service_module = types.ModuleType("api.cache_service")

        class FakeCacheService:
            def set(self, prefix, value, ttl=None, **kwargs):
                cache_sets.append((prefix, value, ttl, kwargs))
                return True

        fake_cache_service_module.cache_service = FakeCacheService()

        fake_validation_module = types.ModuleType("api.validation_service")
        fake_validation_module.normalizar_whatsapp_br = _normalizar_whatsapp_br

        async def _fake_verificar_whatsapp_lote(numeros, max_batch=50):
            resultado = {}
            for numero in numeros:
                resultado[numero] = validation_results.get(
                    numero,
                    {"valido": False, "metodo": "evolution_api_rejected", "score": 0.0},
                )
            return resultado

        fake_validation_module.verificar_whatsapp_lote = _fake_verificar_whatsapp_lote

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
                "api.validation_service": fake_validation_module,
                "api.jobs": fake_jobs_module,
            },
        ):
            result = enrich_company_by_cnpj_enhanced("12345678000199")

        return result, service_calls, persisted, cache_sets

    def test_uses_complete_enrichment_service_without_fallback(self):
        result, service_calls, persisted, cache_sets = self._run_job(
            service_result={
                "site": "https://empresa.com.br",
                "contatos_web": {
                    "email_enriquecido": "contato@empresa.com.br",
                    "telefone_enriquecido": "(31) 3333-4444",
                },
                "whatsapp_ultra": {"numero": "5531999999999", "fonte": "Instagram Bio"},
                "instagram": {"url": "https://instagram.com/empresa"},
            },
            merge_result=lambda existing, payload: {
                "site": payload.get("site") or existing.get("site"),
                "email_enriquecido": (payload.get("contatos_web") or {}).get("email_enriquecido"),
                "telefone_enriquecido": (payload.get("contatos_web") or {}).get("telefone_enriquecido"),
                "whatsapp_publico": None,
                "whatsapp_enriquecido": (payload.get("whatsapp_ultra") or {}).get("numero"),
                "whatsapps_captados": [
                    {"valor": "5531999999999", "origem": "Instagram Bio", "validado": False}
                ],
                "telefones_captados": [
                    {"valor": "(31) 3333-4444", "origem": "Core Scraper"}
                ],
                "socios_estruturado": [{"nome": "MARIA TESTE", "telefone": "(31) 98888-7777"}],
                "outras_informacoes": "Instagram",
            },
            validation_results={
                "5531999999999": {"valido": True, "metodo": "evolution_api", "score": 1.0}
            },
        )

        self.assertEqual(result["status"], "enriched")
        self.assertEqual(result["email"], "contato@empresa.com.br")
        self.assertEqual(result["whatsapp"], "5531999999999")
        self.assertEqual(service_calls[0]["cnae"], "8640201")
        self.assertEqual(service_calls[0]["site"], "https://empresa.com.br")
        self.assertEqual(service_calls[0]["socios"], ["MARIA TESTE", "JOAO TESTE"])
        insert_sql, insert_params = next((sql, params) for sql, params in persisted if "INSERT OR REPLACE" in sql)
        self.assertIn("email_enriquecido", insert_sql)
        self.assertIn("whatsapp_enriquecido", insert_sql)
        self.assertIn("5531999999999", insert_params)
        self.assertEqual(cache_sets[0][0], "whatsapp_ultra_company")
        self.assertEqual(cache_sets[0][3]["cnpj"], "12345678000199")
        self.assertTrue(cache_sets[0][1]["whatsapp"]["validado"])

    def test_promotes_validated_whatsapp_from_phone_candidates(self):
        result, _service_calls, persisted, cache_sets = self._run_job(
            service_result={
                "site": "https://empresa.com.br",
                "contatos_web": {
                    "email_enriquecido": "contato@empresa.com.br",
                    "telefone_enriquecido": "(31) 3333-4444",
                },
                "instagram": {"url": "https://instagram.com/empresa"},
            },
            merge_result=lambda existing, payload: {
                "site": payload.get("site") or existing.get("site"),
                "email_enriquecido": (payload.get("contatos_web") or {}).get("email_enriquecido"),
                "telefone_enriquecido": (payload.get("contatos_web") or {}).get("telefone_enriquecido"),
                "whatsapp_publico": None,
                "whatsapp_enriquecido": None,
                "whatsapps_captados": None,
                "telefones_captados": [
                    {"valor": "(31) 98888-7777", "origem": "Core Scraper"},
                    {"valor": "(31) 97777-6666", "origem": "OpenCNPJ"},
                ],
                "socios_estruturado": [{"nome": "MARIA TESTE", "telefone": "(31) 96666-5555"}],
                "outras_informacoes": None,
            },
            validation_results={
                "5531988887777": {"valido": True, "metodo": "evolution_api", "score": 1.0},
                "5531977776666": {"valido": False, "metodo": "evolution_api_rejected", "score": 0.0},
                "5531966665555": {"valido": False, "metodo": "evolution_api_rejected", "score": 0.0},
            },
        )

        self.assertEqual(result["status"], "enriched")
        self.assertEqual(result["whatsapp"], "5531988887777")
        _insert_sql, insert_params = next((sql, params) for sql, params in persisted if "INSERT OR REPLACE" in sql)
        self.assertIn("5531988887777", insert_params)
        self.assertEqual(cache_sets[0][1]["whatsapp"]["numero"], "5531988887777")
        self.assertTrue(cache_sets[0][1]["whatsapp"]["validado"])

    def test_resolve_contact_intelligence_job_updates_status_and_returns_summary(self):
        statuses = []
        service_calls = []

        async def _fake_resolve(cnpj, probe_smtp=False):
            service_calls.append({"cnpj": cnpj, "probe_smtp": probe_smtp})
            return {
                "company": {"cnpj": cnpj},
                "summary": {"decision_makers": 2, "verified": 1},
            }

        class FakeContactIntelligenceService:
            def get_cached_company_intelligence(self, cnpj):
                self.last_cached_cnpj = cnpj
                return None

            resolve_company_intelligence = staticmethod(_fake_resolve)

        fake_contact_module = types.ModuleType("api.contact_intelligence")
        fake_contact_module.contact_intelligence_service = FakeContactIntelligenceService()

        fake_queue_module = types.ModuleType("api.contact_intelligence_queue")

        def _fake_build_status(cnpj, **kwargs):
            payload = {"cnpj": cnpj, "updated_at": "2026-03-11T12:00:00+00:00", **kwargs}
            return payload

        def _fake_set_status(cnpj, payload):
            statuses.append((cnpj, payload))
            return True

        fake_queue_module.build_contact_intelligence_status = _fake_build_status
        fake_queue_module.set_contact_intelligence_status = _fake_set_status

        fake_db_module = types.ModuleType("api.db_pool")
        fake_db_module.close_all_connections = lambda: None

        with mock.patch.dict(
            sys.modules,
            {
                "api.contact_intelligence": fake_contact_module,
                "api.contact_intelligence_queue": fake_queue_module,
                "api.db_pool": fake_db_module,
            },
        ):
            result = resolve_contact_intelligence_job(
                "12345678000199",
                probe_smtp=True,
                refresh=False,
            )

        self.assertEqual(result["status"], "completed")
        self.assertFalse(result["cached"])
        self.assertEqual(result["summary"]["decision_makers"], 2)
        self.assertEqual(service_calls[0]["cnpj"], "12345678000199")
        self.assertTrue(service_calls[0]["probe_smtp"])
        self.assertEqual(statuses[0][1]["status"], "running")
        self.assertEqual(statuses[-1][1]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
