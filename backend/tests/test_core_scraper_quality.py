import sys
import unittest
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from core_scraper import (
    _host_contato_banido,
    _normalizar_url_publica,
    _pontuar_resultado_site_oficial,
    _selecionar_melhor_email,
    _slug_linkedin_confere_nome,
    processar_empresa_google,
)


class CoreScraperQualityTests(unittest.TestCase):
    def test_normalizes_tracking_url_to_public_root(self):
        self.assertEqual(
            _normalizar_url_publica("https://nubank.com.br/nu/conta?msockid=abc123"),
            "https://nubank.com.br/",
        )
        self.assertEqual(
            _normalizar_url_publica("https://ri.magazineluiza.com.br/ShowCanal/Quem-Somos?x=1"),
            "https://magazineluiza.com.br/",
        )

    def test_scores_company_homepage_above_forum_noise(self):
        forum = {
            "titulo": "TOTVS DevForum - Moderar question",
            "link": "https://devforum.totvs.com.br/3824/history",
            "descricao": "Forum tecnico TOTVS",
        }
        home = {
            "titulo": "TOTVS - A maior empresa de tecnologia do Brasil",
            "link": "https://www.totvs.com/",
            "descricao": "Empresa de tecnologia",
        }

        self.assertGreater(
            _pontuar_resultado_site_oficial(home, "TOTVS"),
            _pontuar_resultado_site_oficial(forum, "TOTVS"),
        )

    def test_rejects_directory_domains_as_contact_source(self):
        self.assertTrue(_host_contato_banido("https://www.informecadastral.com.br/empresa/acme"))
        self.assertTrue(_host_contato_banido("cadastroempresa.com.br"))
        self.assertFalse(_host_contato_banido("https://www.acme.com.br/contato"))

    def test_prefers_same_domain_non_institutional_email(self):
        escolhido = _selecionar_melhor_email(
            ["dpo@nubank.com.br", "marketing@nubank.com.br"],
            "https://nubank.com.br/",
        )
        self.assertEqual(escolhido, "marketing@nubank.com.br")

    def test_ignores_asset_like_false_positive_email(self):
        escolhido = _selecionar_melhor_email(
            ["cartao_luiza_mc_cred_preferencial_f_completo%201@2x.png", "fiscal.estadual@magazineluiza.com.br"],
            "https://magazineluiza.com.br/",
        )
        self.assertEqual(escolhido, "fiscal.estadual@magazineluiza.com.br")

    def test_rejects_linkedin_slug_without_name_match(self):
        self.assertFalse(
            _slug_linkedin_confere_nome(
                "https://www.linkedin.com/in/allan-rodrigo-7874b6124",
                "Luiza Trajano",
            )
        )
        self.assertTrue(
            _slug_linkedin_confere_nome(
                "https://www.linkedin.com/in/david-velez-1004875",
                "David Velez",
            )
        )
        self.assertTrue(
            _slug_linkedin_confere_nome(
                "https://br.linkedin.com/in/david-v%C3%A9lez-1004875",
                "David Velez",
            )
        )


class CoreScraperFastModeTests(unittest.IsolatedAsyncioTestCase):
    async def test_fast_mode_skips_linkedin_discovery(self):
        dados_site = {
            "site": "https://empresa.com.br/",
            "email": "contato@empresa.com.br",
            "telefone": "",
            "whatsapp": "",
            "linkedin_empresa": None,
            "linkedin_perfis": [],
            "source": "HTTPX",
        }

        with mock.patch("core_scraper.extrair_contatos_site", new=mock.AsyncMock(return_value=dados_site)), \
             mock.patch("core_scraper._buscar_melhor_site_oficial", new=mock.AsyncMock(return_value={"melhor_match": None, "emails_snippet": [], "whats_snippet": []})), \
             mock.patch("core_scraper.buscar_google", new=mock.AsyncMock(return_value=[])), \
             mock.patch("core_scraper.buscar_linkedin_empresa", new=mock.AsyncMock(return_value="https://www.linkedin.com/company/empresa/")) as linkedin_empresa, \
             mock.patch("core_scraper.buscar_linkedin_socio_ultra", new=mock.AsyncMock(return_value={"link": "https://www.linkedin.com/in/socio/"})) as linkedin_socio:
            resultado = await processar_empresa_google(
                empresa_nome="Empresa Teste",
                cidade="Belo Horizonte",
                socios=["Ana Teste"],
                site_url="https://empresa.com.br",
                modo_rapido=True,
            )

        linkedin_empresa.assert_not_awaited()
        linkedin_socio.assert_not_awaited()
        self.assertEqual(resultado["email"], "contato@empresa.com.br")


if __name__ == "__main__":
    unittest.main()
