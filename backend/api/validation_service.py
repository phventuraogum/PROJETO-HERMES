"""
Serviço de Validação Robusta de Dados
Valida CNPJ, emails, telefones e outros dados para garantir qualidade
"""
import os
import re
import logging
import asyncio
import smtplib
import socket
from typing import Optional, Dict, Any, Tuple, List
import httpx
from datetime import datetime
from functools import lru_cache

import dns.exception
import dns.resolver

from config import settings

logger = logging.getLogger(__name__)

EMAIL_DOMINIOS_DESCARTAVEIS = {
    "10minutemail.com",
    "mailinator.com",
    "tempmail.com",
    "guerrillamail.com",
    "trashmail.com",
    "throwaway.email",
    "sharklasers.com",
    "dispostable.com",
    "yopmail.com",
}

EMAIL_DOMINIOS_GRATUITOS = {
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "yahoo.com",
    "icloud.com",
    "live.com",
    "proton.me",
    "protonmail.com",
    "uol.com.br",
    "terra.com.br",
    "bol.com.br",
    "ig.com.br",
}

EMAIL_LOCAL_SUSPEITO = {
    "example",
    "exemplo",
    "fake",
    "falso",
    "invalido",
    "invalid",
    "naoresponder",
    "noreply",
    "no-reply",
    "teste",
    "test",
}

SMTP_ACCEPT_CODES = {250, 251, 252}
SMTP_REJECT_CODES = {550, 551, 552, 553, 554}
SMTP_TEMPFAIL_CODES = {421, 450, 451, 452}

EMAIL_SMTP_TIMEOUT = float(os.getenv("HERMES_EMAIL_SMTP_TIMEOUT", "8"))
EMAIL_SMTP_HELO_DOMAIN = os.getenv("HERMES_EMAIL_SMTP_HELO_DOMAIN", "hermescraper.com")
EMAIL_SMTP_FROM = os.getenv("HERMES_EMAIL_SMTP_FROM", "")


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


def _normalizar_email(email: str) -> str:
    return str(email or "").strip().lower()


@lru_cache(maxsize=512)
def _consultar_mx_email(dominio: str) -> Dict[str, Any]:
    resultado = {
        "mx_valido": False,
        "mx_hosts": [],
        "dns_status": "nao_consultado",
    }
    dominio = str(dominio or "").strip().lower()
    if not dominio:
        return resultado

    resolver = dns.resolver.Resolver()
    resolver.timeout = 4.0
    resolver.lifetime = 4.0

    try:
        respostas = resolver.resolve(dominio, "MX")
        hosts = sorted(
            (
                (int(getattr(item, "preference", 0) or 0), str(item.exchange).rstrip(".").lower())
                for item in respostas
            ),
            key=lambda item: item[0],
        )
        resultado["mx_hosts"] = [host for _, host in hosts if host]
        resultado["mx_valido"] = bool(resultado["mx_hosts"])
        resultado["dns_status"] = "mx"
        return resultado
    except dns.resolver.NoAnswer:
        pass
    except dns.resolver.NXDOMAIN:
        resultado["dns_status"] = "nxdomain"
        return resultado
    except dns.resolver.NoNameservers:
        resultado["dns_status"] = "no_nameservers"
        return resultado
    except dns.exception.Timeout:
        resultado["dns_status"] = "timeout"
        return resultado
    except Exception as exc:
        logger.warning("Erro ao consultar MX de %s: %s", dominio, exc)
        resultado["dns_status"] = "erro"
        return resultado

    for record_type in ("A", "AAAA"):
        try:
            respostas = resolver.resolve(dominio, record_type)
            hosts = [dominio for _ in respostas]
            if hosts:
                resultado["mx_hosts"] = hosts
                resultado["mx_valido"] = True
                resultado["dns_status"] = f"fallback_{record_type.lower()}"
                return resultado
        except Exception:
            continue

    resultado["dns_status"] = "sem_mx"
    return resultado


