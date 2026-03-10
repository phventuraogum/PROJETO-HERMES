import os
import sys
import unittest

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from api.enrichment_merge import merge_enrichment_payload


class EnrichmentMergeTests(unittest.TestCase):
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

        merged = merge_enrichment_payload(existing, payload)

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

        merged = merge_enrichment_payload(existing, payload)

        self.assertEqual(merged["site"], "beta.com.br")
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

        merged = merge_enrichment_payload(existing, payload)

        self.assertEqual(merged["email_enriquecido"], "contato@totvs.com.br")
        self.assertEqual(merged["emails_captados"][0]["valor"], "contato@totvs.com.br")


if __name__ == "__main__":
    unittest.main()
