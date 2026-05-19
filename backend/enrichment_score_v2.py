"""
Score ICP v2 — Pontuação Inteligente de Leads
Substitui o score binário anterior por um sistema de 0-100 baseado
em múltiplos sinais: capital, contatos disponíveis, sócios no LinkedIn,
tempo de abertura, porte, localização estratégica e dados de enriquecimento.
"""
import unicodedata
from datetime import datetime
from typing import Dict, List, Optional


def _norm(s: Optional[str]) -> str:
    """Uppercase + strip accents para comparação determinística de cidade/UF.
    PGFN/RF entregam dados com/sem acento — sem normalização, 'Maringa' não
    bateria com 'MARINGÁ' (bug MAI-05).
    """
    if not s:
        return ""
    text = unicodedata.normalize("NFKD", str(s))
    text = text.encode("ascii", "ignore").decode("ascii")
    return text.strip().upper()


# Cidades com maior densidade de tomadores de decisão B2B.
# Mantidas SEM acento — comparação sempre via _norm().
_CIDADES_PREMIUM = {
    "SAO PAULO", "CAMPINAS", "GUARULHOS", "OSASCO", "SANTO ANDRE",
    "CURITIBA", "LONDRINA", "MARINGA", "JOINVILLE", "BLUMENAU",
    "PORTO ALEGRE", "CAXIAS DO SUL", "NOVO HAMBURGO",
    "BELO HORIZONTE", "UBERLANDIA", "CONTAGEM",
    "FLORIANOPOLIS", "ITAJAI",
    "BRASILIA", "GOIANIA", "MANAUS", "RECIFE", "FORTALEZA", "SALVADOR",
    "RIBEIRAO PRETO", "SAO JOSE DOS CAMPOS", "SOROCABA", "SANTOS",
    "BETIM", "JUIZ DE FORA",
}

# CNAEs com maior propensão a comprar soluções tecnológicas/automação
_CNAES_TECH_FRIENDLY = {
    "6201", "6202", "6203", "6204", "6209",   # TI/Software
    "6311", "6319", "6391", "6399",            # Portais/dados
    "7020", "7111", "7112", "7119", "7120",   # Consultoria/Engenharia
    "6910", "6920",                            # Contabilidade/Jurídico
    "5811", "5812", "5813", "5819", "5820",   # Editoras/Mídia
    "7410", "7490",                            # Design/Outros serviços
    "4649", "4651", "4652", "4661", "4669",   # Comércio atacado
    "2511", "2512", "2519", "2521", "2529",   # Metalurgia/Maquinário
    "1811", "1812", "1821",                    # Gráficas/Impressão
    "6010", "6021", "6022",                    # Rádio/TV
    "8219", "8220",                            # Serviços administrativos
}

# MAI-07 · Disqualifiers HARD — zeram o score (UNQUALIFIED).
# CNAEs raiz que historicamente não convertem em vendas B2B premium (Pinn beachhead R$50M+).
_DISQUALIFY_CNAE_PREFIXES_DEFAULT = (
    # Atividades de pessoa física / autônomos
    "9700",   # Serviços domésticos
    "9491", "9492", "9493",  # Atividades de organizações religiosas/políticas/sindicais
    "9900",   # Organismos internacionais
    # Administração pública (não compra software B2B comercial)
    "8411", "8412", "8413",
    "8421", "8422", "8423", "8424", "8425",
    "8430",
    # Atividades sem fins lucrativos / filantrópicas
    "9499",
)

# Portes que NUNCA são alvo B2B premium
_DISQUALIFY_PORTES_DEFAULT = (
    "MEI",  # Microempreendedor individual — não compra software B2B
)


