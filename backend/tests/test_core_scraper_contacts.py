import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from core_scraper import _extrair_contatos_do_conteudo


class CoreScraperContactsTests(unittest.TestCase):
    def test_extracts_email_whatsapp_phone_and_linkedin_from_html(self):
        html = """
        <html>
          <body>
            <a href="mailto:contato@empresa.com.br">E-mail</a>
            <a href="https://wa.me/5531999998888">WhatsApp</a>
            <a href="https://www.linkedin.com/company/empresa-x/">LinkedIn</a>
            <footer>(31) 3333-4444</footer>
          </body>
        </html>
        """

        contatos = _extrair_contatos_do_conteudo("https://empresa.com.br", html=html)

        self.assertEqual(contatos["email"], "contato@empresa.com.br")
        self.assertEqual(contatos["whatsapp"], "5531999998888")
        self.assertEqual(contatos["telefone"], "(31) 3333-4444")
        self.assertEqual(contatos["linkedin_empresa"], "https://www.linkedin.com/company/empresa-x/")

    def test_extracts_from_markdown_and_links_when_html_is_missing(self):
        markdown = "Fale com vendas@empresa.com.br, telefone (11) 2222-3333 e WhatsApp comercial."
        links = [
            "https://www.linkedin.com/company/empresa-y/",
            "https://wa.me/5511988887777",
        ]

        contatos = _extrair_contatos_do_conteudo(
            "https://empresa.com.br",
            texto=markdown,
            links=links,
        )

        self.assertEqual(contatos["email"], "vendas@empresa.com.br")
        self.assertEqual(contatos["whatsapp"], "")
        self.assertEqual(contatos["telefone"], "(11) 2222-3333")
        self.assertEqual(contatos["linkedin_empresa"], "https://www.linkedin.com/company/empresa-y/")

    def test_does_not_promote_wa_link_without_whatsapp_context(self):
        contatos = _extrair_contatos_do_conteudo(
            "https://empresa.com.br",
            texto="Atendimento geral (11) 2222-3333",
            links=["https://wa.me/5511988887777"],
        )

        self.assertEqual(contatos["whatsapp"], "")
        self.assertEqual(contatos["telefone"], "(11) 2222-3333")

    def test_extracts_whatsapp_when_text_has_explicit_context(self):
        contatos = _extrair_contatos_do_conteudo(
            "https://empresa.com.br",
            texto="Fale no WhatsApp +55 (11) 98888-7777 para comercial.",
        )

        self.assertEqual(contatos["whatsapp"], "5511988887777")


if __name__ == "__main__":
    unittest.main()
