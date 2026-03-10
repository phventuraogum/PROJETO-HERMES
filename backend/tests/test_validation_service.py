import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api.validation_service import normalizar_whatsapp_br


class ValidationServiceTests(unittest.TestCase):
    def test_rejects_placeholder_whatsapp(self):
        self.assertIsNone(normalizar_whatsapp_br("5544999999999"))

    def test_accepts_valid_whatsapp(self):
        self.assertEqual(normalizar_whatsapp_br("+55 (11) 98888-7777"), "5511988887777")


if __name__ == "__main__":
    unittest.main()