def calcular_score_icp_v2(
    capital_social: Optional[float] = None,
    capital_minima: Optional[float] = None,
    uf_empresa: Optional[str] = None,
    ufs_filtro: Optional[List[str]] = None,
    cidade_empresa: Optional[str] = None,
    cidades_filtro: Optional[List[str]] = None,
    # Campos de enriquecimento (opcionais, preenchem conforme disponibilidade)
    tem_site: bool = False,
    tem_email: bool = False,
    tem_whatsapp: bool = False,
    tem_linkedin_socio: bool = False,
    n_socios_linkedin: int = 0,
    tem_email_socio: bool = False,
    data_abertura: Optional[str] = None,
    porte: Optional[str] = None,
    cnae_principal: Optional[str] = None,
    n_socios: int = 0,
    tem_instagram: bool = False,
    situacao_ativa: bool = True,
    # MAI-07 · disqualifiers hard configuráveis por org
    disqualify_cnae_prefixes: Optional[List[str]] = None,
    disqualify_portes: Optional[List[str]] = None,
    # MAI-08 · saúde fiscal (PGFN + situação RF detalhada)
    situacao_rf: Optional[str] = None,  # 'ATIVA' | 'BAIXADA' | 'INAPTA' | 'SUSPENSA' | 'NULA'
    tem_divida_pgfn: bool = False,
    valor_divida_pgfn: Optional[float] = None,  # se conhecido, ajusta peso
) -> Dict:
    """
    Calcula score ICP v2 com breakdown detalhado.

    Retorna:
        score: float 0-100
        tier: 'HOT 🔥' | 'WARM 🌡️' | 'COLD ❄️' | 'UNQUALIFIED'
        sinais: lista de strings descrevendo os pontos positivos
        penalidades: lista de strings com fatores negativos
    """
    score = 0.0
    sinais: List[str] = []
    penalidades: List[str] = []

    # ── 0. DISQUALIFIERS HARD (eliminatórios — zeram score) ──────────────
    # MAI-07: condições que tornam o lead UNQUALIFIED imediatamente.
    cnae_prefixes = tuple(disqualify_cnae_prefixes) if disqualify_cnae_prefixes is not None else _DISQUALIFY_CNAE_PREFIXES_DEFAULT
    portes_excluded = tuple(p.upper() for p in (disqualify_portes if disqualify_portes is not None else _DISQUALIFY_PORTES_DEFAULT))

    cnae_str = str(cnae_principal or "")
    if cnae_str and cnae_prefixes:
        for prefix in cnae_prefixes:
            if cnae_str.startswith(prefix):
                _pen = [f"CNAE {cnae_str[:4]} fora do ICP (disqualifier hard)"]
                return {
                    "score": 0.0,
                    "tier": "UNQUALIFIED",
                    "sinais": [],
                    "penalidades": _pen,
                    "explicacao": explicar_score(0.0, "UNQUALIFIED", [], _pen),
                }

    porte_upper_check = (porte or "").upper().strip()
    if porte_upper_check and any(p in porte_upper_check for p in portes_excluded):
        _pen = [f"Porte {porte} fora do ICP (disqualifier hard)"]
        return {
            "score": 0.0,
            "tier": "UNQUALIFIED",
            "sinais": [],
            "penalidades": _pen,
            "explicacao": explicar_score(0.0, "UNQUALIFIED", [], _pen),
        }

    # MAI-08 · situação RF detalhada (eliminatórios além de situacao_ativa)
    situacao_rf_norm = (situacao_rf or "").upper().strip()
    SITUACOES_INVALIDAS = {"BAIXADA", "INAPTA", "SUSPENSA", "NULA"}
    if situacao_rf_norm in SITUACOES_INVALIDAS:
        _pen = [f"Situação RF {situacao_rf_norm} (disqualifier hard)"]
        return {
            "score": 0.0,
            "tier": "UNQUALIFIED",
            "sinais": [],
            "penalidades": _pen,
            "explicacao": explicar_score(0.0, "UNQUALIFIED", [], _pen),
        }

    # ── 1. SITUAÇÃO CADASTRAL (eliminatório) ─────────────────────────────
    if not situacao_ativa:
        _pen = ["Empresa inativa/baixada"]
        return {
            "score": 0.0,
            "tier": "UNQUALIFIED",
            "sinais": [],
            "penalidades": _pen,
            "explicacao": explicar_score(0.0, "UNQUALIFIED", [], _pen),
        }

    # ── 2. CAPITAL SOCIAL (0–20 pts) ─────────────────────────────────────
    if capital_social is not None and capital_social > 0:
        ref = capital_minima or 50_000
        ratio = capital_social / ref
        if ratio >= 5:
            score += 20
            sinais.append(f"Capital alto (R$ {capital_social:,.0f})")
        elif ratio >= 2:
            score += 15
            sinais.append(f"Capital sólido (R$ {capital_social:,.0f})")
        elif ratio >= 1:
            score += 10
            sinais.append(f"Capital adequado (R$ {capital_social:,.0f})")
        elif ratio >= 0.5:
            score += 5
        else:
            penalidades.append("Capital abaixo do mínimo ideal")

    # ── 3. CONTATOS DISPONÍVEIS (0–30 pts) ───────────────────────────────
    if tem_whatsapp:
        score += 12
        sinais.append("WhatsApp encontrado 📱")
    if tem_email_socio:
        score += 10
        sinais.append("Email do sócio/decisor 📧")
    elif tem_email:
        score += 7
        sinais.append("Email corporativo encontrado")
    if tem_site:
        score += 4
        sinais.append("Site corporativo")
    if tem_instagram:
        score += 2
        sinais.append("Presença Instagram")

    # ── 4. SÓCIOS NO LINKEDIN (0–15 pts) ─────────────────────────────────
    if n_socios_linkedin >= 2:
        score += 15
        sinais.append(f"{n_socios_linkedin} sócios no LinkedIn 👔")
    elif n_socios_linkedin == 1:
        score += 8
        sinais.append("Sócio encontrado no LinkedIn")
    elif tem_linkedin_socio:
        score += 6

    # ── 5. TEMPO DE ABERTURA (0–10 pts) ──────────────────────────────────
    if data_abertura:
        try:
            # Tenta vários formatos
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y%m%d"):
                try:
                    dt = datetime.strptime(str(data_abertura)[:10], fmt)
                    break
                except ValueError:
                    continue
            else:
                dt = None

            if dt:
                anos = (datetime.now() - dt).days / 365
                if 3 <= anos <= 12:
                    score += 10
                    sinais.append(f"Empresa consolidada ({anos:.0f} anos)")
                elif 1 <= anos < 3:
                    score += 7
                    sinais.append(f"Empresa jovem em crescimento ({anos:.0f} anos)")
                elif anos > 12:
                    score += 6
                    sinais.append(f"Empresa madura ({anos:.0f} anos)")
                else:
                    penalidades.append("Empresa muito recente (< 1 ano)")
        except Exception:
            pass

    # ── 6. PORTE (0–10 pts) ──────────────────────────────────────────────
    porte_upper = (porte or "").upper()
    if "GRANDE" in porte_upper:
        score += 10
        sinais.append("Grande porte")
    elif "MEDIO" in porte_upper or "MÉDIO" in porte_upper:
        score += 7
        sinais.append("Médio porte")
    elif "PEQUENO" in porte_upper:
        score += 4
        sinais.append("Pequeno porte")
    elif "MICRO" in porte_upper:
        score += 2

    # ── 7. LOCALIZAÇÃO (0–8 pts) ─────────────────────────────────────────
    cidade_norm = _norm(cidade_empresa)
    uf_norm = _norm(uf_empresa)

    if cidade_norm in _CIDADES_PREMIUM:
        score += 8
        sinais.append(f"Cidade estratégica ({cidade_norm})")
    elif ufs_filtro and uf_norm in {_norm(u) for u in ufs_filtro}:
        score += 5
        sinais.append(f"UF alvo ({uf_norm})")
    if cidades_filtro and cidade_norm in {_norm(c) for c in cidades_filtro}:
        score += 3

    # ── 8. CNAE (0–5 pts) — propensão a adotar tecnologia ────────────────
    cnae4 = str(cnae_principal or "")[:4]
    if cnae4 in _CNAES_TECH_FRIENDLY:
        score += 5
        sinais.append("Setor favorável à tecnologia")

    # ── 9. ESTRUTURA DE SÓCIOS (0–2 pts) ─────────────────────────────────
    if 2 <= n_socios <= 5:
        score += 2
        sinais.append("Decisão ágil (2-5 sócios)")

    # ── 10. SOFT NEGATIVES (-10 a -20 pts) [MAI-14] ──────────────────────
    # Penalizadores que reduzem pontuação sem zerar (vs disqualifiers hard).
    # Sinaliza lead frágil mas ainda potencialmente trabalhável.

    # 10a. Lead morto: nenhum canal de contato encontrado
    if not (tem_email or tem_whatsapp or tem_email_socio):
        score -= 15
        penalidades.append("Nenhum canal de contato encontrado (-15)")

    # 10b. Empresa unipessoal de pequeno porte (decisão lenta, baixo budget)
    if n_socios == 1 and ("MICRO" in porte_upper or "PEQUENO" in porte_upper):
        score -= 10
        penalidades.append("Unipessoal micro/pequeno porte (-10)")

    # 10c. Empresa sem nenhum sinal digital (site, instagram, linkedin)
    if not (tem_site or tem_instagram or tem_linkedin_socio or n_socios_linkedin):
        score -= 10
        penalidades.append("Sem pegada digital (sem site/redes) (-10)")

    # 10d. Empresa muito antiga (>30 anos) sem renovação digital
    if data_abertura and not (tem_site or tem_instagram):
        try:
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y%m%d"):
                try:
                    dt_old = datetime.strptime(str(data_abertura)[:10], fmt)
                    anos_old = (datetime.now() - dt_old).days / 365
                    if anos_old > 30:
                        score -= 10
                        penalidades.append(f"Empresa antiga ({anos_old:.0f} anos) sem pegada digital (-10)")
                    break
                except ValueError:
                    continue
        except Exception:
            pass

    # ── 11. SAÚDE FISCAL [MAI-08] ────────────────────────────────────────
    # Dívida PGFN não zera (empresa pode estar negociando), mas é sinal forte.
    if tem_divida_pgfn:
        # Penalidade escala com valor da dívida quando conhecido
        if valor_divida_pgfn is not None:
            if valor_divida_pgfn >= 1_000_000:
                score -= 25
                penalidades.append(f"Dívida PGFN alta (R$ {valor_divida_pgfn:,.0f}) (-25)")
            elif valor_divida_pgfn >= 100_000:
                score -= 18
                penalidades.append(f"Dívida PGFN média (R$ {valor_divida_pgfn:,.0f}) (-18)")
            else:
                score -= 10
                penalidades.append(f"Dívida PGFN (R$ {valor_divida_pgfn:,.0f}) (-10)")
        else:
            # Sem valor — assume médio
            score -= 15
            penalidades.append("Inscrita em dívida ativa PGFN (-15)")

    # ── NORMALIZA ────────────────────────────────────────────────────────
    score = round(min(max(score, 0.0), 100.0), 1)

    # ── TIER ─────────────────────────────────────────────────────────────
    if score >= 70:
        tier = "HOT 🔥"
    elif score >= 45:
        tier = "WARM 🌡️"
    elif score >= 20:
        tier = "COLD ❄️"
    else:
        tier = "UNQUALIFIED"

    return {
        "score": score,
        "tier": tier,
        "sinais": sinais,
        "penalidades": penalidades,
        "explicacao": explicar_score(score, tier, sinais, penalidades),
    }


