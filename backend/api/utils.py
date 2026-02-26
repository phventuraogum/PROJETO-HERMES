"""
Utilitários para o sistema Hermes
Funções auxiliares para normalização e formatação
"""
import re
from typing import Optional, Any
import logging

logger = logging.getLogger(__name__)


def normalize_capital_social(capital_str: Optional[str]) -> Optional[float]:
    """
    Normaliza capital social de string para float.
    
    Trata vários formatos:
    - "1.234.567,89" (padrão BR)
    - "1234567.89" (padrão US)
    - "1.234.567,89" com espaços
    - Valores inválidos retornam None
    
    Args:
        capital_str: String com capital social
    
    Returns:
        Float com valor normalizado ou None se inválido
    
    Examples:
        >>> normalize_capital_social("1.234.567,89")
        1234567.89
        >>> normalize_capital_social("50000")
        50000.0
        >>> normalize_capital_social("inválido")
        None
    """
    if not capital_str:
        return None
    
    # Converte para string e remove espaços
    capital_str = str(capital_str).strip()
    
    if not capital_str or capital_str.lower() in ['null', 'none', 'nan', '']:
        return None
    
    try:
        # Remove caracteres não numéricos exceto ponto e vírgula
        # Primeiro, tenta identificar o formato
        
        # Se tem vírgula, assume formato BR: "1.234.567,89"
        if ',' in capital_str:
            # Remove pontos (separadores de milhar)
            capital_str = capital_str.replace('.', '')
            # Substitui vírgula por ponto (separador decimal)
            capital_str = capital_str.replace(',', '.')
        # Se só tem pontos, pode ser formato US ou BR sem decimais
        elif '.' in capital_str:
            # Conta quantos pontos tem
            parts = capital_str.split('.')
            # Se tem mais de 2 partes, assume que o último é decimal
            # Caso contrário, assume que são separadores de milhar
            if len(parts) > 2:
                # Formato BR sem vírgula: "1.234.567"
                # Remove todos os pontos
                capital_str = capital_str.replace('.', '')
            # Se tem 2 partes, assume formato US: "1234567.89"
            # Mantém como está
        
        # Remove qualquer caractere não numérico restante (exceto ponto e sinal negativo)
        capital_str = re.sub(r'[^\d.\-]', '', capital_str)
        
        # Tenta converter para float
        try:
            value = float(capital_str)
            # Valida se é um valor razoável (não negativo, não muito grande)
            if value < 0:
                logger.warning(f"Capital social negativo: {capital_str} -> {value}")
                return None
            if value > 1e15:  # Valores muito grandes provavelmente são erros
                logger.warning(f"Capital social muito grande: {capital_str} -> {value}")
                return None
            return value
        except ValueError:
            logger.warning(f"Não foi possível converter capital social: {capital_str}")
            return None
            
    except Exception as e:
        logger.error(f"Erro ao normalizar capital social '{capital_str}': {e}")
        return None


def format_capital_social(value: Optional[float]) -> str:
    """
    Formata capital social para exibição.
    
    Args:
        value: Valor numérico do capital
    
    Returns:
        String formatada (ex: "R$ 1.234.567,89")
    """
    if value is None:
        return "N/A"
    
    try:
        # Formata com 2 casas decimais
        formatted = f"{value:,.2f}"
        # Substitui vírgula por ponto e ponto por vírgula (formato BR)
        formatted = formatted.replace(',', 'X').replace('.', ',').replace('X', '.')
        return f"R$ {formatted}"
    except Exception:
        return "N/A"


def safe_float(value: Optional[Any]) -> Optional[float]:
    """
    Converte valor para float de forma segura.
    
    Args:
        value: Valor a ser convertido
    
    Returns:
        Float ou None se não puder converter
    """
    if value is None:
        return None
    
    try:
        if isinstance(value, float):
            if value != value:  # NaN check
                return None
            return value
        
        if isinstance(value, int):
            return float(value)
        
        if isinstance(value, str):
            # Tenta converter string
            cleaned = value.strip().replace(',', '.')
            return float(cleaned)
        
        return None
    except (ValueError, TypeError, AttributeError):
        return None

def digits(s: Optional[Any]) -> Optional[str]:
    """Normaliza qualquer valor para apenas dígitos."""
    if s is None:
        return None
    import math
    try:
        if isinstance(s, float) and math.isnan(s):
            return None
    except Exception:
        pass
    txt = str(s)
    if not txt.strip():
        return None
    return re.sub(r"\D", "", txt) or None


def formatar_telefone(ddd: Optional[str], numero: Optional[str]) -> Optional[str]:
    """Formata telefone no padrão +55 (DD) 99999-9999"""
    ddd_d = digits(ddd)
    num_d = digits(numero)
    if not num_d:
        return None
    if len(num_d) == 8:
        base = f"{num_d[:4]}-{num_d[4:]}"
    elif len(num_d) == 9:
        base = f"{num_d[:5]}-{num_d[5:]}"
    else:
        base = num_d
    if ddd_d:
        return f"+55 ({ddd_d}) {base}"
    return f"+55 {base}"


