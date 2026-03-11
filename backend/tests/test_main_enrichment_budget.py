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

    def test_whatsapp_ultra_targets_leads_missing_whatsapp_even_with_other_contacts(self):
        sem_contato = self._empresa(cnpj="44444444000144", score_icp=90)
        com_telefone = self._empresa(
            cnpj="55555555000155",
            telefone_padrao="(31) 98888-7777",
            site="https://empresa.com.br",
            score_icp=95,
        )
        com_email = self._empresa(
            cnpj="66666666000166",
            email="contato@empresa.com.br",
            site="https://empresa2.com.br",
            score_icp=99,
        )
        com_whatsapp = self._empresa(cnpj="77777777000177", whatsapp_enriquecido="5531999999999", score_icp=88)

        alvos = api_main._selecionar_empresas_para_whatsapp_ultra(
            [com_email, com_telefone, sem_contato, com_whatsapp]
        )

        self.assertEqual(
            [empresa.cnpj for empresa in alvos],
            ["55555555000155", "66666666000166", "44444444000144"],
        )

    def test_extrair_contatos_html_collects_link_and_number_whatsapp(self):
        html = """
        <a href="https://wa.me/5511988887777">WhatsApp</a>
        <p>Fale no WhatsApp +55 (11) 98888-7777</p>
        """

        contatos = api_main._extrair_contatos_html(html)

        self.assertIn("https://wa.me/5511988887777", contatos["whatsapps"])
        self.assertIn("5511988887777", contatos["whatsapps"])

    def test_promover_telefone_para_whatsapp_uses_captured_phone_and_records_origin(self):
        empresa = self._empresa(
            cnpj="12121212000112",
            telefones_captados=[
                api_main.ContatoCaptado(valor="(11) 98888-7777", origem="Site HTML"),
            ],
        )

        promovidos = api_main._promover_telefone_para_whatsapp([empresa])

        self.assertEqual(promovidos, 1)
        self.assertEqual(empresa.whatsapp_enriquecido, "5511988887777")
        self.assertEqual(empresa.whatsapps_captados[0].valor, "5511988887777")
        self.assertIn("Promocao", empresa.whatsapps_captados[0].origem)

    def test_verificar_whatsapps_evolution_promotes_confirmed_alternative_candidate(self):
        empresa = self._empresa(
            cnpj="13131313000113",
            whatsapp_publico="(11) 98765-4321",
            whatsapps_captados=[
                api_main.ContatoCaptado(valor="(11) 98765-4321", origem="WhatsApp publico", tipo="publico"),
                api_main.ContatoCaptado(valor="(31) 91234-5678", origem="telefone_captado_1", tipo="enriquecido"),
            ],
        )

        async def _fake_verificar(numeros, max_batch=50):
            self.assertEqual(numeros, ["5511987654321", "5531912345678"])
            return {
                "5511987654321": {"valido": False, "metodo": "evolution_api_rejected", "score": 0.0},
                "5531912345678": {"valido": True, "metodo": "evolution_api", "score": 1.0},
            }

        with mock.patch.dict(api_main.os.environ, {"EVOLUTION_API_URL": "http://evolution.test"}, clear=False), \
             mock.patch.object(api_main, "SYNC_EVOLUTION_VERIFY_LIMIT", 2), \
             mock.patch("api.validation_service.verificar_whatsapp_lote", side_effect=_fake_verificar):
            confirmados = api_main._verificar_whatsapps_evolution([empresa])

        self.assertEqual(confirmados, 1)
        self.assertEqual(empresa.whatsapp_enriquecido, "5531912345678")
        self.assertEqual(empresa.whatsapp_publico, "5531912345678")
        captados = {item.valor: item for item in empresa.whatsapps_captados}
        self.assertFalse(captados["5511987654321"].validado)
        self.assertEqual(captados["5511987654321"].metodo_validacao, "evolution_api_rejected")
        self.assertTrue(captados["5531912345678"].validado)
        self.assertEqual(captados["5531912345678"].metodo_validacao, "evolution_api")

    def test_verificar_whatsapps_evolution_spreads_limit_across_companies(self):
        empresa_a = self._empresa(
            cnpj="14141414000114",
            whatsapp_publico="(11) 98765-4321",
            whatsapps_captados=[
                api_main.ContatoCaptado(valor="(31) 91234-5678", origem="telefone_captado_1", tipo="enriquecido"),
            ],
            score_icp=99,
        )
        empresa_b = self._empresa(
            cnpj="15151515000115",
            whatsapp_enriquecido="(21) 99123-4567",
            score_icp=80,
        )

        async def _fake_verificar(numeros, max_batch=50):
            self.assertEqual(numeros, ["5511987654321", "5521991234567"])
            return {
                "5511987654321": {"valido": False, "metodo": "evolution_api_rejected", "score": 0.0},
                "5521991234567": {"valido": True, "metodo": "evolution_api", "score": 1.0},
            }

        with mock.patch.dict(api_main.os.environ, {"EVOLUTION_API_URL": "http://evolution.test"}, clear=False), \
             mock.patch.object(api_main, "SYNC_EVOLUTION_VERIFY_LIMIT", 2), \
             mock.patch("api.validation_service.verificar_whatsapp_lote", side_effect=_fake_verificar):
            confirmados = api_main._verificar_whatsapps_evolution([empresa_a, empresa_b])

        self.assertEqual(confirmados, 1)
        self.assertIsNone(empresa_a.whatsapp_enriquecido)
        self.assertEqual(empresa_b.whatsapp_enriquecido, "5521991234567")

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

    def test_verificar_emails_smtp_remove_rejected_email(self):
        empresa = self._empresa(
            cnpj="99999999000199",
            email_enriquecido="contato@empresa.com.br",
            score_icp=99,
        )

        async def _fake_verificar(emails, probe_smtp=True, max_concurrent=4):
            self.assertTrue(probe_smtp)
            self.assertEqual(emails, ["contato@empresa.com.br"])
            return {
                "contato@empresa.com.br": {
                    "valido": False,
                    "score": 0.0,
                    "metodo": "smtp_probe",
                    "motivo": "Servidor SMTP rejeitou o destinatario",
                    "mx_valido": True,
                    "smtp_status": "rejected",
                }
            }

        with mock.patch("api.validation_service.verificar_email_lote", side_effect=_fake_verificar):
            confirmados = api_main._verificar_emails_smtp([empresa])

        self.assertEqual(confirmados, 0)
        self.assertIsNone(empresa.email_enriquecido)
        self.assertFalse(empresa.email_validado)
        self.assertEqual(empresa.email_status_validacao, "rejected")


if __name__ == "__main__":
    unittest.main()
