import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


os.environ.setdefault("ENVIRONMENT", "development")


from core_scraper import (
    _buscar_melhor_site_oficial,
    _cnpj_presente_no_html,
    _dominio_confirmado_rdap,
    _dominio_email_corporativo,
    _formatar_cnpj,
    _querys_site_oficial,
    _raiz_cnpj,
)


CNPJ = "12.345.678/0001-90"


class HelpersSiteOficialTests(unittest.TestCase):
    def test_raiz_cnpj(self):
        self.assertEqual(_raiz_cnpj(CNPJ), "12345678")
        self.assertEqual(_raiz_cnpj("12345678000190"), "12345678")
        self.assertEqual(_raiz_cnpj(""), "")
        self.assertEqual(_raiz_cnpj("123"), "")

    def test_formatar_cnpj(self):
        self.assertEqual(_formatar_cnpj("12345678000190"), CNPJ)
        self.assertEqual(_formatar_cnpj(CNPJ), CNPJ)
        self.assertEqual(_formatar_cnpj("123"), "")

    def test_dominio_email_corporativo_aceita_dominio_proprio(self):
        self.assertEqual(_dominio_email_corporativo("contato@acmetubos.com.br"), "acmetubos.com.br")
        self.assertEqual(_dominio_email_corporativo("FISCAL@Acme.COM"), "acme.com")

    def test_dominio_email_corporativo_colapsa_subdominio(self):
        self.assertEqual(_dominio_email_corporativo("rh@mail.acmetubos.com.br"), "acmetubos.com.br")

    def test_dominio_email_corporativo_rejeita_provedores_gratuitos(self):
        for email in ("x@gmail.com", "x@hotmail.com", "x@uol.com.br", "x@terra.com.br", "x@yahoo.com.br"):
            self.assertEqual(_dominio_email_corporativo(email), "", email)

    def test_dominio_email_corporativo_rejeita_diretorios_e_invalidos(self):
        self.assertEqual(_dominio_email_corporativo("x@econodata.com.br"), "")
        self.assertEqual(_dominio_email_corporativo("sem-arroba"), "")
        self.assertEqual(_dominio_email_corporativo(""), "")

    def test_cnpj_presente_no_html_formatado_e_cru(self):
        self.assertTrue(_cnpj_presente_no_html("<footer>CNPJ: 12.345.678/0001-90</footer>", CNPJ))
        self.assertTrue(_cnpj_presente_no_html("cnpj 12345678000190 rodape", CNPJ))
        # Raiz de outra filial tambem confirma a empresa
        self.assertTrue(_cnpj_presente_no_html("CNPJ 12.345.678/0002-71", CNPJ))
        self.assertFalse(_cnpj_presente_no_html("CNPJ 99.888.777/0001-00", CNPJ))
        self.assertFalse(_cnpj_presente_no_html("", CNPJ))

    def test_querys_incluem_cnpj_quando_disponivel(self):
        queries = _querys_site_oficial("Acme Tubos", "Curitiba", "12345678000190")
        self.assertIn('"12.345.678/0001-90"', queries)
        self.assertTrue(any("Acme Tubos" in q and "12.345.678/0001-90" in q for q in queries))

    def test_querys_sem_cnpj_mantem_comportamento(self):
        queries = _querys_site_oficial("Acme Tubos", "Curitiba")
        self.assertFalse(any("12.345.678" in q for q in queries))
        self.assertTrue(any("site oficial" in q for q in queries))


class RdapConfirmacaoTests(unittest.IsolatedAsyncioTestCase):
    async def test_confirma_quando_raiz_bate(self):
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="12345678000190")):
            self.assertTrue(await _dominio_confirmado_rdap("acmetubos.com.br", CNPJ))

    async def test_confirma_por_raiz_mesmo_outra_filial(self):
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="12345678000271")):
            self.assertTrue(await _dominio_confirmado_rdap("acmetubos.com.br", CNPJ))

    async def test_nega_quando_titular_e_outro(self):
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="99888777000100")):
            self.assertFalse(await _dominio_confirmado_rdap("acmetubos.com.br", CNPJ))

    async def test_none_sem_informacao(self):
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="")):
            self.assertIsNone(await _dominio_confirmado_rdap("acmetubos.com.br", CNPJ))
        self.assertIsNone(await _dominio_confirmado_rdap("acmetubos.com.br", ""))


