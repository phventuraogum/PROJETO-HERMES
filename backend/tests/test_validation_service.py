import sys
import unittest
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api import validation_service as vs


class ValidationServiceTests(unittest.TestCase):
    def test_rejects_placeholder_whatsapp(self):
        self.assertIsNone(vs.normalizar_whatsapp_br("5544999999999"))

    def test_accepts_valid_whatsapp(self):
        self.assertEqual(vs.normalizar_whatsapp_br("+55 (11) 98888-7777"), "5511988887777")

    def test_validar_email_requires_mx(self):
        with mock.patch.object(
            vs,
            "_consultar_mx_email",
            return_value={"mx_valido": False, "mx_hosts": [], "dns_status": "sem_mx"},
        ):
            resultado = vs.validar_email("contato@empresa.com.br")

        self.assertFalse(resultado["valido"])
        self.assertFalse(resultado["mx_valido"])
        self.assertEqual(resultado["motivo"], "Dominio sem MX valido")

    def test_validar_email_accepts_smtp_probe(self):
        with mock.patch.object(
            vs,
            "_consultar_mx_email",
            return_value={"mx_valido": True, "mx_hosts": ["mx.empresa.com.br"], "dns_status": "mx"},
        ), mock.patch.object(
            vs,
            "_smtp_probe_recipient",
            return_value={
                "smtp_status": "accepted",
                "smtp_codigo": 250,
                "smtp_detalhe": "ok",
                "smtp_host": "mx.empresa.com.br",
            },
        ):
            resultado = vs.validar_email("contato@empresa.com.br", probe_smtp=True)

        self.assertTrue(resultado["valido"])
        self.assertEqual(resultado["smtp_status"], "accepted")
        self.assertGreater(resultado["score"], 0.9)

    def test_validar_email_rejects_smtp_recipient(self):
        with mock.patch.object(
            vs,
            "_consultar_mx_email",
            return_value={"mx_valido": True, "mx_hosts": ["mx.empresa.com.br"], "dns_status": "mx"},
        ), mock.patch.object(
            vs,
            "_smtp_probe_recipient",
            return_value={
                "smtp_status": "rejected",
                "smtp_codigo": 550,
                "smtp_detalhe": "user unknown",
                "smtp_host": "mx.empresa.com.br",
            },
        ):
            resultado = vs.validar_email("inexistente@empresa.com.br", probe_smtp=True)

        self.assertFalse(resultado["valido"])
        self.assertEqual(resultado["smtp_status"], "rejected")
        self.assertEqual(resultado["score"], 0.0)


if __name__ == "__main__":
    unittest.main()
