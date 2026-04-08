import sys
import types
import unittest
from pathlib import Path
from unittest import mock

import httpx


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from api.assertiva_service import (
    AssertivaCNPJService,
    _extract_protocol,
    _extrair_telefones_assertiva,
)


class AssertivaServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_extract_protocol_prefers_headers(self) -> None:
        headers = httpx.Headers({"x-protocolo": "header-proto"})
        payload = {"cabecalho": {"protocolo": "body-proto"}}
        self.assertEqual(_extract_protocol(headers, payload), "header-proto")

    def test_extract_protocol_falls_back_to_body(self) -> None:
        headers = httpx.Headers({})
        payload = {"cabecalho": {"protocolo": "body-proto"}}
        self.assertEqual(_extract_protocol(headers, payload), "body-proto")

    def test_extract_telefones_normalizes_mobile_and_fix_line(self) -> None:
        telefones = _extrair_telefones_assertiva(
            {
                "fixos": [
                    {
                        "numero": "(31) 3333-4444",
                        "relacao": "Empresa",
                        "aplicativos": {"whatsAppBusiness": True},
                    }
                ],
                "moveis": [
                    {
                        "numero": "(31) 98888-7777",
                        "relacao": "Socio",
                        "aplicativos": {"whatsApp": True},
                    }
                ],
            },
            origem="teste",
        )
        self.assertEqual(len(telefones), 2)
        self.assertEqual(telefones[0]["numero_e164"], "5531933334444")
        self.assertEqual(telefones[1]["numero_e164"], "5531988887777")
        self.assertTrue(telefones[1]["whatsapp_assertiva"])

    def test_extract_telefones_marks_family_relations_as_non_relevant(self) -> None:
        telefones = _extrair_telefones_assertiva(
            {
                "moveis": [
                    {
                        "numero": "(31) 98888-7777",
                        "relacao": "MAE",
                        "aplicativos": {"whatsApp": True},
                    },
                    {
                        "numero": "(31) 97777-6666",
                        "relacao": "EMPRESA",
                        "aplicativos": {"whatsApp": True},
                    },
                ]
            },
            origem="teste",
        )
        self.assertEqual(telefones[0]["categoria_relacao"], "familiar")
        self.assertFalse(telefones[0]["contato_relevante_decisor"])
        self.assertEqual(telefones[1]["categoria_relacao"], "relevante")
        self.assertTrue(telefones[1]["contato_relevante_decisor"])

    async def test_enriquecer_empresa_com_decisores_attaches_validated_whatsapp(self) -> None:
        class FakeService(AssertivaCNPJService):
            async def consultar_cnpj(self, cnpj: str, *, id_finalidade: int = 5):
                return {
                    "encontrado": True,
                    "cnpj": cnpj,
                    "razao_social": "EMPRESA TESTE",
                    "protocolo": "proto-123",
                }

            async def consultar_possiveis_decisores(self, cnpj: str, *, protocolo: str):
                return [
                    {
                        "nome": "Joao Decisor",
                        "cpf": "123.456.789-00",
                        "cargo": "Diretor",
                        "telefones": [],
                    }
                ]

            async def consultar_mais_telefones(self, documento: str, *, protocolo: str, tipo: str = "CPF"):
                return [
                    {
                        "numero": "(31) 98888-7777",
                        "numero_e164": "5531988887777",
                        "tipo": "movel",
                        "origem": "assertiva_mais_telefones_cpf",
                        "whatsapp_assertiva": False,
                    }
                ]

        fake_validation_module = types.ModuleType("api.validation_service")

        async def _fake_verificar_whatsapp_lote(numeros):
            return {
                "5531988887777": {
                    "valido": True,
                    "metodo": "evolution_api",
                    "score": 1.0,
                }
            }

        fake_validation_module.verificar_whatsapp_lote = _fake_verificar_whatsapp_lote

        with mock.patch.dict(sys.modules, {"api.validation_service": fake_validation_module}):
            service = FakeService()
            payload = await service.enriquecer_empresa_com_decisores("08000607000183")

        self.assertEqual(payload["resumo"]["total_decisores"], 1)
        self.assertEqual(payload["resumo"]["total_whatsapps_validos"], 1)
        decisor = payload["decisores"][0]
        self.assertEqual(decisor["melhor_whatsapp"]["numero_e164"], "5531988887777")
        self.assertTrue(decisor["melhor_whatsapp"]["whatsapp_validado"])

    async def test_enriquecer_empresa_com_decisores_discards_family_phones_by_default(self) -> None:
        class FakeService(AssertivaCNPJService):
            async def consultar_cnpj(self, cnpj: str, *, id_finalidade: int = 5):
                return {
                    "encontrado": True,
                    "cnpj": cnpj,
                    "razao_social": "EMPRESA TESTE",
                    "protocolo": "proto-123",
                }

            async def consultar_possiveis_decisores(self, cnpj: str, *, protocolo: str):
                return [
                    {
                        "nome": "Joao Decisor",
                        "cpf": "123.456.789-00",
                        "cargo": "Gerente",
                        "telefones": [],
                    }
                ]

            async def consultar_mais_telefones(self, documento: str, *, protocolo: str, tipo: str = "CPF"):
                return [
                    {
                        "numero": "(31) 98888-7777",
                        "numero_e164": "5531988887777",
                        "tipo": "movel",
                        "origem": "assertiva_mais_telefones_cpf",
                        "relacao": "MAE",
                        "categoria_relacao": "familiar",
                        "contato_relevante_decisor": False,
                        "whatsapp_assertiva": True,
                    },
                    {
                        "numero": "(31) 97777-6666",
                        "numero_e164": "5531977776666",
                        "tipo": "movel",
                        "origem": "assertiva_mais_telefones_cpf",
                        "relacao": "EMPRESA",
                        "categoria_relacao": "relevante",
                        "contato_relevante_decisor": True,
                        "whatsapp_assertiva": True,
                    },
                ]

        fake_validation_module = types.ModuleType("api.validation_service")

        async def _fake_verificar_whatsapp_lote(numeros):
            self.assertEqual(numeros, ["5531977776666"])
            return {
                "5531977776666": {
                    "valido": True,
                    "metodo": "evolution_api",
                    "score": 1.0,
                }
            }

        fake_validation_module.verificar_whatsapp_lote = _fake_verificar_whatsapp_lote

        with mock.patch.dict(sys.modules, {"api.validation_service": fake_validation_module}):
            service = FakeService()
            payload = await service.enriquecer_empresa_com_decisores("08000607000183")

        decisor = payload["decisores"][0]
        self.assertEqual(len(decisor["telefones"]), 1)
        self.assertEqual(decisor["telefones"][0]["relacao"], "EMPRESA")
        self.assertEqual(len(decisor["telefones_descartados"]), 1)
        self.assertEqual(decisor["telefones_descartados"][0]["relacao"], "MAE")
        self.assertEqual(decisor["melhor_whatsapp"]["numero_e164"], "5531977776666")
        self.assertEqual(payload["resumo"]["total_telefones_descartados_familia"], 1)


if __name__ == "__main__":
    unittest.main()
