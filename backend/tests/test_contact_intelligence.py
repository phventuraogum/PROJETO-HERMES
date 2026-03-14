import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api import contact_intelligence as ci


class ContactIntelligenceTests(unittest.TestCase):
    def test_normalize_partner_role_maps_receita_code(self):
        self.assertEqual(ci._normalize_partner_role("49"), "Socio-Administrador")
        self.assertEqual(ci._normalize_partner_role("22"), "Socio")

    def test_get_cached_company_intelligence_normalizes_cached_roles(self):
        service = ci.ContactIntelligenceService()

        payload = {
            "contacts": [
                {"name": "JOAO TESTE", "role": "49", "emails": []},
                {"name": "MARIA TESTE", "role": "Diretor", "emails": []},
            ]
        }

        class FakeResult:
            def fetchone(self):
                return [ci.json.dumps(payload)]

        class FakeConn:
            def execute(self, sql, *_args, **_kwargs):
                if "information_schema.tables" in sql:
                    class ExistsResult:
                        def fetchone(self_inner):
                            return (1,)
                    return ExistsResult()
                return FakeResult()

        @contextmanager
        def fake_get_connection(read_only=True):
            self.assertTrue(read_only)
            yield FakeConn()

        with mock.patch.object(ci, "get_connection", fake_get_connection):
            cached = service.get_cached_company_intelligence("12345678000190")

        self.assertEqual(cached["contacts"][0]["role"], "Socio-Administrador")
        self.assertEqual(cached["contacts"][1]["role"], "Diretor")

    def test_get_cached_company_intelligence_returns_none_when_table_is_missing(self):
        service = ci.ContactIntelligenceService()

        class FakeConn:
            def execute(self, *_args, **_kwargs):
                raise RuntimeError('Catalog Error: Table with name "company_domains" does not exist')

        @contextmanager
        def fake_get_connection(read_only=True):
            self.assertTrue(read_only)
            yield FakeConn()

        with mock.patch.object(ci, "get_connection", fake_get_connection):
            cached = service.get_cached_company_intelligence("12345678000190")

        self.assertIsNone(cached)

    def test_infer_pattern_matches_first_last(self):
        pattern = ci.infer_pattern_for_name_email(
            "Joao Silva",
            "joao.silva@empresa.com.br",
            "empresa.com.br",
        )

        self.assertEqual(pattern, "first.last")

    def test_generate_candidate_emails_prioritizes_inferred_pattern(self):
        candidates = ci.generate_candidate_emails(
            "Maria Clara",
            "empresa.com.br",
            pattern="first.last",
        )

        self.assertGreater(len(candidates), 0)
        self.assertEqual(candidates[0]["email"], "maria.clara@empresa.com.br")
        self.assertEqual(candidates[0]["kind"], "guessed")

    def test_classify_verification_status_prefers_rejected_as_invalid(self):
        status = ci.classify_verification_status(
            {
                "formato_valido": True,
                "dominio_valido": True,
                "mx_valido": True,
                "smtp_status": "rejected",
                "score": 0.0,
            }
        )

        self.assertEqual(status, "invalid")


if __name__ == "__main__":
    unittest.main()
