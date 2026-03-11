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


if __name__ == "__main__":
    unittest.main()
