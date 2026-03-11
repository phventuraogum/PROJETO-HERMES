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
