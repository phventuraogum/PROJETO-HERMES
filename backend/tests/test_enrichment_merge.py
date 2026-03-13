import os
import sys
import unittest
from unittest import mock

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from api.enrichment_merge import merge_enrichment_payload


class EnrichmentMergeTests(unittest.TestCase):
    @staticmethod
    def _fake_validar_email(email: str, probe_smtp: bool = False):
        domain = email.split("@", 1)[1].lower()
        mx_valido = domain not in {"ideal-axicom.com"}
        return {
            "valido": mx_valido,
            "formato_valido": True,
            "dominio_valido": True,
            "dominio_descartavel": False,
            "mx_valido": mx_valido,
            "score": 0.95 if mx_valido else 0.2,
            "metodo": "mx_lookup",
            "motivo": "MX encontrado" if mx_valido else "Dominio sem MX valido",
            "smtp_status": "not_checked",
        }

    def _merge(self, existing, payload):
        with mock.patch("api.enrichment_merge.validar_email", side_effect=self._fake_validar_email):
            return merge_enrichment_payload(existing, payload)

    def test_prioritizes_company_contacts_and_enriches_socios(self):
        existing = {
            "cnpj": "12345678000199",
            "razao_social": "ACME LTDA",
            "nome_fantasia": "ACME",
            "site": "https://acme.com.br",
            "email": "financeiro@acme.com.br",
            "email_enriquecido": None,
            "telefone_padrao": "(11) 3333-4444",
            "telefone_receita": None,
            "telefone_estab1": None,
            "telefone_estab2": None,
            "telefone_enriquecido": None,
            "whatsapp_publico": None,
            "whatsapp_enriquecido": None,
            "redes_sociais_empresa": [],
            "redes_sociais_socios": [],
            "socios_estruturado": [
                {"nome": "Joao Silva", "qualificacao": "Administrador"},
            ],
            "outras_informacoes": None,
            "registro_dono": None,
            "registro_email": None,
            "fonte_dados_prioritaria": None,
            "emails_captados": None,
            "telefones_captados": None,
            "whatsapps_captados": None,
            "linkedin_empresa": None,
            "instagram_empresa": None,
            "facebook_empresa": None,
            "resumo_ia_empresa": None,
        }

        payload = {
            "site": "https://acme.com.br",
            "contatos_web": {
                "email_enriquecido": "contato@acme.com.br",
                "telefone_enriquecido": "(11) 4000-1234",
            },
            "email_waterfall": {
                "email": "comercial@acme.com.br",
                "fonte": "Hunter Domain Search",
                "confianca": 87,
            },
            "whatsapp_ultra": {
                "numero": "5511999998888",
                "fonte": "Google Maps",
                "validado": True,
            },
            "linkedin_empresa": "https://www.linkedin.com/company/acme",
            "dados_registro": {
                "proprietario": "Joao Silva",
                "email_proprietario": "joao@gmail.com",
            },
            "emails_socios": [
                {
                    "nome": "Joao Silva",
                    "email_socio": "joao@acme.com.br",
                    "emails_alternativos": ["j.silva@acme.com.br"],
                    "fonte": "Hunter Email Finder",
                }
            ],
            "linkedin_ultra": [
                {
                    "nome": "Joao Silva",
                    "linkedin": "https://www.linkedin.com/in/joao-silva",
                    "email_linkedin": "joao@acme.com.br",
                    "telefone_linkedin": "+55 (11) 98888-7777",
                    "cargo_atual": "CEO",
                    "fonte": "Proxycurl",
                }
            ],
            "enriquecimento_ia": {
                "resumo_empresa": "Industria B2B com foco em automacao comercial.",
            },
        }

        merged = self._merge(existing, payload)

        self.assertEqual(merged["email_enriquecido"], "comercial@acme.com.br")
        self.assertEqual(merged["whatsapp_enriquecido"], "5511999998888")
        self.assertEqual(merged["linkedin_empresa"], "https://www.linkedin.com/company/acme")
        self.assertEqual(merged["registro_email"], "joao@gmail.com")
        self.assertIn("Hunter", merged["fonte_dados_prioritaria"])
        self.assertGreaterEqual(len(merged["emails_captados"]), 3)

        socio = merged["socios_estruturado"][0]
        self.assertEqual(socio["email"], "joao@acme.com.br")
        self.assertEqual(socio["linkedin"], "https://www.linkedin.com/in/joao-silva")
        self.assertEqual(socio["whatsapp"], "5511988887777")
        self.assertEqual(socio["cargo_atual"], "CEO")

    def test_merges_legacy_payload_into_structured_contacts(self):
        existing = {
            "cnpj": "12345678000199",
            "razao_social": "BETA LTDA",
            "nome_fantasia": "BETA",
            "site": None,
            "email": None,
            "email_enriquecido": None,
            "telefone_padrao": None,
            "telefone_receita": None,
            "telefone_estab1": None,
            "telefone_estab2": None,
            "telefone_enriquecido": None,
            "whatsapp_publico": None,
            "whatsapp_enriquecido": None,
            "redes_sociais_empresa": [],
            "redes_sociais_socios": [],
            "socios_estruturado": [{"nome": "Maria Souza"}],
            "outras_informacoes": None,
            "registro_dono": None,
            "registro_email": None,
            "fonte_dados_prioritaria": None,
            "emails_captados": None,
            "telefones_captados": None,
            "whatsapps_captados": None,
            "linkedin_empresa": None,
            "instagram_empresa": None,
            "facebook_empresa": None,
            "resumo_ia_empresa": None,
        }

        payload = {
            "site": "beta.com.br",
            "email": "contato@beta.com.br",
            "telefone": "(21) 2222-3333",
            "whatsapp_publico": "+55 (21) 98888-1111",
            "redes_sociais_empresa": ["https://instagram.com/beta"],
            "socios_linkedin": [
                {"nome": "Maria Souza", "linkedin": "https://linkedin.com/in/maria-souza"}
            ],
        }

        merged = self._merge(existing, payload)

        self.assertEqual(merged["site"], "https://beta.com.br")
        self.assertEqual(merged["email_enriquecido"], "contato@beta.com.br")
        self.assertEqual(merged["whatsapp_enriquecido"], "5521988881111")
        self.assertEqual(merged["instagram_empresa"], "https://instagram.com/beta")
        self.assertEqual(merged["socios_estruturado"][0]["linkedin"], "https://linkedin.com/in/maria-souza")
        self.assertEqual(merged["redes_sociais_socios"][0]["nome"], "Maria Souza")

    def test_penalizes_external_firecrawl_email_against_same_domain_email(self):
        existing = {
            "cnpj": "12345678000199",
            "razao_social": "TOTVS SA",
            "nome_fantasia": "TOTVS",
            "site": "https://www.totvs.com/",
            "email": None,
            "email_enriquecido": None,
            "telefone_padrao": None,
            "telefone_receita": None,
            "telefone_estab1": None,
            "telefone_estab2": None,
            "telefone_enriquecido": None,
            "whatsapp_publico": None,
            "whatsapp_enriquecido": None,
            "redes_sociais_empresa": [],
            "redes_sociais_socios": [],
            "socios_estruturado": [],
            "outras_informacoes": None,
            "registro_dono": None,
            "registro_email": None,
            "fonte_dados_prioritaria": None,
            "emails_captados": None,
            "telefones_captados": None,
            "whatsapps_captados": None,
            "linkedin_empresa": None,
            "instagram_empresa": None,
            "facebook_empresa": None,
            "resumo_ia_empresa": None,
        }

        payload = {
            "contatos_web": {
                "email_enriquecido": "totvs@ideal-axicom.com",
                "origem": "Firecrawl",
            },
            "email_waterfall": {
                "email": "contato@totvs.com.br",
                "fonte": "Hunter Domain Search",
                "confianca": 91,
            },
        }

        merged = self._merge(existing, payload)

        self.assertEqual(merged["email_enriquecido"], "contato@totvs.com.br")
        self.assertEqual(merged["emails_captados"][0]["valor"], "contato@totvs.com.br")

    def test_discards_directory_phone_and_whatsapp_from_primary_contacts(self):
        existing = {
            "cnpj": "12345678000199",
            "razao_social": "ACME LTDA",
            "nome_fantasia": "ACME",
            "site": "https://acme.com.br",
            "email": None,
            "email_enriquecido": None,
            "telefone_padrao": "(31) 3333-4444",
            "telefone_receita": None,
            "telefone_estab1": None,
            "telefone_estab2": None,
            "telefone_enriquecido": None,
            "whatsapp_publico": None,
            "whatsapp_enriquecido": None,
            "redes_sociais_empresa": [],
            "redes_sociais_socios": [],
            "socios_estruturado": [],
            "outras_informacoes": None,
            "registro_dono": None,
            "registro_email": None,
            "fonte_dados_prioritaria": None,
            "emails_captados": None,
            "telefones_captados": None,
            "whatsapps_captados": None,
            "linkedin_empresa": None,
            "instagram_empresa": None,
            "facebook_empresa": None,
            "resumo_ia_empresa": None,
        }

        payload = {
            "site": "https://acme.com.br",
            "contatos_web": {
                "telefone_enriquecido": "(32) 91995-6532",
                "whatsapp_enriquecido": "+55 (32) 99195-6532",
                "origem": "Firecrawl | informecadastral.com.br",
            },
        }

        merged = self._merge(existing, payload)

        self.assertEqual(merged["telefone_enriquecido"], "(31) 3333-4444")
        self.assertIsNone(merged["whatsapp_enriquecido"])
        self.assertTrue(all(
            "informecadastral.com.br" not in str(item.get("origem") or "").lower()
            for item in (merged.get("telefones_captados") or [])
        ))

    def test_discards_generic_site_and_scraped_contacts_from_payload(self):
        existing = {
            "cnpj": "12345678000199",
            "razao_social": "LAP CONTABILIDADE LTDA",
            "nome_fantasia": "LAP CONTABILIDADE",
            "site": None,
            "email": None,
            "email_enriquecido": "press@google.com",
            "telefone_padrao": None,
            "telefone_receita": None,
            "telefone_estab1": None,
            "telefone_estab2": None,
            "telefone_enriquecido": "(11) 4729-9240",
            "whatsapp_publico": "5585996127279",
            "whatsapp_enriquecido": None,
            "redes_sociais_empresa": [],
            "redes_sociais_socios": [],
            "socios_estruturado": [],
            "outras_informacoes": None,
            "registro_dono": None,
            "registro_email": None,
            "fonte_dados_prioritaria": None,
            "emails_captados": None,
            "telefones_captados": None,
            "whatsapps_captados": None,
            "linkedin_empresa": None,
            "instagram_empresa": None,
            "facebook_empresa": None,
            "resumo_ia_empresa": None,
        }

        payload = {
            "site": "https://google.com/",
            "email": "press@google.com",
            "telefone": "(11) 4729-9240",
            "whatsapp_publico": "5585996127279",
            "contatos_web": {
                "origem": "Core Scraper",
                "email_enriquecido": "press@google.com",
                "telefone_enriquecido": "(11) 4729-9240",
                "whatsapp_enriquecido": "5585996127279",
            },
        }

        merged = self._merge(existing, payload)

        self.assertIsNone(merged["site"])
        self.assertIsNone(merged["email_enriquecido"])
        self.assertIsNone(merged["telefone_enriquecido"])
        self.assertIsNone(merged["whatsapp_enriquecido"])


if __name__ == "__main__":
    unittest.main()