def as_opt_str(value: Any) -> Optional[str]:
    """Converte valores para Optional[str] tratando NaN."""
    if value is None:
        return None
    import math
    try:
        if isinstance(value, float) and math.isnan(value):
            return None
    except Exception:
        pass
    if isinstance(value, str):
        s = value.strip()
        return s or None
    s = str(value).strip()
    return s or None


def montar_contexto_sidra(
    pib_corrente: Optional[float],
    pop_residente: Optional[float],
    pib_per_capita: Optional[float],
) -> Optional[str]:
    """Monta string de contexto econômico SIDRA."""
    import math
    if pib_corrente is None and pop_residente is None and pib_per_capita is None:
        return None
    partes = []
    if pib_corrente is not None and not math.isnan(float(pib_corrente)):
        partes.append(f"PIB corrente R$ {pib_corrente:,.0f} mil".replace(",", "."))
    if pib_per_capita is not None and not math.isnan(float(pib_per_capita)):
        partes.append(f"PIB per capita R$ {pib_per_capita:,.0f}".replace(",", "."))
    pop_int = None
    if pop_residente is not None:
        try:
            f = float(pop_residente)
            if not math.isnan(f):
                pop_int = int(f)
        except: pass
    if pop_int is not None:
        partes.append(f"população residente {pop_int:,} hab.".replace(",", "."))
    return " • ".join(partes) if partes else None


# Mapping labels for PORTE_EMPRESA
PORTE_LABEL_BY_CODE = {
    "01": "ME",
    "03": "EPP",
    "05": "Médio/Grande",
    "00": "Não informado",
    "": "Não informado",
}

# Segmentos macro (usados pra filtro / tag "grande")
SEGMENTO_CNAE_PREFIX = {
    "Hospitais": ["8610"],
    "Clínicas": ["8640"],
    "Laboratórios": ["8640"],
    "Farmácias": ["4771"],
    "Supermercados": ["4711", "4712"],
    "Logística": ["4930", "49"],
    "Indústria": ["10", "11", "12", "20", "21", "22", "23"],
    "Serviços": ["96"],
}

def mapear_porte(codigo: Optional[str]) -> Optional[str]:
    """Mapeia código de porte para rótulo legível."""
    if not codigo:
        return None
    codigo_str = str(codigo).strip()
    return PORTE_LABEL_BY_CODE.get(codigo_str, codigo_str)


def classificar_segmento_por_cnae(cnae: Optional[str]) -> Optional[str]:
    """Classifica segmento macro pelo prefixo do CNAE."""
    if not cnae:
        return None
    cnae_str = re.sub(r"\D", "", str(cnae))
    if not cnae_str:
        return None
    for segmento, prefixos in SEGMENTO_CNAE_PREFIX.items():
        for prefixo in prefixos:
            if cnae_str.startswith(prefixo):
                return segmento
    return None


def classificar_subsegmento_por_cnae_e_nome(
    cnae: Optional[str],
    razao_social: Optional[str],
    nome_fantasia: Optional[str],
) -> Optional[str]:
    """Classifica subsegmento fino."""
    if not cnae:
        return None
    cnae_str = re.sub(r"\D", "", str(cnae))
    if not cnae_str:
        return None
    nome_base = f"{razao_social or ''} {nome_fantasia or ''}".upper()
    if cnae_str.startswith("8640"):
        if "PODOLOG" in nome_base: return "Clínica de podologia"
        if "ODONTO" in nome_base or "DENTAL" in nome_base: return "Clínica odontológica"
        if "LABORAT" in nome_base: return "Laboratório de análises clínicas"
        if "FISIOTERAP" in nome_base: return "Clínica de fisioterapia"
        if "IMAGEM" in nome_base or "DIAGNÓSTICO" in nome_base or "DIAGNOSTICO" in nome_base:
            return "Clínica de diagnóstico por imagem"
        if "ONCO" in nome_base: return "Oncologia"
        if "CARDIO" in nome_base: return "Cardiologia"
        return "Clínica / serviço de saúde"
    if cnae_str.startswith("8610"): return "Hospital / pronto atendimento"
    if cnae_str.startswith("4711") or cnae_str.startswith("4712"):
        if "ATACAREJO" in nome_base or "ATACADO" in nome_base: return "Atacarejo / cash & carry"
        return "Supermercado / varejo alimentar"
    if cnae_str.startswith("4771"): return "Farmácia / drogaria"
    return None


def calcular_score_icp_legado(
    capital_social: Optional[float],
    capital_minima: Optional[int],
    uf_empresa: Optional[str],
    uf_filtro: Optional[str],
    cidade_empresa: Optional[str],
    cidade_filtro: Optional[str],
) -> float:
    """Calcula score ICP (versão original de main.py)."""
    score = 0.0
    if capital_social is not None and capital_minima:
        if capital_social >= capital_minima: score += 50.0
        elif capital_social >= capital_minima * 0.5: score += 30.0
        else: score += 10.0
    if uf_empresa and uf_filtro and uf_empresa.upper() == uf_filtro.upper():
        score += 20.0
    if cidade_empresa and cidade_filtro and cidade_empresa.upper() == cidade_filtro.upper():
        score += 20.0
    score += 10.0
    return max(0.0, min(score, 100.0))
