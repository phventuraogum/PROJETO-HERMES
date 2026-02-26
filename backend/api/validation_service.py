"""
Serviço de Validação Robusta de Dados
Valida CNPJ, emails, telefones e outros dados para garantir qualidade
"""
import re
import logging
from typing import Optional, Dict, Any, Tuple
import httpx
from datetime import datetime

from config import settings

logger = logging.getLogger(__name__)


# DDDs válidos no Brasil
VALID_DDDS = {
    "11", "12", "13", "14", "15", "16", "17", "18", "19",  # SP
    "21", "22", "24",  # RJ/ES
    "27", "28",  # ES
    "31", "32", "33", "34", "35", "37", "38",  # MG
    "41", "42", "43", "44", "45", "46",  # PR
    "47", "48", "49",  # SC
    "51", "53", "54", "55",  # RS
    "61",  # DF
    "62", "64",  # GO
    "63",  # TO
    "65", "66",  # MT
    "67",  # MS
    "68",  # AC
    "69",  # RO
    "71", "73", "74", "75", "77",  # BA
    "79",  # SE
    "81", "87",  # PE
    "82",  # AL
    "83",  # PB
    "84",  # RN
    "85", "88",  # CE
    "86", "89",  # PI
    "91", "93", "94",  # PA
    "92", "97",  # AM
    "95",  # RR
    "96",  # AP
    "98", "99",  # MA
}

def is_ddd_valido(ddd: str) -> bool:
    """Verifica se um DDD é válido no Brasil."""
    return str(ddd).zfill(2) in VALID_DDDS


def validar_cnpj(cnpj: str) -> Tuple[bool, Optional[str]]:
    """
    Valida CNPJ verificando dígitos verificadores.
    
    Args:
        cnpj: CNPJ com ou sem formatação
    
    Returns:
        (é_válido, cnpj_limpo)
    """
    if not cnpj:
        return False, None
    
    # Remove formatação
    cnpj_limpo = re.sub(r'\D', '', str(cnpj))
    
    # Verifica comprimento
    if len(cnpj_limpo) != 14:
        return False, None
    
    # Verifica se todos os dígitos são iguais (CNPJ inválido)
    if len(set(cnpj_limpo)) == 1:
        return False, None
    
    # Valida dígitos verificadores
    def calcular_digito(cnpj: str, posicoes: list) -> int:
        soma = 0
        for i, pos in enumerate(posicoes):
            soma += int(cnpj[i]) * pos
        resto = soma % 11
        return 0 if resto < 2 else 11 - resto
    
    # Primeiro dígito verificador
    posicoes1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    digito1 = calcular_digito(cnpj_limpo[:12], posicoes1)
    
    if int(cnpj_limpo[12]) != digito1:
        return False, None
    
    # Segundo dígito verificador
    posicoes2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    digito2 = calcular_digito(cnpj_limpo[:13], posicoes2)
    
    if int(cnpj_limpo[13]) != digito2:
        return False, None
    
    return True, cnpj_limpo


def validar_email(email: str) -> Dict[str, Any]:
    """
    Valida email de forma robusta.
    
    Returns:
        {
            "valido": bool,
            "formato_valido": bool,
            "dominio_valido": bool,
            "dominio_descartavel": bool,
            "score": float (0-1)
        }
    """
    if not email or not isinstance(email, str):
        return {
            "valido": False,
            "formato_valido": False,
            "dominio_valido": False,
            "dominio_descartavel": False,
            "score": 0.0
        }
    
    email = email.strip().lower()
    
    # Regex melhorado (RFC 5322 simplificado)
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    formato_valido = bool(re.match(email_regex, email))
    
    if not formato_valido:
        return {
            "valido": False,
            "formato_valido": False,
            "dominio_valido": False,
            "dominio_descartavel": False,
            "score": 0.0
        }
    
    # Extrai domínio
    try:
        dominio = email.split('@')[1]
    except:
        return {
            "valido": False,
            "formato_valido": True,
            "dominio_valido": False,
            "dominio_descartavel": False,
            "score": 0.3
        }
    
    # Lista de domínios descartáveis (exemplos)
    DOMINIOS_DESCARTAVEIS = {
        "10minutemail.com", "tempmail.com", "guerrillamail.com",
        "mailinator.com", "throwaway.email", "trashmail.com"
    }
    
    dominio_descartavel = dominio in DOMINIOS_DESCARTAVEIS
    
    # Validação básica de domínio
    dominio_valido = (
        '.' in dominio and
        len(dominio.split('.')[-1]) >= 2 and
        not dominio.startswith('.') and
        not dominio.endswith('.')
    )
    
    # Score de confiabilidade
    score = 0.0
    if formato_valido:
        score += 0.3
    if dominio_valido:
        score += 0.3
    if not dominio_descartavel:
        score += 0.4
    
    valido = formato_valido and dominio_valido and not dominio_descartavel
    
    return {
        "valido": valido,
        "formato_valido": formato_valido,
        "dominio_valido": dominio_valido,
        "dominio_descartavel": dominio_descartavel,
        "score": score
    }


