import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("HERMES_AUTH_REQUIRED", "false")
os.environ.setdefault(
    "HERMES_DUCKDB_PATH",
    str(Path(tempfile.gettempdir()) / "hermes-enrichment-budget.duckdb"),
)


from api import main as api_main
from api import enrichment_service as api_enrichment_service


class MainEnrichmentBudgetTests(unittest.TestCase):
    def _empresa(self, **overrides):
        data = {
            "cnpj": overrides.pop("cnpj", "12345678000199"),
            "razao_social": overrides.pop("razao_social", "EMPRESA TESTE LTDA"),
            "nome_fantasia": overrides.pop("nome_fantasia", "Empresa Teste"),
            "socios_resumo": overrides.pop("socios_resumo", None),
            "email": overrides.pop("email", None),
            "email_enriquecido": overrides.pop("email_enriquecido", None),
            "telefone_padrao": overrides.pop("telefone_padrao", None),
            "telefone_receita": overrides.pop("telefone_receita", None),
            "telefone_enriquecido": overrides.pop("telefone_enriquecido", None),
            "whatsapp_publico": overrides.pop("whatsapp_publico", None),
            "whatsapp_enriquecido": overrides.pop("whatsapp_enriquecido", None),
            "linkedin_empresa": overrides.pop("linkedin_empresa", None),
            "redes_sociais_empresa": overrides.pop("redes_sociais_empresa", None),
            "redes_sociais_socios": overrides.pop("redes_sociais_socios", None),
            "site": overrides.pop("site", None),
            "score_icp": overrides.pop("score_icp", 80.0),
        }
        data.update(overrides)
        return api_main.Empresa(**data)

    def test_enriquecer_redes_socios_skips_leads_with_digital_contact(self):
        com_email = self._empresa(
            cnpj="11111111000111",
            socios_resumo="MARIA TESTE (Administradora)",
            email_enriquecido="contato@empresa.com.br",
        )
        sem_contato = self._empresa(
            cnpj="22222222000122",
            socios_resumo="JOAO TESTE (Administrador)",
        )
        sem_socios = self._empresa(cnpj="33333333000133")

        with mock.patch.object(
            api_main,
            "_buscar_redes_para_socio",
            return_value=["https://www.linkedin.com/in/joao-teste/"],
        ) as buscar_redes:
            api_main.enriquecer_redes_socios([com_email, sem_contato, sem_socios])

        self.assertEqual(buscar_redes.call_count, 1)
        self.assertIsNone(com_email.redes_sociais_socios)
        self.assertEqual(sem_contato.redes_sociais_socios[0].nome, "JOAO TESTE")

    def test_whatsapp_ultra_targets_only_leads_without_any_contact(self):
        sem_contato = self._empresa(cnpj="44444444000144", score_icp=90)
        com_telefone = self._empresa(cnpj="55555555000155", telefone_padrao="(31) 3333-4444", score_icp=95)
        com_email = self._empresa(cnpj="66666666000166", email="contato@empresa.com.br", score_icp=99)
        com_whatsapp = self._empresa(cnpj="77777777000177", whatsapp_enriquecido="5531999999999", score_icp=88)

        alvos = api_main._selecionar_empresas_para_whatsapp_ultra(
            [com_email, com_telefone, sem_contato, com_whatsapp]
        )

        self.assertEqual([empresa.cnpj for empresa in alvos], ["44444444000144"])

    def test_enriquecer_empresas_online_uses_fast_batch_mode(self):
        empresa = self._empresa(
            cnpj="88888888000188",
            email="contato@empresa.com.br",
            socios_resumo="ANA TESTE (Administradora)",
        )

        async def _fake_batch(_empresas, **kwargs):
            self.assertTrue(kwargs["modo_rapido"])
            return []

        with mock.patch.object(
            api_enrichment_service.enrichment_service,
            "enrich_batch_async",
            side_effect=_fake_batch,
        ):
            api_main.enriquecer_empresas_online([empresa])


if __name__ == "__main__":
    unittest.main()