def _smtp_probe_recipient(email: str, mx_hosts: List[str]) -> Dict[str, Any]:
    probe_from = EMAIL_SMTP_FROM
    for host in mx_hosts[:3]:
        try:
            with smtplib.SMTP(host=host, port=25, timeout=EMAIL_SMTP_TIMEOUT) as smtp:
                smtp.ehlo_or_helo_if_needed()
                if smtp.has_extn("starttls"):
                    try:
                        smtp.starttls()
                        smtp.ehlo()
                    except smtplib.SMTPException:
                        pass

                mail_code, mail_msg = smtp.mail(probe_from)
                if mail_code >= 500:
                    return {
                        "smtp_status": "sender_rejected",
                        "smtp_codigo": mail_code,
                        "smtp_detalhe": mail_msg.decode(errors="ignore") if isinstance(mail_msg, bytes) else str(mail_msg),
                        "smtp_host": host,
                    }

                rcpt_code, rcpt_msg = smtp.rcpt(email)
                detalhe = rcpt_msg.decode(errors="ignore") if isinstance(rcpt_msg, bytes) else str(rcpt_msg)
                if rcpt_code in SMTP_ACCEPT_CODES:
                    return {
                        "smtp_status": "accepted",
                        "smtp_codigo": rcpt_code,
                        "smtp_detalhe": detalhe,
                        "smtp_host": host,
                    }
                if rcpt_code in SMTP_REJECT_CODES:
                    return {
                        "smtp_status": "rejected",
                        "smtp_codigo": rcpt_code,
                        "smtp_detalhe": detalhe,
                        "smtp_host": host,
                    }
                if rcpt_code in SMTP_TEMPFAIL_CODES:
                    return {
                        "smtp_status": "tempfail",
                        "smtp_codigo": rcpt_code,
                        "smtp_detalhe": detalhe,
                        "smtp_host": host,
                    }
                return {
                    "smtp_status": "unknown",
                    "smtp_codigo": rcpt_code,
                    "smtp_detalhe": detalhe,
                    "smtp_host": host,
                }
        except (socket.timeout, TimeoutError):
            continue
        except smtplib.SMTPConnectError:
            continue
        except smtplib.SMTPServerDisconnected:
            continue
        except OSError:
            continue
        except Exception as exc:
            logger.debug("SMTP probe falhou para %s em %s: %s", email, host, exc)
            continue

    return {
        "smtp_status": "unreachable",
        "smtp_codigo": None,
        "smtp_detalhe": "Nenhum MX aceitou conexao SMTP",
        "smtp_host": None,
    }


def _validar_email_legacy(email: str) -> Dict[str, Any]:
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


def validar_email(email: str, probe_smtp: bool = False) -> Dict[str, Any]:
    """
    Valida email em camadas:
    1. formato
    2. domínio
    3. MX/DNS
    4. probe SMTP sem enviar conteúdo (opcional)
    """
    resultado = {
        "valido": False,
        "formato_valido": False,
        "dominio_valido": False,
        "dominio_descartavel": False,
        "dominio_corporativo": False,
        "local_suspeito": False,
        "mx_valido": False,
        "mx_hosts": [],
        "dns_status": "nao_consultado",
        "smtp_status": "not_checked",
        "smtp_codigo": None,
        "smtp_detalhe": None,
        "smtp_host": None,
        "score": 0.0,
        "metodo": "formato",
        "motivo": "Email ausente ou invalido",
    }
    if not email or not isinstance(email, str):
        return resultado

    email = _normalizar_email(email)
    email_regex = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    formato_valido = bool(re.match(email_regex, email))
    if not formato_valido:
        resultado["motivo"] = "Formato de email invalido"
        return resultado

    local, _, dominio = email.partition("@")
    dominio_valido = (
        "." in dominio
        and len(dominio.split(".")[-1]) >= 2
        and not dominio.startswith(".")
        and not dominio.endswith(".")
    )
    if not dominio_valido:
        resultado["formato_valido"] = True
        resultado["motivo"] = "Dominio invalido"
        return resultado

    dominio_descartavel = dominio in EMAIL_DOMINIOS_DESCARTAVEIS
    dominio_corporativo = dominio not in EMAIL_DOMINIOS_GRATUITOS
    local_suspeito = local in EMAIL_LOCAL_SUSPEITO

    mx_info = _consultar_mx_email(dominio)
    resultado.update(
        {
            "formato_valido": True,
            "dominio_valido": True,
            "dominio_descartavel": dominio_descartavel,
            "dominio_corporativo": dominio_corporativo,
            "local_suspeito": local_suspeito,
            "mx_valido": bool(mx_info.get("mx_valido")),
            "mx_hosts": list(mx_info.get("mx_hosts") or []),
            "dns_status": mx_info.get("dns_status") or "nao_consultado",
            "metodo": "mx_lookup",
            "motivo": "MX encontrado" if mx_info.get("mx_valido") else "Dominio sem MX valido",
        }
    )

    score = 0.25
    score += 0.15
    if not dominio_descartavel:
        score += 0.10
    if dominio_corporativo:
        score += 0.05
    if not local_suspeito:
        score += 0.05
    if resultado["mx_valido"]:
        score += 0.25
    elif resultado["dns_status"].startswith("fallback_"):
        score += 0.15

    if probe_smtp and resultado["mx_hosts"] and not dominio_descartavel:
        smtp_info = _smtp_probe_recipient(email, resultado["mx_hosts"])
        resultado.update(smtp_info)
        resultado["metodo"] = "smtp_probe"
        smtp_status = resultado.get("smtp_status")
        if smtp_status == "accepted":
            score += 0.15
            resultado["motivo"] = "Servidor SMTP aceitou o destinatario"
        elif smtp_status in {"tempfail", "unknown"}:
            score += 0.05
            resultado["motivo"] = "Servidor SMTP respondeu sem confirmacao definitiva"
        elif smtp_status == "rejected":
            score = 0.0
            resultado["motivo"] = "Servidor SMTP rejeitou o destinatario"
        elif smtp_status == "sender_rejected":
            resultado["motivo"] = "Servidor SMTP rejeitou o remetente tecnico"
        else:
            resultado["motivo"] = "Nao foi possivel confirmar o destinatario via SMTP"

    score = max(0.0, min(1.0, score))
    smtp_status = resultado.get("smtp_status")
    resultado["score"] = score
    resultado["valido"] = (
        resultado["formato_valido"]
        and resultado["dominio_valido"]
        and not resultado["dominio_descartavel"]
        and resultado["mx_valido"]
        and smtp_status != "rejected"
        and (not resultado["local_suspeito"] or smtp_status == "accepted")
    )
    return resultado