def validar_telefone(telefone: str) -> Dict[str, Any]:
    """
    Valida telefone brasileiro.
    
    Returns:
        {
            "valido": bool,
            "formato_valido": bool,
            "ddd_valido": bool,
            "numero_valido": bool,
            "ddd": Optional[str],
            "numero": Optional[str],
            "score": float (0-1)
        }
    """
    if not telefone:
        return {
            "valido": False,
            "formato_valido": False,
            "ddd_valido": False,
            "numero_valido": False,
            "ddd": None,
            "numero": None,
            "score": 0.0
        }
    
    # Remove formatação
    telefone_limpo = re.sub(r'\D', '', str(telefone))
    
    # Extrai DDD e número
    ddd = None
    numero = None
    
    # Formato: DDD + número (10 ou 11 dígitos)
    if len(telefone_limpo) == 10:
        # Telefone fixo: DDD (2) + número (8)
        ddd = telefone_limpo[:2]
        numero = telefone_limpo[2:]
    elif len(telefone_limpo) == 11:
        # Celular: DDD (2) + 9 + número (8)
        ddd = telefone_limpo[:2]
        numero = telefone_limpo[2:]
    elif len(telefone_limpo) == 13 and telefone_limpo.startswith('55'):
        # Com código do país: 55 + DDD + número
        ddd = telefone_limpo[2:4]
        numero = telefone_limpo[4:]
    else:
        return {
            "valido": False,
            "formato_valido": False,
            "ddd_valido": False,
            "numero_valido": False,
            "ddd": None,
            "numero": None,
            "score": 0.0
        }
    
    # Valida DDD
    ddd_valido = ddd in VALID_DDDS
    
    # Valida número (não pode ser tudo zero ou padrão inválido)
    numero_valido = (
        numero and
        numero != '00000000' and
        numero != '11111111' and
        numero != '99999999' and
        len(numero) in [8, 9]
    )
    
    # Score
    score = 0.0
    if ddd_valido:
        score += 0.5
    if numero_valido:
        score += 0.5
    
    valido = ddd_valido and numero_valido
    
    return {
        "valido": valido,
        "formato_valido": True,
        "ddd_valido": ddd_valido,
        "numero_valido": numero_valido,
        "ddd": ddd,
        "numero": numero,
        "score": score
    }


