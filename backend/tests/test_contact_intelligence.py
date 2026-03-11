import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api import contact_intelligence as ci


class ContactIntelligenceTests(unittest.TestCase):
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
