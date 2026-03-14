import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class CompanyIntelligenceExtrasTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "extras-test.duckdb")
        self.prev_env = {
            "ENVIRONMENT": os.environ.get("ENVIRONMENT"),
            "HERMES_DUCKDB_PATH": os.environ.get("HERMES_DUCKDB_PATH"),
        }
        os.environ["ENVIRONMENT"] = "development"
        os.environ["HERMES_DUCKDB_PATH"] = self.db_path

        self.db_pool = importlib.import_module("api.db_pool")
        importlib.reload(self.db_pool)
        self.extras_module = importlib.import_module("api.company_intelligence_extras")
        importlib.reload(self.extras_module)
        self.service = self.extras_module.CompanyIntelligenceExtrasService()

        with self.db_pool.get_connection(read_only=False) as conn:
            conn.execute("DROP TABLE IF EXISTS empresas_enriquecidas")
            conn.execute("DROP TABLE IF EXISTS municipios")
            conn.execute("DROP TABLE IF EXISTS cnpj_empresas")
            conn.execute(
                """
                CREATE TABLE cnpj_empresas (
                    CNPJ_COMPLETO VARCHAR,
                    RAZAO_SOCIAL VARCHAR,
                    NOME_FANTASIA VARCHAR,
                    MUNICIPIO VARCHAR,
                    UF VARCHAR,
                    CNAE_PRINCIPAL VARCHAR,
                    PORTE_EMPRESA VARCHAR,
                    CAPITAL_SOCIAL VARCHAR,
                    EMAIL VARCHAR,
                    TELEFONE1 VARCHAR
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE municipios (
                    COD_MUNICIPIO VARCHAR,
                    NOME_MUNICIPIO VARCHAR
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE empresas_enriquecidas (
                    cnpj VARCHAR,
                    site VARCHAR,
                    whatsapp_publico VARCHAR,
                    whatsapp_enriquecido VARCHAR
                )
                """
            )
            conn.executemany(
                "INSERT INTO municipios VALUES (?, ?)",
                [
                    ("0001", "Juiz de Fora"),
                    ("0002", "Belo Horizonte"),
                    ("0003", "Sao Paulo"),
                ],
            )
            conn.executemany(
                "INSERT INTO cnpj_empresas VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    ("15103354000139", "DEODE ENERGIA LTDA", "DEODE", "1", "MG", "7112000", "05", "4000000,00", "contato@deode.com.br", "3230000000"),
                    ("11111111000100", "ENERGIA SUL LTDA", "ENERGIA SUL", "1", "MG", "7112000", "05", "3500000,00", "comercial@energiasul.com.br", "3133333333"),
                    ("22222222000100", "EFICIENCIA BRASIL SA", "EF BRASIL", "2", "MG", "7112000", "05", "4300000,00", "contato@efbrasil.com.br", "3134444444"),
                    ("33333333000100", "PREDIAL TEC LTDA", "PREDIAL TEC", "3", "SP", "7112000", "03", "800000,00", None, "1133333333"),
                    ("44444444000100", "OUTRO SEGMENTO LTDA", "OUTRO", "1", "MG", "6201500", "05", "4100000,00", "oi@outro.com", "3231231234"),
                ],
            )
            conn.executemany(
                "INSERT INTO empresas_enriquecidas VALUES (?, ?, ?, ?)",
                [
                    ("15103354000139", "https://deode.com.br", None, "5532999999999"),
                    ("11111111000100", "https://energiasul.com.br", None, "5531988887777"),
                    ("22222222000100", "https://efbrasil.com.br", None, None),
                ],
            )

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

    def test_find_similar_companies_prioritizes_same_cnae_and_contact_coverage(self):
        items = self.service.find_similar_companies("15103354000139", limit=3)
        self.assertEqual(len(items), 3)
        self.assertEqual(items[0]["cnpj"], "11111111000100")
        self.assertGreater(items[0]["similarity_score"], items[-1]["similarity_score"])
        self.assertNotIn("44444444000100", {item["cnpj"] for item in items})

    async def test_fetch_external_signals_classifies_jobs_funding_and_growth(self):
        async def fake_search(query: str, num_results: int = 6):
            if "vagas" in query or "careers" in query:
                return [
                    {
                        "title": "DEODE abre vagas para engenharia",
                        "link": "https://deode.com.br/trabalhe-conosco",
                        "descricao": "Estamos contratando para novos projetos.",
                    }
                ]
            if "investimento" in query or "funding" in query:
                return [
                    {
                        "title": "DEODE recebe aporte para expansao",
                        "link": "https://portal-noticias.com/deode-aporte",
                        "descricao": "A empresa anunciou investimento para crescimento.",
                    }
                ]
            return [
                {
                    "title": "DEODE inaugura nova unidade",
                    "link": "https://deode.com.br/noticias/nova-unidade",
                    "descricao": "Expansao em Minas Gerais.",
                }
            ]

        with mock.patch.object(self.extras_module, "buscar_google", side_effect=fake_search):
            signals = await self.service.fetch_external_signals("15103354000139")

        signal_types = {item["signal_type"] for item in signals}
        self.assertIn("jobs_signal", signal_types)
        self.assertIn("funding_signal", signal_types)
        self.assertIn("growth_signal", signal_types)


if __name__ == "__main__":
    unittest.main()
