"""
MAI-10 · Eval de accuracy do calcular_score_icp_v2 contra golden_dataset_icp.json.

Roda todos os 50 casos rotulados, compara tier retornado vs esperado, e reporta:
  - Accuracy global (% acertos)
  - Matriz de confusão (tier esperado × tier obtido)
  - Casos errados detalhados

Critério de sucesso: accuracy ≥ 75% (gate do épico ICP v3).

Uso:
  python backend/tests/test_icp_accuracy.py
  python backend/tests/test_icp_accuracy.py --verbose
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from enrichment_score_v2 import calcular_score_icp_v2

DATASET_PATH = Path(__file__).resolve().parent / "golden_dataset_icp.json"
ACCURACY_GATE = 0.75


def normalize_tier(tier: str) -> str:
    """Remove emoji do tier pra comparação ('HOT 🔥' → 'HOT')."""
    return tier.replace(" 🔥", "").replace(" 🌡️", "").replace(" ❄️", "").strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verbose", "-v", action="store_true", help="Mostra todos os casos, não só falhas")
    args = parser.parse_args()

    if not DATASET_PATH.exists():
        print(f"FAIL: {DATASET_PATH} não encontrado.")
        return 2

    raw = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    cases = raw.get("data") or []
    if not cases:
        print("FAIL: dataset vazio.")
        return 2

    print(f"Golden dataset: {len(cases)} casos · gate accuracy ≥ {ACCURACY_GATE:.0%}")
    print()

    confusion: dict[tuple[str, str], int] = defaultdict(int)
    correct = 0
    fails: list[tuple[dict, str, str, float]] = []

    for case in cases:
        case_id = case.get("id", "?")
        label = case.get("label", "")
        expected = normalize_tier(case.get("expected_tier", ""))
        inputs = case.get("input") or {}

        try:
            result = calcular_score_icp_v2(**inputs)
        except TypeError as e:
            print(f"  [error] {case_id}: input inválido — {e}")
            fails.append((case, expected, "ERROR", 0.0))
            confusion[(expected, "ERROR")] += 1
            continue

        actual = normalize_tier(result["tier"])
        score = result["score"]
        confusion[(expected, actual)] += 1

        if actual == expected:
            correct += 1
            if args.verbose:
                print(f"  [ok]   {case_id:<10} {expected:<12} (score={score:.0f}) · {label}")
        else:
            fails.append((case, expected, actual, score))
            print(f"  [fail] {case_id:<10} expected={expected:<12} got={actual:<12} (score={score:.0f}) · {label}")

    total = len(cases)
    accuracy = correct / total

    print()
    print(f"Accuracy: {correct}/{total} = {accuracy:.1%}")

    # Matriz de confusão
    tiers = ["HOT", "WARM", "COLD", "UNQUALIFIED"]
    print()
    print("Matriz de confusão (linhas = esperado, colunas = obtido):")
    header = "  " + " " * 14 + " ".join(f"{t:>13}" for t in tiers)
    print(header)
    for expected_tier in tiers:
        row = [str(confusion.get((expected_tier, got), 0)) for got in tiers]
        print(f"  {expected_tier:<13} " + " ".join(f"{v:>13}" for v in row))

    print()
    if accuracy >= ACCURACY_GATE:
        print(f"✓ GATE PASSOU (≥ {ACCURACY_GATE:.0%}). Épico ICP v3 (P2) pode marcar shipped.")
        return 0
    else:
        print(f"✗ GATE FALHOU (< {ACCURACY_GATE:.0%}). Investigue casos errados acima.")
        if fails:
            print()
            print(f"Detalhes dos {len(fails)} casos errados:")
            for case, exp, got, score in fails:
                print(f"  - {case['id']}: expected={exp}, got={got} (score={score:.0f})")
                print(f"    label: {case.get('label', '')}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
