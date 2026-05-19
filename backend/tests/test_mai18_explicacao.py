"""MAI-18 smoke: gera explicacao em PT-BR pra varios tiers."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from enrichment_score_v2 import calcular_score_icp_v2

cases = [
    ("HOT saudavel", dict(porte="GRANDE", cnae_principal="6201", situacao_ativa=True,
                          tem_email=True, tem_whatsapp=True, tem_site=True,
                          tem_linkedin_socio=True, n_socios_linkedin=2,
                          capital_social=500000, capital_minima=50000, n_socios=3)),
    ("WARM com penalidades", dict(porte="MEDIO", cnae_principal="6201", situacao_ativa=True,
                                   tem_email=True, tem_site=True,
                                   capital_social=80000, capital_minima=50000, n_socios=2,
                                   tem_divida_pgfn=True, valor_divida_pgfn=250000)),
    ("UNQ MEI", dict(porte="MEI", cnae_principal="6201")),
    ("UNQ admin publica", dict(cnae_principal="8411")),
    ("UNQ BAIXADA", dict(situacao_rf="BAIXADA")),
    ("UNQ inativa", dict(situacao_ativa=False)),
]

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

for label, kwargs in cases:
    r = calcular_score_icp_v2(**kwargs)
    score = r["score"]
    tier = r["tier"]
    expl = r["explicacao"]
    print(f"{label}: score={score} tier={tier}")
    print(f"  -> {expl}")
    print()
