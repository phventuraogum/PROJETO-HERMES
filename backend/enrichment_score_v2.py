"""
Score ICP v2 — Pontuação Inteligente de Leads
Substitui o score binário anterior por um sistema de 0-100 baseado
em múltiplos sinais: capital, contatos disponíveis, sócios no LinkedIn,
tempo de abertura, porte, localização estratégica e dados de enriquecimento.
"""
from datetime import datetime
from typing import Dict, List, Optional


# Cidades com maior densidade de tomadores de decisão B2B
_CIDADES_PREMIUM = {
    "SAO PAULO", "CAMPINAS", "GUARULHOS", "OSASCO", "SANTO ANDRE",
    "CURITIBA", "LONDRINA", "MARINGÁ", "JOINVILLE", "BLUMENAU",
    "PORTO ALEGRE", "CAXIAS DO SUL", "NOVO HAMBURGO",
    "BELO HORIZONTE", "UBERLÂNDIA", "CONTAGEM",
    "FLORIANOPOLIS", "BLUMENAU", "ITAJAI",
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

    # ── 1. SITUAÇÃO CADASTRAL (eliminatório) ─────────────────────────────
    if not situacao_ativa:
        return {
            "score": 0.0,
            "tier": "UNQUALIFIED",
            "sinais": [],
            "penalidades": ["Empresa inativa/baixada"],
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
    cidade_norm = (cidade_empresa or "").strip().upper()
    uf_norm = (uf_empresa or "").strip().upper()

    if cidade_norm in _CIDADES_PREMIUM:
        score += 8
        sinais.append(f"Cidade estratégica ({cidade_norm})")
    elif ufs_filtro and uf_norm in [u.upper() for u in ufs_filtro]:
        score += 5
        sinais.append(f"UF alvo ({uf_norm})")
    if cidades_filtro and cidade_norm in [c.upper() for c in cidades_filtro]:
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
    }
