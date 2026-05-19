"""MAI-24 · Smoke tests dos helpers de CNPJ (limpar_cnpj, formatar_cnpj, validar_cnpj)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.validation_service import limpar_cnpj, formatar_cnpj, validar_cnpj


def _check(label: str, got, expected):
    ok = got == expected
    tag = "[ok]  " if ok else "[fail]"
    print(f"  {tag} {label:<50} got={got!r:<30} expected={expected!r}")
    return ok


def main():
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    print("limpar_cnpj:")
    cases_clean = [
        ("12.345.678/0001-95",  "12345678000195"),
        ("12345678000195",      "12345678000195"),
        ("345678000195",        "00345678000195"),   # zfill
        ("",                    None),
        (None,                  None),
        ("abc",                 None),
        ("123456789012345",     None),                # > 14 dígitos
    ]
    n_ok = sum(_check(repr(inp), limpar_cnpj(inp), exp) for inp, exp in cases_clean)
    print(f"  → {n_ok}/{len(cases_clean)} ok")

    print()
    print("formatar_cnpj:")
    cases_fmt = [
        ("12345678000195",     "12.345.678/0001-95"),
        ("12.345.678/0001-95", "12.345.678/0001-95"),
        ("00345678000195",     "00.345.678/0001-95"),
        ("",                   None),
        # Nota: formatar_cnpj só formata; não valida DV. Pra rejeitar CNPJ inválido,
        # chame validar_cnpj antes. "123" vira "00.000.000/0001-23" (zfill — feature
        # pra CNPJs armazenados sem leading zeros em bases legadas).
    ]
    n_ok = sum(_check(repr(inp), formatar_cnpj(inp), exp) for inp, exp in cases_fmt)
    print(f"  → {n_ok}/{len(cases_fmt)} ok")

    print()
    print("validar_cnpj:")
    # CNPJs reais válidos (públicos via consulta Receita): Petrobras, Vale, Itau
    cases_val = [
        ("33000167000101",      True),   # Petrobras
        ("33592510000154",      True),   # Vale
        ("60872504000123",      True),   # Itau Unibanco
        ("11.222.333/0001-81",  True),   # CNPJ de teste com DV correto
        ("00000000000000",      False),  # todos zeros
        ("11111111111111",      False),  # todos iguais
        ("12345678901234",      False),  # DV errado
        ("123",                 False),  # comprimento curto demais
        ("",                    False),
        (None,                  False),
    ]
    n_ok = 0
    for inp, esperado in cases_val:
        valido, limpo = validar_cnpj(inp)
        ok = valido == esperado
        tag = "[ok]  " if ok else "[fail]"
        print(f"  {tag} {repr(inp):<25} valido={valido!s:<6} esperado={esperado}")
        if ok: n_ok += 1
    print(f"  → {n_ok}/{len(cases_val)} ok")

    print()
    print("formatar_cnpj round-trip:")
    digitos_originais = "33000167000101"
    formatado = formatar_cnpj(digitos_originais)
    de_volta = limpar_cnpj(formatado)
    rt_ok = de_volta == digitos_originais
    print(f"  {'[ok]  ' if rt_ok else '[fail]'} {digitos_originais} → {formatado} → {de_volta}")


if __name__ == "__main__":
    main()