async def verificar_email_realtime(email: str) -> Dict[str, Any]:
    return validar_email(email, probe_smtp=True)


async def verificar_email_lote(
    emails: list[str],
    *,
    probe_smtp: bool = True,
    max_concurrent: int = 4,
) -> Dict[str, Dict[str, Any]]:
    resultados: Dict[str, Dict[str, Any]] = {}
    sem = asyncio.Semaphore(max_concurrent)

    async def _uma(email: str) -> None:
        normalizado = _normalizar_email(email)
        if not normalizado or normalizado in resultados:
            return
        async with sem:
            resultados[normalizado] = await asyncio.to_thread(validar_email, normalizado, probe_smtp)

    await asyncio.gather(*[_uma(email) for email in emails if email])
    return resultados


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


def normalizar_whatsapp_br(numero_raw: str) -> Optional[str]:
    """
    Normaliza qualquer número brasileiro para o formato 55DDXXXXXXXXX (13 dígitos).
    Retorna None se não for um celular brasileiro válido.
    Regra: DDD válido + 9 dígitos começando com 9.
    """
    if not numero_raw:
        return None
    raw = str(numero_raw)
    is_wa_link = "wa.me" in raw or "api.whatsapp.com" in raw or "whatsapp://" in raw
    digits_only = re.sub(r"[^\d]", "", raw)

    if digits_only.startswith("0"):
        digits_only = digits_only[1:]
    if digits_only.startswith("55") and len(digits_only) >= 12:
        digits_only = digits_only[2:]

    if len(digits_only) == 10 and digits_only[2] != "9":
        return None
    if len(digits_only) == 10 and digits_only[2] == "9":
        pass
    elif len(digits_only) == 11 and digits_only[2] == "9":
        pass
    else:
        return None

    ddd = digits_only[:2]
    if ddd not in VALID_DDDS:
        return None

    local = digits_only[2:]
    if len(local) == 8 and local[0] == "9":
        local = "9" + local
        digits_only = ddd + local
    elif len(local) == 9 and local[0] == "9":
        pass
    else:
        return None

    sufixo = local[-8:]
    if len(set(local)) == 1 or sufixo in {
        "00000000", "11111111", "22222222", "33333333", "44444444",
        "55555555", "66666666", "77777777", "88888888", "99999999",
    }:
        return None

    return "55" + digits_only


def validar_whatsapp(whatsapp: str) -> Dict[str, Any]:
    """
    Valida número de WhatsApp com heurística rigorosa.
    Só aceita celulares brasileiros (DDD válido + 9XXXXXXXX).
    """
    if not whatsapp:
        return {
            "valido": False,
            "formato_valido": False,
            "numero_limpo": None,
            "score": 0.0,
            "metodo": "heuristica"
        }

    is_wa_me = "wa.me" in str(whatsapp) or "api.whatsapp.com" in str(whatsapp)
    normalizado = normalizar_whatsapp_br(whatsapp)

    if normalizado:
        score = 0.85 if is_wa_me else 0.7
        return {
            "valido": True,
            "formato_valido": True,
            "numero_limpo": normalizado,
            "score": score,
            "is_wa_me": is_wa_me,
            "metodo": "heuristica"
        }

    return {
        "valido": False,
        "formato_valido": False,
        "numero_limpo": None,
        "score": 0.0,
        "is_wa_me": is_wa_me,
        "metodo": "heuristica"
    }


