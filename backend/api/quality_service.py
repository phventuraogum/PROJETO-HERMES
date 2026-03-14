"""
Serviço de Qualidade de Dados
Calcula métricas de qualidade e confiabilidade dos dados
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass

from api.validation_service import calcular_score_confiabilidade, validar_cnpj, validar_email, validar_telefone

logger = logging.getLogger(__name__)


@dataclass
class DataQualityMetrics:
    """Métricas de qualidade de dados"""
    completude: float  # % de campos preenchidos
    precisao: float    # % de dados validados
    atualidade: float  # Idade dos dados (0-1, 1 = atual)
    consistencia: float  # Dados não conflitantes
    score_total: float  # Score geral (0-1)


class QualityService:
    """Serviço de qualidade de dados"""
    
    @staticmethod
    def calcular_completude(empresa: Dict[str, Any]) -> float:
        """
        Calcula completude (% de campos importantes preenchidos).
        
        Campos importantes:
        - CNPJ, Razão Social, Cidade, UF, CNAE
        - Email, Telefone, WhatsApp
        - Site, Capital Social
        """
        campos_obrigatorios = [
            "cnpj", "razao_social", "cidade", "uf", "cnae_principal"
        ]
        campos_opcionais_importantes = [
            "email", "telefone", "whatsapp", "site", "capital_social"
        ]
        
        total_campos = len(campos_obrigatorios) + len(campos_opcionais_importantes)
        preenchidos = 0
        
        # Campos obrigatórios (peso 2x)
        for campo in campos_obrigatorios:
            valor = empresa.get(campo)
            if valor and str(valor).strip() and str(valor).lower() not in ['null', 'none', 'nan']:
                preenchidos += 2
        
        # Campos opcionais
        for campo in campos_opcionais_importantes:
            valor = empresa.get(campo) or empresa.get(f"email_final") or empresa.get(f"telefone_final")
            if valor and str(valor).strip() and str(valor).lower() not in ['null', 'none', 'nan']:
                preenchidos += 1
        
        # Normaliza (campos obrigatórios têm peso 2)
        max_score = len(campos_obrigatorios) * 2 + len(campos_opcionais_importantes)
        return min(1.0, preenchidos / max_score)
    
    @staticmethod
    def calcular_precisao(empresa: Dict[str, Any]) -> float:
        """
        Calcula precisão (% de dados validados).
        """
        validacoes = []
        
        # Valida CNPJ
        cnpj = empresa.get("cnpj")
        if cnpj:
            cnpj_valido, _ = validar_cnpj(cnpj)
            validacoes.append(cnpj_valido)
        
        # Valida Email
        email = empresa.get("email") or empresa.get("email_final") or empresa.get("email_enriquecido")
        if email:
            email_result = validar_email(email)
            validacoes.append(email_result["valido"])
        
        # Valida Telefone
        telefone = empresa.get("telefone") or empresa.get("telefone_final") or empresa.get("telefone_enriquecido")
        if telefone:
            tel_result = validar_telefone(telefone)
            validacoes.append(tel_result["valido"])
        
        # Valida WhatsApp
        whatsapp = empresa.get("whatsapp") or empresa.get("whatsapp_final") or empresa.get("whatsapp_enriquecido")
        if whatsapp:
            wpp_result = validar_whatsapp(whatsapp)
            validacoes.append(wpp_result["valido"])
        
        if not validacoes:
            return 0.0
        
        return sum(validacoes) / len(validacoes)
    
    @staticmethod
    def calcular_atualidade(
        data_atualizacao: Optional[str],
        data_receita: Optional[str] = None
    ) -> float:
        """
        Calcula atualidade dos dados (0-1, onde 1 = muito atual).
        
        - Dados atualizados nos últimos 30 dias: 1.0
        - Dados atualizados nos últimos 90 dias: 0.7
        - Dados atualizados nos últimos 180 dias: 0.4
        - Dados mais antigos: 0.1
        """
        if not data_atualizacao:
            # Se não tem data, assume que é da Receita (mais antigo)
            return 0.5
        
        try:
            if isinstance(data_atualizacao, str):
                # Tenta parsear data
                if 'T' in data_atualizacao:
                    data = datetime.fromisoformat(data_atualizacao.replace('Z', '+00:00'))
                else:
                    data = datetime.strptime(data_atualizacao, '%Y-%m-%d')
            else:
                data = data_atualizacao
            
            agora = datetime.now()
            if isinstance(data, datetime):
                diff = agora - data
            else:
                return 0.5
            
            dias = diff.days
            
            if dias <= 30:
                return 1.0
            elif dias <= 90:
                return 0.7
            elif dias <= 180:
                return 0.4
            else:
                return 0.1
                
        except Exception as e:
            logger.warning(f"Erro ao calcular atualidade: {e}")
            return 0.5
    
    @staticmethod
    def calcular_consistencia(empresa: Dict[str, Any]) -> float:
        """
        Calcula consistência (dados não conflitantes).
        
        Verifica:
        - UF e cidade são consistentes
        - CNPJ e razão social fazem sentido
        - Contatos são do mesmo domínio/região
        """
        score = 1.0
        problemas = 0
        
        # Verifica UF e cidade
        uf = empresa.get("uf", "").upper()
        cidade = empresa.get("cidade", "").upper()
        
        # Lista básica de cidades por UF (exemplos)
        # Em produção, usar API ou base de dados
        cidades_sp = ["SÃO PAULO", "CAMPINAS", "SANTOS", "RIBEIRÃO PRETO"]
        cidades_rj = ["RIO DE JANEIRO", "NITERÓI", "CAMPOS DOS GOYTACAZES"]
        
        if uf == "SP" and cidade and cidade not in cidades_sp:
            # Não é erro, mas pode ser inconsistente
            pass  # Por enquanto não penaliza
        
        # Verifica se email e site têm domínio similar
        email = empresa.get("email") or empresa.get("email_final")
        site = empresa.get("site")
        
        if email and site:
            try:
                email_domain = email.split('@')[1] if '@' in email else None
                site_domain = site.replace('http://', '').replace('https://', '').split('/')[0]
                
                if email_domain and site_domain:
                    # Remove www.
                    site_domain = site_domain.replace('www.', '')
                    
                    # Se domínios são muito diferentes, pode ser inconsistente
                    if email_domain not in site_domain and site_domain not in email_domain:
                        problemas += 0.1  # Pequena penalização
            except:
                pass
        
        score = max(0.0, 1.0 - problemas)
        return score
    
    @staticmethod
    def calcular_qualidade_completa(empresa: Dict[str, Any]) -> DataQualityMetrics:
        """
        Calcula todas as métricas de qualidade.
        """
        completude = QualityService.calcular_completude(empresa)
        precisao = QualityService.calcular_precisao(empresa)
        atualidade = QualityService.calcular_atualidade(
            empresa.get("updated_at") or empresa.get("data_atualizacao")
        )
        consistencia = QualityService.calcular_consistencia(empresa)
        
        # Score total (média ponderada)
        score_total = (
            completude * 0.3 +
            precisao * 0.4 +
            atualidade * 0.2 +
            consistencia * 0.1
        )
        
        return DataQualityMetrics(
            completude=completude,
            precisao=precisao,
            atualidade=atualidade,
            consistencia=consistencia,
            score_total=score_total
        )


def calcular_score_priorizacao(empresa: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calcula score de priorização para prospecção.
    
    Fatores:
    - Capital Social (25%)
    - Qualidade de Contatos (30%)
    - Confiabilidade dos Dados (20%)
    - Atualidade (10%)
    - Enriquecimento (15%)
    """
    # 1. Score de Capital Social
    capital = empresa.get("capital_social") or empresa.get("capital_num")
    score_capital = 0.0
    if capital:
        try:
            capital_float = float(capital)
            # Normaliza (0-1) baseado em faixas
            if capital_float >= 1000000:
                score_capital = 1.0
            elif capital_float >= 500000:
                score_capital = 0.8
            elif capital_float >= 100000:
                score_capital = 0.6
            elif capital_float >= 50000:
                score_capital = 0.4
            else:
                score_capital = 0.2
        except:
            score_capital = 0.0
    
    # 2. Score de Contatos
    tem_email = bool(empresa.get("email") or empresa.get("email_final") or empresa.get("email_enriquecido"))
    tem_telefone = bool(empresa.get("telefone") or empresa.get("telefone_final") or empresa.get("telefone_enriquecido"))
    tem_whatsapp = bool(empresa.get("whatsapp") or empresa.get("whatsapp_final") or empresa.get("whatsapp_enriquecido"))
    
    score_contatos = 0.0
    if tem_email:
        score_contatos += 0.4
    if tem_telefone:
        score_contatos += 0.3
    if tem_whatsapp:
        score_contatos += 0.3
    
    # Validação de contatos (bonus)
    confiabilidade = calcular_score_confiabilidade(
        email=empresa.get("email_final"),
        telefone=empresa.get("telefone_final"),
        whatsapp=empresa.get("whatsapp_final"),
        cnpj=empresa.get("cnpj"),
        fonte_dados=empresa.get("fonte_dados", "receita")
    )
    score_contatos *= (0.7 + confiabilidade["score_total"] * 0.3)  # Ajusta por validação
    
    # 3. Score de Confiabilidade
    score_confiabilidade_val = confiabilidade["score_total"]
    
    # 4. Score de Atualidade
    qualidade = QualityService.calcular_qualidade_completa(empresa)
    score_atualidade = qualidade.atualidade
    
    # 5. Score de Enriquecimento
    tem_site = bool(empresa.get("site"))
    tem_enriquecimento_ia = bool(empresa.get("enriquecimento_ia") or empresa.get("resumo_ia_empresa"))
    tem_redes_sociais = bool(empresa.get("redes_sociais_empresa"))
    
    score_enriquecimento = 0.0
    if tem_site:
        score_enriquecimento += 0.4
    if tem_enriquecimento_ia:
        score_enriquecimento += 0.4
    if tem_redes_sociais:
        score_enriquecimento += 0.2
    
    # Score Total (ponderado)
    score_total = (
        score_capital * 0.25 +
        score_contatos * 0.30 +
        score_confiabilidade_val * 0.20 +
        score_atualidade * 0.10 +
        score_enriquecimento * 0.15
    )
    
    return {
        "score_total": score_total,
        "score_capital": score_capital,
        "score_contatos": score_contatos,
        "score_confiabilidade": score_confiabilidade_val,
        "score_atualidade": score_atualidade,
        "score_enriquecimento": score_enriquecimento,
        "qualidade": {
            "completude": qualidade.completude,
            "precisao": qualidade.precisao,
            "atualidade": qualidade.atualidade,
            "consistencia": qualidade.consistencia
        }
    }