def validar_whatsapp(whatsapp: str) -> Dict[str, Any]:
    """
    Valida número de WhatsApp com heurística robusta.
    """
    if not whatsapp:
        return {
            "valido": False,
            "formato_valido": False,
            "numero_limpo": None,
            "score": 0.0,
            "metodo": "heuristica"
        }
    
    # Identifica se é uma URL wa.me
    is_wa_me = "wa.me" in str(whatsapp) or "api.whatsapp.com" in str(whatsapp)
    
    # Remove formatação e URLs
    whatsapp_limpo = re.sub(r'[^\d]', '', str(whatsapp))
    
    # Remove código do país se presente (Brasil = 55)
    if whatsapp_limpo.startswith('55'):
        # Se tem 13 dígitos e começa com 55, é um número completo (+55 DD 9XXXX-XXXX)
        if len(whatsapp_limpo) >= 12:
            whatsapp_limpo = whatsapp_limpo[2:]
    
    # Valida formato (DDD + 9 ou 8 dígitos)
    # Celular no Brasil deve ter 11 dígitos (incluindo o 9 inicial)
    # Mas alguns sistemas legados ou bots podem ter 10
    has_correct_length = len(whatsapp_limpo) in [10, 11]
    
    score = 0.0
    valido = False
    
    if has_correct_length:
        ddd = whatsapp_limpo[:2]
        ddd_valido = ddd in VALID_DDDS
        
        # Verifica se o número parece ser móvel (começa com 9 ou 8/7 dependendo da região)
        # No Brasil, todos os celulares agora têm o 9 na frente.
        numero = whatsapp_limpo[2:]
        is_mobile_pattern = numero.startswith('9') or (len(numero) == 8 and numero[0] in '789')
        
        if ddd_valido and is_mobile_pattern:
            valido = True
            score = 0.8
            if is_wa_me:
                score = 0.95  # Links diretos têm altíssima confiabilidade
        elif ddd_valido:
            # É um número válido mas não segue padrão móvel clássico
            valido = True
            score = 0.6
    
    return {
        "valido": valido,
        "formato_valido": has_correct_length,
        "numero_limpo": whatsapp_limpo if valido else None,
        "score": score,
        "is_wa_me": is_wa_me,
        "metodo": "heuristica"
    }


async def verificar_whatsapp_realtime(numero: str) -> Dict[str, Any]:
    """
    Verifica se o número existe no WhatsApp em tempo real.
    Placeholder para integração com Evolution API ou similar.
    """
    # Para o futuro: integrar aqui a chamada para a Evolution API
    # Por enquanto, retorna a validação por heurística
    return validar_whatsapp(numero)


def calcular_score_confiabilidade(
    email: Optional[str] = None,
    telefone: Optional[str] = None,
    whatsapp: Optional[str] = None,
    cnpj: Optional[str] = None,
    fonte_dados: str = "receita"  # receita, enriquecido, scraper
) -> Dict[str, Any]:
    """
    Calcula score de confiabilidade geral dos dados de uma empresa.
    
    Returns:
        {
            "score_total": float (0-1),
            "score_contatos": float (0-1),
            "score_cnpj": float (0-1),
            "detalhes": dict
        }
    """
    scores = {
        "email": 0.0,
        "telefone": 0.0,
        "whatsapp": 0.0,
        "cnpj": 0.0
    }
    
    detalhes = {}
    
    # Valida CNPJ
    if cnpj:
        cnpj_valido, _ = validar_cnpj(cnpj)
        scores["cnpj"] = 1.0 if cnpj_valido else 0.0
        detalhes["cnpj"] = {"valido": cnpj_valido}
    
    # Valida Email
    if email:
        email_result = validar_email(email)
        scores["email"] = email_result["score"]
        detalhes["email"] = email_result
    
    # Valida Telefone
    if telefone:
        tel_result = validar_telefone(telefone)
        scores["telefone"] = tel_result["score"]
        detalhes["telefone"] = tel_result
    
    # Valida WhatsApp
    if whatsapp:
        wpp_result = validar_whatsapp(whatsapp)
        scores["whatsapp"] = wpp_result["score"]
        detalhes["whatsapp"] = wpp_result
    
    # Score de contatos (média ponderada)
    contatos = []
    if email:
        contatos.append(scores["email"])
    if telefone:
        contatos.append(scores["telefone"])
    if whatsapp:
        contatos.append(scores["whatsapp"] * 1.2)  # WhatsApp tem peso maior
    
    score_contatos = sum(contatos) / len(contatos) if contatos else 0.0
    
    # Score total (ponderado)
    peso_cnpj = 0.3
    peso_contatos = 0.7
    
    score_total = (
        scores["cnpj"] * peso_cnpj +
        score_contatos * peso_contatos
    )
    
    # Ajusta por fonte
    fonte_multiplier = {
        "receita": 1.0,
        "enriquecido": 0.8,
        "scraper": 0.6
    }.get(fonte_dados, 0.5)
    
    score_total *= fonte_multiplier
    
    return {
        "score_total": min(1.0, score_total),
        "score_contatos": score_contatos,
        "score_cnpj": scores["cnpj"],
        "detalhes": detalhes,
        "fonte": fonte_dados
    }