class BuscarMelhorSiteOficialTests(unittest.IsolatedAsyncioTestCase):
    async def test_email_receita_confirmado_por_rdap_retorna_direto(self):
        buscar_mock = AsyncMock(return_value=[])
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="12345678000190")), \
             patch("core_scraper.buscar_google", new=buscar_mock):
            resultado = await _buscar_melhor_site_oficial(
                "Acme Tubos", "Curitiba", cnpj=CNPJ, email_receita="contato@acmetubos.com.br"
            )
        match = resultado["melhor_match"]
        self.assertEqual(match["_confianca_site"], "rdap_email_receita")
        self.assertIn("acmetubos.com.br", match["link"])
        buscar_mock.assert_not_called()

    async def test_candidato_de_busca_confirmado_por_rdap_vence(self):
        resultados_busca = [
            {
                "titulo": "Acme Tubos - Site Oficial",
                "link": "https://acmetubos.com.br/",
                "descricao": "Acme Tubos em Curitiba",
            }
        ]
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="12345678000190")), \
             patch("core_scraper.buscar_google", new=AsyncMock(return_value=resultados_busca)):
            resultado = await _buscar_melhor_site_oficial("Acme Tubos", "Curitiba", cnpj=CNPJ)
        match = resultado["melhor_match"]
        self.assertEqual(match["_confianca_site"], "rdap")
        self.assertGreaterEqual(float(match["_score_site"]), 100.0)

    async def test_rdap_divergente_penaliza_candidato(self):
        resultados_busca = [
            {
                "titulo": "Acme Tubos - Site Oficial",
                "link": "https://acmetubos.com.br/",
                "descricao": "Acme Tubos em Curitiba",
            }
        ]

        async def rodar(documento_titular):
            with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value=documento_titular)), \
                 patch("core_scraper.buscar_google", new=AsyncMock(return_value=resultados_busca)), \
                 patch("core_scraper._validar_site_por_conteudo", new=AsyncMock(return_value=None)):
                return await _buscar_melhor_site_oficial("Acme Tubos", "Curitiba", cnpj=CNPJ)

        sem_rdap = await rodar("")
        divergente = await rodar("99888777000100")

        match = divergente["melhor_match"]
        self.assertEqual(match["_confianca_site"], "rdap_divergente")
        self.assertEqual(
            float(match["_score_site"]),
            float(sem_rdap["melhor_match"]["_score_site"]) - 40.0,
        )

    async def test_cnpj_na_pagina_promove_melhor_candidato(self):
        resultados_busca = [
            {
                "titulo": "Acme Tubos - Site Oficial",
                "link": "https://acmetubos.com.br/",
                "descricao": "Acme Tubos em Curitiba site oficial",
            }
        ]
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="")), \
             patch("core_scraper.buscar_google", new=AsyncMock(return_value=resultados_busca)), \
             patch("core_scraper._validar_site_por_conteudo", new=AsyncMock(return_value=True)):
            resultado = await _buscar_melhor_site_oficial("Acme Tubos", "Curitiba", cnpj=CNPJ)
        match = resultado["melhor_match"]
        self.assertEqual(match["_confianca_site"], "cnpj_na_pagina")

    async def test_sem_sinais_fortes_mantem_heuristica(self):
        resultados_busca = [
            {
                "titulo": "Acme Tubos - Site Oficial",
                "link": "https://acmetubos.com.br/",
                "descricao": "Acme Tubos em Curitiba site oficial",
            }
        ]
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="")), \
             patch("core_scraper.buscar_google", new=AsyncMock(return_value=resultados_busca)), \
             patch("core_scraper._validar_site_por_conteudo", new=AsyncMock(return_value=None)):
            resultado = await _buscar_melhor_site_oficial("Acme Tubos", "Curitiba", cnpj=CNPJ)
        match = resultado["melhor_match"]
        self.assertEqual(match["_confianca_site"], "heuristica")

    async def test_modo_rapido_nao_busca_conteudo_da_pagina(self):
        resultados_busca = [
            {
                "titulo": "Acme Tubos - Site Oficial",
                "link": "https://acmetubos.com.br/",
                "descricao": "Acme Tubos em Curitiba site oficial",
            }
        ]
        validar_mock = AsyncMock(return_value=True)
        with patch("core_scraper._rdap_documento_titular", new=AsyncMock(return_value="")), \
             patch("core_scraper.buscar_google", new=AsyncMock(return_value=resultados_busca)), \
             patch("core_scraper._validar_site_por_conteudo", new=validar_mock):
            await _buscar_melhor_site_oficial("Acme Tubos", "Curitiba", cnpj=CNPJ, modo_rapido=True)
        validar_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
