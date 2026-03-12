import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


CSV_SAMPLE = """CNPJ;Nome Devedor;Situacao Inscricao;Numero Inscricao;Data Inscricao;Valor Originario;Valor Consolidado;Tipo Credito;Ajuizado
15.103.354/0001-39;DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA;IRREGULAR;INSC-001;01/02/2026;120.000,00;145.500,25;TRIBUTARIA;SIM
15.103.354/0001-39;DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA;IRREGULAR;INSC-002;05/02/2026;35.000,00;40.000,10;FGTS;NAO
03.023.889/0001-10;EMPRESA EXEMPLO S/A;SUSPENSA;INSC-003;10/02/2026;50.000,00;55.000,00;TRIBUTARIA;SIM
"""


class PublicFiscalDataServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        os.environ["ENVIRONMENT"] = "development"
        os.environ["HERMES_DUCKDB_PATH"] = str(Path(cls.tmpdir.name) / "hermes-fiscal-test.duckdb")

        cls.db_pool = importlib.import_module("api.db_pool")
        importlib.reload(cls.db_pool)

        cls.public_fiscal_data = importlib.import_module("api.public_fiscal_data")
        importlib.reload(cls.public_fiscal_data)

        cls.service = cls.public_fiscal_data.public_fiscal_data_service

    @classmethod
    def tearDownClass(cls):
        try:
            cls.db_pool.close_all_connections()
        finally:
            cls.tmpdir.cleanup()

    def test_import_snapshot_persists_lookupable_records(self):
        snapshot = self.service.import_snapshot(
            "default",
            CSV_SAMPLE.encode("utf-8"),
            filename="pgfn-publica.csv",
            source_label="PGFN Dados Abertos",
        )

        self.assertEqual(snapshot["record_count"], 3)
        self.assertEqual(snapshot["unique_cnpjs"], 2)
        self.assertEqual(snapshot["filename"], "pgfn-publica.csv")

        payload = self.service.lookup_cnpj("default", "15103354000139")
        self.assertTrue(payload["summary"]["has_snapshot"])
        self.assertTrue(payload["summary"]["has_records"])
        self.assertEqual(payload["summary"]["total_records"], 2)
        self.assertAlmostEqual(payload["summary"]["total_valor_originario"], 155000.0)
        self.assertAlmostEqual(payload["summary"]["total_valor_consolidado"], 185500.35)
        self.assertEqual(payload["summary"]["ajuizadas"], 1)
        self.assertEqual(payload["summary"]["nome_devedor"], "DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA")
        self.assertEqual(payload["records"][0]["numero_inscricao"], "INSC-002")

    def test_lookup_without_snapshot_returns_empty_summary(self):
        payload = self.service.lookup_cnpj("org-sem-base", "15103354000139")

        self.assertFalse(payload["summary"]["has_snapshot"])
        self.assertFalse(payload["summary"]["has_records"])
        self.assertEqual(payload["records"], [])


if __name__ == "__main__":
    unittest.main()
