import importlib
import io
import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


CSV_SAMPLE = """CNPJ;Nome Devedor;Situacao Inscricao;Numero Inscricao;Data Inscricao;Valor Originario;Valor Consolidado;Tipo Credito;Ajuizado
15.103.354/0001-39;DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA;IRREGULAR;INSC-001;01/02/2026;120.000,00;145.500,25;TRIBUTARIA;SIM
15.103.354/0001-39;DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA;IRREGULAR;INSC-002;05/02/2026;35.000,00;40.000,10;FGTS;NAO
03.023.889/0001-10;EMPRESA EXEMPLO S/A;SUSPENSA;INSC-003;10/02/2026;50.000,00;55.000,00;TRIBUTARIA;SIM
"""

CSV_OFFICIAL_A = """CPF_CNPJ;TIPO_PESSOA;TIPO_DEVEDOR;NOME_DEVEDOR;UF_DEVEDOR;UNIDADE_RESPONSAVEL;NUMERO_INSCRICAO;TIPO_SITUACAO_INSCRICAO;SITUACAO_INSCRICAO;TIPO_CREDITO;DATA_INSCRICAO;INDICADOR_AJUIZADO;VALOR_CONSOLIDADO
15.103.354/0001-39;PJ;MATRIZ;DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA;MG;PRFN1;PREV-001;01;IRREGULAR;PREVIDENCIARIA;02/02/2026;SIM;145.500,25
"""

CSV_OFFICIAL_B = """CPF_CNPJ;TIPO_PESSOA;TIPO_DEVEDOR;NOME_DEVEDOR;UF_DEVEDOR;UNIDADE_RESPONSAVEL;ENTIDADE_RESPONSAVEL;UNIDADE_INSCRICAO;NUMERO_INSCRICAO;TIPO_SITUACAO_INSCRICAO;SITUACAO_INSCRICAO;RECEITA_PRINCIPAL;DATA_INSCRICAO;INDICADOR_AJUIZADO;VALOR_CONSOLIDADO
15.103.354/0001-39;PJ;MATRIZ;DEODE INOVACAO E EFICIENCIA EM ENERGIA LTDA;MG;PRFN1;CAIXA;UG001;FGTS-002;02;SUSPENSA;FGTS;15/02/2026;NAO;40.000,10
03.023.889/0001-10;PJ;MATRIZ;EMPRESA EXEMPLO S/A;SP;PRFN3;UNIAO;UG777;NAO-003;03;IRREGULAR;IRPJ;20/02/2026;SIM;55.000,00
"""


class PublicFiscalDataServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.TemporaryDirectory()
        os.environ["ENVIRONMENT"] = "development"
        os.environ["HERMES_DUCKDB_PATH"] = str(Path(cls.tmpdir.name) / "hermes-fiscal-test.duckdb")
        os.environ["HERMES_APP_DB_PATH"] = str(Path(cls.tmpdir.name) / "hermes-app-fiscal-test.duckdb")

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

    def test_import_snapshot_accepts_zip_with_multiple_official_members(self):
        archive_bytes = io.BytesIO()
        with zipfile.ZipFile(archive_bytes, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("previdenciario.csv", CSV_OFFICIAL_A)
            archive.writestr("fgts.csv", CSV_OFFICIAL_B)

        snapshot = self.service.import_snapshot(
            "zip-org",
            archive_bytes.getvalue(),
            filename="pgfn-oficial.zip",
            source_label="PGFN Dados Abertos",
        )

        self.assertEqual(snapshot["record_count"], 3)
        self.assertEqual(snapshot["unique_cnpjs"], 2)
        payload = self.service.lookup_cnpj("zip-org", "15103354000139")
        self.assertEqual(payload["summary"]["total_records"], 2)
        self.assertIn("MG", payload["summary"]["ufs"])
        self.assertIn("FGTS", payload["summary"]["tipos_credito"])
        self.assertIn("fgts.csv", payload["summary"]["fontes"])
        self.assertEqual(payload["records"][0]["tipo_pessoa"], "PJ")

    def test_import_snapshot_paths_handles_bulk_csv_files(self):
        csv_a = Path(self.tmpdir.name) / "pgfn-a.csv"
        csv_b = Path(self.tmpdir.name) / "pgfn-b.csv"
        csv_a.write_text(CSV_OFFICIAL_A, encoding="utf-8")
        csv_b.write_text(CSV_OFFICIAL_B, encoding="utf-8")

        snapshot = self.service.import_snapshot_paths(
            "path-org",
            [str(csv_a), str(csv_b)],
            source_label="PGFN Dados Abertos",
            filename="pgfn-path-import",
        )

        self.assertEqual(snapshot["record_count"], 3)
        self.assertEqual(snapshot["unique_cnpjs"], 2)

        payload = self.service.lookup_cnpj("path-org", "15103354000139")
        self.assertTrue(payload["summary"]["has_records"])
        self.assertEqual(payload["summary"]["total_records"], 2)
        self.assertEqual(payload["records"][0]["source_file_name"], "pgfn-b.csv")
        self.assertEqual(payload["records"][0]["receita_principal"], "FGTS")

    def test_batch_cnpjs_divida_aberta_returns_open_debts(self):
        self.service.import_snapshot(
            "batch-org",
            CSV_SAMPLE.encode("utf-8"),
            filename="pgfn-publica.csv",
            source_label="PGFN Dados Abertos",
        )
        out = self.service.batch_cnpjs_divida_aberta(
            "batch-org",
            ["15.103.354/0001-39", "03.023.889/0001-10", "00.000.000/0001-00"],
        )
        self.assertEqual(out, {"15103354000139", "03023889000110"})


if __name__ == "__main__":
    unittest.main()
