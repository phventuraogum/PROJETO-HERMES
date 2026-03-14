import os
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


os.environ.setdefault("ENVIRONMENT", "development")


from core_scraper import filtrar_resultados


class CoreScraperTests(unittest.TestCase):
    def test_filtrar_resultados_descarta_sites_genericos_e_mantem_site_oficial(self):
        resultados = [
            {
                "titulo": "Google Maps",
                "link": "https://maps.google.com/maps?q=globalcast+contabilidade",
                "descricao": "Veja no Google Maps",
            },
            {
                "titulo": "Hilário significado no Dicio",
                "link": "https://www.dicio.com.br/hilario",
                "descricao": "Significado de Hilário",
            },
            {
                "titulo": "Globalcast Contabilidade - Site Oficial",
                "link": "https://globalauditoria.com.br/",
                "descricao": "Globalcast Contabilidade em Sao Paulo",
            },
        ]

        filtrados = filtrar_resultados(resultados, empresa_nome="Globalcast Contabilidade")

        self.assertEqual(len(filtrados), 1)
        self.assertEqual(filtrados[0]["link"], "https://globalauditoria.com.br/")


if __name__ == "__main__":
    unittest.main()