# ─────────────────────────────────────────────────────────────────────────────
# MAI-18 · Explicação em linguagem natural
# Gera narrativa curta em PT-BR pra mostrar ao vendedor no card do lead.
# Template-based (sem LLM call) — zero custo recorrente, latência zero.
# Quando o usuário quiser narrativa mais rica, dá pra envolver com OpenAI/Claude
# por cima desse output base.
# ─────────────────────────────────────────────────────────────────────────────
def explicar_score(
    score: float,
    tier: str,
    sinais: List[str],
    penalidades: List[str],
) -> str:
    """
    Retorna 2-3 frases em PT-BR explicando o score do lead.

    Exemplos:
      tier=UNQUALIFIED + 1 penalidade → "Lead desqualificado: {motivo}."
      tier=HOT + sinais=[...]         → "Lead quente (X pts). Principais sinais: A, B, C. Sem alertas."
      tier=WARM + sinais + penalidades → "Lead morno (X pts). Pontos fortes: A, B. Atenção: P1, P2."
    """
    tier_clean = tier.replace(" 🔥", "").replace(" 🌡️", "").replace(" ❄️", "").strip()

    if tier_clean == "UNQUALIFIED":
        motivo = penalidades[0] if penalidades else "fora dos critérios atuais"
        return f"Lead desqualificado ({score:.0f} pts): {motivo}."

    label = {"HOT": "quente", "WARM": "morno", "COLD": "frio"}.get(tier_clean, tier_clean.lower())

    partes: List[str] = [f"Lead {label} ({score:.0f} pts)."]

    if sinais:
        # Mostra até 3 sinais mais relevantes (já vêm em ordem de cálculo)
        topo = sinais[:3]
        verb = "Principais sinais" if len(sinais) > 1 else "Sinal"
        partes.append(f"{verb}: {', '.join(topo)}.")

    if penalidades:
        topo_p = penalidades[:2]
        verb_p = "Atenção" if len(penalidades) > 1 else "Alerta"
        partes.append(f"{verb_p}: {'; '.join(topo_p)}.")
    elif tier_clean == "HOT":
        partes.append("Sem alertas.")

    return " ".join(partes)
