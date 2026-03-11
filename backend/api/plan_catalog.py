from __future__ import annotations

from typing import Optional


FALLBACK_PLANS = (
    {
        "name": "free",
        "label": "Gratis",
        "price_brl": 0.0,
        "searches_per_month": 50,
        "enrichments_per_month": 15,
        "exports_per_month": 5,
        "can_export_crm": False,
        "can_use_pipeline": False,
        "can_multi_user": False,
        "is_active": True,
    },
    {
        "name": "starter",
        "label": "Starter",
        "price_brl": 597.0,
        "searches_per_month": 500,
        "enrichments_per_month": 150,
        "exports_per_month": 50,
        "can_export_crm": True,
        "can_use_pipeline": False,
        "can_multi_user": False,
        "is_active": True,
    },
    {
        "name": "pro",
        "label": "Pro",
        "price_brl": 947.0,
        "searches_per_month": 2000,
        "enrichments_per_month": 800,
        "exports_per_month": 200,
        "can_export_crm": True,
        "can_use_pipeline": True,
        "can_multi_user": False,
        "is_active": True,
    },
    {
        "name": "enterprise",
        "label": "Enterprise",
        "price_brl": 1297.0,
        "searches_per_month": 10000,
        "enrichments_per_month": 5000,
        "exports_per_month": 1000,
        "can_export_crm": True,
        "can_use_pipeline": True,
        "can_multi_user": True,
        "is_active": True,
    },
)


def list_fallback_plans() -> list[dict]:
    return [dict(plan) for plan in FALLBACK_PLANS]


def get_fallback_plan(plan_name: str) -> Optional[dict]:
    for plan in FALLBACK_PLANS:
        if plan["name"] == plan_name:
            return dict(plan)
    return None


def is_missing_table(status_code: int, response_text: str, table_name: str) -> bool:
    if status_code != 404:
        return False

    body = (response_text or "").lower()
    return table_name.lower() in body or "schema cache" in body or "pgrst205" in body


def is_missing_plans_table(status_code: int, response_text: str) -> bool:
    return is_missing_table(status_code, response_text, "public.plans")


def is_missing_organizations_table(status_code: int, response_text: str) -> bool:
    return is_missing_table(status_code, response_text, "public.organizations")
