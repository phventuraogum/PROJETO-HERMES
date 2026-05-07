import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api import assertiva_decisores as ad


class AssertivaDecisoresTests(unittest.TestCase):
    def test_extract_decisores_normalizes_whatsapp_sem_fallback_empresa(self):
        normalizado = {
            "cnpj": "12345678000199",
            "encontrado": True,
            "telefones": [
                {"numero": "+55 (11) 98888-7777", "whatsapp": True},
                {"numero": "+55 (11) 3333-4444", "whatsapp": False},
            ],
            "socios": [],
            "raw": {
                "resposta": {
                    "socios": [
                        {
                            "nome": "Joao Silva",
                            "cargo": "CEO",
                            "cpfCnpj": "11111111111",
                            "telefone": "+55 (11) 97777-2222",
                        },
                        {
                            "nome": "Maria Souza",
                            "cargo": "Diretora",
                            "cpfCnpj": "22222222222",
                        },
                    ]
                }
            },
        }

        result = ad.extract_decisores_from_assertiva_normalizado(normalizado, max_decisores=10)
        decisores = result["decisores"]

        self.assertEqual(len(decisores), 2)

        socio1 = decisores[0]
        self.assertEqual(socio1["nome"], "Joao Silva")
        self.assertEqual(socio1["cargo"], "CEO")
        self.assertEqual(socio1["whatsapp_fonte"], "assertiva_socio")
        self.assertIn("5511977772222", socio1["whatsapp"])

        socio2 = decisores[1]
        self.assertEqual(socio2["nome"], "Maria Souza")
        self.assertEqual(socio2["cargo"], "Diretora")
        self.assertEqual(socio2["whatsapp_fonte"], "sem_whatsapp_vinculado")
        self.assertEqual(socio2["whatsapp"], [])


if __name__ == "__main__":
    unittest.main()

