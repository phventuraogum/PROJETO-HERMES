import contextlib
import sys
import unittest
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api.routers import empresas as empresas_router


class EmpresasRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_buscar_empresa_handles_legacy_enrichment_schema(self):
        executed_sql = []

        class FakeResult:
            def __init__(self, rows):
                self.rows = rows

            def fetchone(self):
                return self.rows[0] if self.rows else None

            def fetchall(self):
                return self.rows

        class FakeConn:
            def execute(self, sql, params=None):
                executed_sql.append(sql)
                if "PRAGMA table_info('empresas_enriquecidas')" in sql:
                    return FakeResult(
                        [
                            (0, "cnpj"),
                            (1, "site"),
                            (2, "email_enriquecido"),
                            (3, "telefone_enriquecido"),
                            (4, "whatsapp_publico"),
                            (5, "whatsapp_enriquecido"),
                            (6, "outras_informacoes"),
                        ]
                    )

                return FakeResult(
                    [
                        (
                            "12345678000190",
                            "EMPRESA TESTE LTDA",
                            "Empresa Teste",
                            "BELO HORIZONTE",
                            "MG",
                            "8640201",
                            "ATIVA",
                            "100.000,00",
                            100000.0,
                            "(31) 3333-4444",
                            "contato@receita.com.br",
                            "https://empresa.com.br",
                            "contato@empresa.com.br",
                            "(31) 99999-0000",
                            "5531999990000",
                            None,
                            None,
                            None,
                        )
                    ]
                )

        @contextlib.contextmanager
        def fake_get_connection(read_only=True):
            yield FakeConn()

        with mock.patch.object(
            empresas_router,
            "validar_cnpj",
            return_value=(True, "12345678000190"),
        ), mock.patch.object(empresas_router, "get_connection", fake_get_connection):
            result = await empresas_router.buscar_empresa(
                "12345678000190",
                incluir_enriquecimento=False,
                incluir_scores=False,
                _user={},
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["empresa"]["site"], "https://empresa.com.br")
        self.assertEqual(result["empresa"]["enriquecimento_ia"], None)
        self.assertEqual(result["empresa"]["enriquecimento_data"], None)
        self.assertTrue(any("NULL as enriquecimento_ia" in sql for sql in executed_sql))
        self.assertFalse(any("ew.enriquecimento_ia" in sql for sql in executed_sql))

    async def test_enriquecer_empresa_awaits_service_with_cnae(self):
        service_calls = []

        class FakeReadResult:
            def fetchone(self):
                return (
                    "12345678000190",
                    "EMPRESA TESTE LTDA",
                    "Empresa Teste",
                    "BELO HORIZONTE",
                    "MG",
                    "8640201",
                )

        class FakeConn:
            def execute(self, sql, params=None):
                self.sql = sql
                self.params = params
                return FakeReadResult()

        @contextlib.contextmanager
        def fake_get_connection(read_only=True):
            yield FakeConn()

        async def fake_enrich_company_complete(**kwargs):
            service_calls.append(kwargs)
            return {
                "site": "https://empresa.com.br",
                "contatos_web": {
                    "email_enriquecido": "contato@empresa.com.br",
                    "telefone_enriquecido": "(31) 3333-4444",
                },
            }

        with mock.patch.object(
            empresas_router,
            "validar_cnpj",
            return_value=(True, "12345678000190"),
        ), mock.patch.object(empresas_router, "get_connection", fake_get_connection), mock.patch.object(
            empresas_router.enrichment_service,
            "enrich_company_complete",
            side_effect=fake_enrich_company_complete,
        ):
            result = await empresas_router.enriquecer_empresa("12345678000190", _user={})

        self.assertTrue(result["success"])
        self.assertEqual(result["cnpj"], "12345678000190")
        self.assertEqual(
            result["enriquecimento"]["contatos_web"]["email_enriquecido"],
            "contato@empresa.com.br",
        )
        self.assertEqual(service_calls[0]["cnae"], "8640201")
        self.assertNotIn("cnae_principal", service_calls[0])

    async def test_buscar_contact_intelligence_returns_cached_payload(self):
        cached_payload = {
            "company": {"cnpj": "12345678000190"},
            "summary": {"decision_makers": 2},
        }

        with mock.patch.object(
            empresas_router,
            "validar_cnpj",
            return_value=(True, "12345678000190"),
        ), mock.patch.object(
            empresas_router.contact_intelligence_service,
            "get_cached_company_intelligence",
            return_value=cached_payload,
        ):
            result = await empresas_router.buscar_contact_intelligence("12345678000190", _user={})

        self.assertTrue(result["success"])
        self.assertTrue(result["cached"])
        self.assertEqual(result["intelligence"]["summary"]["decision_makers"], 2)

    async def test_buscar_contact_intelligence_status_hides_stale_cache_while_refresh_runs(self):
        cached_payload = {
            "company": {"cnpj": "12345678000190"},
            "summary": {"decision_makers": 2},
        }
        queued_status = {
            "cnpj": "12345678000190",
            "status": "running",
            "cached": False,
            "queued": True,
            "refresh": True,
            "job_id": "job-123",
            "updated_at": "2026-03-11T12:00:00+00:00",
        }

        with mock.patch.object(
            empresas_router.contact_intelligence_service,
            "get_cached_company_intelligence",
            return_value=cached_payload,
        ), mock.patch.object(
            empresas_router,
            "get_contact_intelligence_status",
            return_value=queued_status,
        ):
            payload = empresas_router._contact_intelligence_status_payload("12345678000190")

        self.assertEqual(payload["status"], "running")
        self.assertFalse(payload["cached"])
        self.assertTrue(payload["queued"])
        self.assertIsNone(payload["intelligence"])

    async def test_resolver_contact_intelligence_awaits_service(self):
        service_calls = []

        async def fake_resolve_company_intelligence(cnpj, probe_smtp=False):
            service_calls.append({"cnpj": cnpj, "probe_smtp": probe_smtp})
            return {
                "company": {"cnpj": cnpj},
                "summary": {"verified": 1},
            }

        with mock.patch.object(
            empresas_router,
            "validar_cnpj",
            return_value=(True, "12345678000190"),
        ), mock.patch.object(
            empresas_router.contact_intelligence_service,
            "resolve_company_intelligence",
            side_effect=fake_resolve_company_intelligence,
        ):
            result = await empresas_router.resolver_contact_intelligence(
                "12345678000190",
                empresas_router.ContactIntelligenceRequest(probe_smtp=True),
                _user={},
            )

        self.assertTrue(result["success"])
        self.assertFalse(result["cached"])
        self.assertEqual(result["intelligence"]["summary"]["verified"], 1)
        self.assertEqual(service_calls[0]["cnpj"], "12345678000190")
        self.assertTrue(service_calls[0]["probe_smtp"])

    async def test_resolver_contact_intelligence_batch_uses_cache_and_reports_invalid(self):
        cached_payload = {"company": {"cnpj": "12345678000190"}}
        service_calls = []

        async def fake_resolve_company_intelligence(cnpj, probe_smtp=False):
            service_calls.append({"cnpj": cnpj, "probe_smtp": probe_smtp})
            return {
                "company": {"cnpj": cnpj},
                "summary": {"deliverable": 1},
            }

        validation_map = {
            "12345678000190": (True, "12345678000190"),
            "98765432000110": (True, "98765432000110"),
            "invalido": (False, None),
        }

        with mock.patch.object(
            empresas_router,
            "validar_cnpj",
            side_effect=lambda raw: validation_map[raw],
        ), mock.patch.object(
            empresas_router.contact_intelligence_service,
            "get_cached_company_intelligence",
            side_effect=lambda cnpj: cached_payload if cnpj == "12345678000190" else None,
        ), mock.patch.object(
            empresas_router.contact_intelligence_service,
            "resolve_company_intelligence",
            side_effect=fake_resolve_company_intelligence,
        ):
            result = await empresas_router.resolver_contact_intelligence_batch(
                empresas_router.ContactIntelligenceBatchRequest(
                    cnpjs=["12345678000190", "98765432000110", "invalido"],
                    probe_smtp=True,
                ),
                _user={},
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["total"], 3)
        self.assertTrue(result["items"][0]["cached"])
        self.assertEqual(result["items"][0]["intelligence"]["company"]["cnpj"], "12345678000190")
        self.assertFalse(result["items"][1]["cached"])
        self.assertEqual(result["items"][1]["intelligence"]["summary"]["deliverable"], 1)
        self.assertEqual(result["items"][2]["error"], "CNPJ invalido")
        self.assertEqual(service_calls[0]["cnpj"], "98765432000110")
        self.assertTrue(service_calls[0]["probe_smtp"])

    async def test_enfileirar_contact_intelligence_returns_cached_payload(self):
        cached_payload = {
            "company": {"cnpj": "12345678000190"},
            "summary": {"decision_makers": 3},
        }

        with mock.patch.object(
            empresas_router,
            "validar_cnpj",
            return_value=(True, "12345678000190"),
        ), mock.patch.object(
            empresas_router,
            "queue_contact_intelligence",
            return_value={
                "cnpj": "12345678000190",
                "status": "completed",
                "cached": True,
                "queued": False,
                "intelligence": cached_payload,
                "error": None,
            },
        ):
            result = await empresas_router.enfileirar_contact_intelligence(
                "12345678000190",
                empresas_router.ContactIntelligenceRequest(),
                _user={},
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["cached"])
        self.assertEqual(result["intelligence"]["summary"]["decision_makers"], 3)

    async def test_enfileirar_contact_intelligence_batch_reports_queued_items(self):
        validation_map = {
            "12345678000190": (True, "12345678000190"),
            "98765432000110": (True, "98765432000110"),
            "invalido": (False, None),
        }

        with mock.patch.object(
            empresas_router,
            "validar_cnpj",
            side_effect=lambda raw: validation_map[raw],
        ), mock.patch.object(
            empresas_router,
            "queue_contact_intelligence",
            side_effect=lambda cnpj, probe_smtp=False, refresh=False: {
                "cnpj": cnpj,
                "status": "queued",
                "cached": False,
                "queued": True,
                "intelligence": None,
                "error": None,
            },
        ):
            result = await empresas_router.enfileirar_contact_intelligence_batch(
                empresas_router.ContactIntelligenceBatchRequest(
                    cnpjs=["12345678000190", "98765432000110", "invalido"],
                    probe_smtp=True,
                ),
                _user={},
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["items"][0]["status"], "queued")
        self.assertTrue(result["items"][0]["queued"])
        self.assertEqual(result["items"][1]["status"], "queued")
        self.assertEqual(result["items"][2]["error"], "CNPJ invalido")

    async def test_buscar_contact_intelligence_status_prefers_cached_intelligence(self):
        cached_payload = {
            "company": {"cnpj": "12345678000190"},
            "summary": {"verified": 1},
        }

        with mock.patch.object(
            empresas_router,
            "validar_cnpj",
            return_value=(True, "12345678000190"),
        ), mock.patch.object(
            empresas_router.contact_intelligence_service,
            "get_cached_company_intelligence",
            return_value=cached_payload,
        ), mock.patch.object(
            empresas_router,
            "get_contact_intelligence_status",
            return_value={
                "cnpj": "12345678000190",
                "status": "running",
                "cached": False,
                "queued": False,
                "error": None,
                "updated_at": "2026-03-11T12:00:00+00:00",
            },
        ):
            result = await empresas_router.buscar_contact_intelligence_status(
                "12345678000190",
                _user={},
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["cached"])
        self.assertEqual(result["intelligence"]["summary"]["verified"], 1)


if __name__ == "__main__":
    unittest.main()
