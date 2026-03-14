import importlib
import os
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class QueryTranslatorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.prev_openai = os.environ.get("OPENAI_API_KEY")
        self.prev_openrouter = os.environ.get("OPENROUTER_API_KEY")
        os.environ.pop("OPENAI_API_KEY", None)
        os.environ.pop("OPENROUTER_API_KEY", None)

        self.config_module = importlib.import_module("config")
        importlib.reload(self.config_module)
        self.translator_module = importlib.import_module("api.query_translator")
        importlib.reload(self.translator_module)
        self.service = self.translator_module.QueryTranslatorService()

    def tearDown(self):
        if self.prev_openai is None:
            os.environ.pop("OPENAI_API_KEY", None)
        else:
            os.environ["OPENAI_API_KEY"] = self.prev_openai

        if self.prev_openrouter is None:
            os.environ.pop("OPENROUTER_API_KEY", None)
        else:
            os.environ["OPENROUTER_API_KEY"] = self.prev_openrouter

    async def test_translate_query_extracts_ufs_city_limit_and_contact_flags(self):
        result = await self.service.translate_query(
            "administradoras de condominios em Belo Horizonte/MG com WhatsApp valido 80 leads",
        )

        config = result["config"]
        self.assertEqual(result["source"], "heuristic")
        self.assertEqual(config["cidades"], ["Belo Horizonte"])
        self.assertEqual(config["ufs"], ["MG"])
        self.assertEqual(config["limite_empresas"], 80)
        self.assertTrue(config["exigir_contato_acionavel"])
        self.assertTrue(config["priorizar_com_contato"])
        self.assertIn("Belo Horizonte", result["highlights"])

    async def test_translate_query_extracts_brasil_inteiro_cnaes_and_capital_range(self):
        result = await self.service.translate_query(
            "imobiliarias no Brasil inteiro CNAE 6821-8/01 e 6822-6/00 capital entre 500 mil e 2 mi sem enriquecimento",
        )

        config = result["config"]
        self.assertEqual(len(config["ufs"]), 27)
        self.assertEqual(config["cnaes"], ["6821801", "6822600"])
        self.assertEqual(config["capital_minimo"], 500000)
        self.assertEqual(config["capital_maximo"], 2000000)
        self.assertFalse(config["enriquecimento_web"])

    async def test_translate_query_preserves_defaults_for_unspecified_fields(self):
        defaults = {
            "termo_base": "clinicas",
            "ufs": ["SP"],
            "cidade": "Sao Paulo",
            "cidades": ["Sao Paulo"],
            "limite_empresas": 25,
            "portes": ["EPP"],
            "enriquecimento_web": False,
        }

        result = await self.service.translate_query("quero hospitais", defaults=defaults)
        config = result["config"]

        self.assertEqual(config["termo_base"], "quero hospitais")
        self.assertEqual(config["ufs"], ["SP"])
        self.assertEqual(config["cidades"], ["Sao Paulo"])
        self.assertEqual(config["limite_empresas"], 25)
        self.assertEqual(config["portes"], ["EPP"])
        self.assertFalse(config["enriquecimento_web"])


if __name__ == "__main__":
    unittest.main()
