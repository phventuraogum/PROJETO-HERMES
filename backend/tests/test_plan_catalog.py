import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


from api import plan_catalog


class PlanCatalogTests(unittest.TestCase):
    def test_is_missing_plans_table_detects_schema_cache_error(self):
        self.assertTrue(
            plan_catalog.is_missing_plans_table(
                404,
                '{"code":"PGRST205","message":"Could not find the table public.plans in the schema cache"}',
            )
        )

    def test_is_missing_organizations_table_detects_schema_cache_error(self):
        self.assertTrue(
            plan_catalog.is_missing_organizations_table(
                404,
                '{"code":"PGRST205","message":"Could not find the table public.organizations in the schema cache"}',
            )
        )


if __name__ == "__main__":
    unittest.main()