_EVOLUTION_API_URL = os.environ.get("EVOLUTION_API_URL", "")
_EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY", "")
_EVOLUTION_INSTANCE = os.environ.get("EVOLUTION_INSTANCE", "")


async def verificar_whatsapp_realtime(numero: str) -> Dict[str, Any]:
    """
    Verifica se o número existe no WhatsApp via Evolution API.
    Faz validação de formato primeiro; se passa, consulta a API real.
    Se a Evolution API não estiver configurada, retorna apenas heurística.
    """
    heuristica = validar_whatsapp(numero)
    if not heuristica["valido"]:
        return heuristica

    num_limpo = heuristica["numero_limpo"]

    if not (_EVOLUTION_API_URL and _EVOLUTION_API_KEY and _EVOLUTION_INSTANCE):
        return heuristica

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_EVOLUTION_API_URL.rstrip('/')}/chat/whatsappNumbers/{_EVOLUTION_INSTANCE}",
                headers={"apikey": _EVOLUTION_API_KEY, "Content-Type": "application/json"},
                json={"numbers": [num_limpo]},
            )
        if resp.status_code == 200:
            data = resp.json()
            resultados = data if isinstance(data, list) else data.get("data", data.get("response", []))
            if isinstance(resultados, list) and resultados:
                item = resultados[0]
                existe = item.get("exists", item.get("status") == "true")
                jid = item.get("jid", item.get("number", ""))
                if existe:
                    return {
                        "valido": True,
                        "formato_valido": True,
                        "numero_limpo": num_limpo,
                        "jid": jid,
                        "score": 1.0,
                        "is_wa_me": heuristica.get("is_wa_me", False),
                        "metodo": "evolution_api"
                    }
                else:
                    logger.info(f"Numero {num_limpo} NAO existe no WhatsApp (Evolution API)")
                    return {
                        "valido": False,
                        "formato_valido": True,
                        "numero_limpo": num_limpo,
                        "score": 0.0,
                        "metodo": "evolution_api_rejected"
                    }
        logger.warning(f"Evolution API status {resp.status_code} para {num_limpo}")
    except Exception as e:
        logger.warning(f"Erro ao verificar WhatsApp via Evolution API: {e}")

    return heuristica


async def verificar_whatsapp_lote(numeros: list[str], max_batch: int = 50) -> Dict[str, Dict]:
    """
    Verifica uma lista de números via Evolution API em lote.
    Retorna dict {numero_normalizado: resultado_validacao}.
    """
    resultados: Dict[str, Dict] = {}

    validos = []
    for n in numeros:
        norm = normalizar_whatsapp_br(n)
        if norm:
            validos.append(norm)
            resultados[norm] = validar_whatsapp(n)
        else:
            resultados.setdefault(re.sub(r"[^\d]", "", str(n)), {
                "valido": False, "formato_valido": False,
                "numero_limpo": None, "score": 0.0, "metodo": "formato_invalido"
            })

    if not (_EVOLUTION_API_URL and _EVOLUTION_API_KEY and _EVOLUTION_INSTANCE):
        return resultados

    for i in range(0, len(validos), max_batch):
        batch = validos[i:i + max_batch]
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{_EVOLUTION_API_URL.rstrip('/')}/chat/whatsappNumbers/{_EVOLUTION_INSTANCE}",
                    headers={"apikey": _EVOLUTION_API_KEY, "Content-Type": "application/json"},
                    json={"numbers": batch},
                )
            if resp.status_code == 200:
                data = resp.json()
                lista = data if isinstance(data, list) else data.get("data", data.get("response", []))
                if isinstance(lista, list):
                    for item in lista:
                        num = re.sub(r"[^\d]", "", str(item.get("jid", item.get("number", ""))))
                        if num.startswith("55") and len(num) == 13:
                            existe = item.get("exists", item.get("status") == "true")
                            resultados[num] = {
                                "valido": bool(existe),
                                "formato_valido": True,
                                "numero_limpo": num if existe else None,
                                "jid": item.get("jid", ""),
                                "score": 1.0 if existe else 0.0,
                                "metodo": "evolution_api"
                            }
        except Exception as e:
            logger.warning(f"Erro verificacao lote Evolution API: {e}")

    return resultados


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