def verificar_cnpj_receita(cnpj: str) -> Dict[str, Any]:
    """
    Verifica CNPJ na Receita Federal (via BrasilAPI v2) para obter dados em tempo real.
    
    A versão v2 retorna CNAEs secundários e dados mais completos.
    """
    cnpj_valido, cnpj_limpo = validar_cnpj(cnpj)
    
    if not cnpj_valido:
        return {
            "ativo": False,
            "situacao": "INVÁLIDO",
            "valido": False
        }
    
    try:
        # Usa BrasilAPI v2 (mais completa)
        response = httpx.get(
            f"https://brasilapi.com.br/api/cnpj/v2/{cnpj_limpo}",
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Mapeia contatos da Receita
            contatos = []
            if data.get("ddd_telefone_1"):
                contatos.append(data["ddd_telefone_1"])
            if data.get("ddd_telefone_2"):
                contatos.append(data["ddd_telefone_2"])
            
            return {
                "ativo": data.get("situacao_cadastral") == "ATIVA",
                "situacao": data.get("situacao_cadastral", "DESCONHECIDA"),
                "razao_social": data.get("razao_social"),
                "nome_fantasia": data.get("nome_fantasia"),
                "data_abertura": data.get("data_inicio_atividade"),
                "socios": data.get("qsa", []),
                "email": data.get("email"),
                "telefones": contatos,
                "cnaes_secundarios": data.get("cnaes_secundarios", []),
                "cep": data.get("cep"),
                "logradouro": data.get("logradouro"),
                "numero": data.get("numero"),
                "bairro": data.get("bairro"),
                "municipio": data.get("municipio"),
                "uf": data.get("uf"),
                "valido": True,
                "fonte": "BrasilAPI_v2"
            }
        else:
            logger.warning(f"Erro ao consultar CNPJ {cnpj_limpo} na BrasilAPI v2: {response.status_code}")
            # Fallback para v1 se v2 falhar (opcional)
            return {
                "valido": True,
                "situacao": "ERRO_API_V2",
                "fonte": "local"
            }
    except Exception as e:
        logger.error(f"Erro ao verificar CNPJ na BrasilAPI v2: {e}")
        return {
            "valido": True,
            "situacao": "ERRO_CONEXAO",
            "fonte": "local"
        }


def verificar_dominio_registrobr(dominio: str) -> Dict[str, Any]:
    """
    Consulta informações de registro de um domínio .br via BrasilAPI.
    
    Isso permite encontrar o nome e e-mail de quem registrou o site,
    o que é um lead extremamente assertivo.
    """
    if not dominio:
        return {"valido": False}
    
    # Limpa domínio (remove http/https e paths)
    dominio_limpo = re.sub(r'^https?://', '', str(dominio))
    dominio_limpo = dominio_limpo.split('/')[0]
    
    if not dominio_limpo.endswith('.br'):
        return {"valido": False, "msg": "Apenas domínios .br são suportados pela BrasilAPI"}
    
    try:
        response = httpx.get(
            f"https://brasilapi.com.br/api/registrobr/v1/{dominio_limpo}",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            return {
                "valido": True,
                "dominio": data.get("domain"),
                "status": data.get("status"),
                "owner": data.get("owner"),
                "owner_email": data.get("owner_email"),  # OURO!
                "responsavel": data.get("responsible"),
                "created": data.get("created"),
                "expires": data.get("expires"),
                "fonte": "Registro.br (BrasilAPI)"
            }
        return {"valido": False, "status_code": response.status_code}
    except Exception as e:
        logger.error(f"Erro ao consultar domínio no Registro.br: {e}")
        return {"valido": False, "erro": str(e)}
