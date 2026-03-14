# ============================================================
# Dockerfile Otimizado para Hermes API/Worker
# Tamanho estimado: ~200-500 MB (vs 33.3 GB anterior)
# ============================================================

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc g++ libffi-dev libxml2-dev libxslt1-dev \
        curl

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    apt-get purge -y --auto-remove gcc g++ libffi-dev libxml2-dev libxslt1-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /root/.cache /tmp/*

# Copiar apenas código necessário (dados são excluídos via .dockerignore)
# Copiar diretórios primeiro
COPY api/ ./api/
COPY config.py ./
COPY middleware/ ./middleware/

COPY icp_worker.py ./
COPY core_scraper.py ./
COPY ultra_enrichment.py ./
COPY whatsapp_linkedin_ultra.py ./
COPY enrichment_opencnpj.py ./
COPY enrichment_waterfall.py ./
COPY enrichment_score_v2.py ./
COPY enrichment_instagram.py ./
COPY scrapling_service.py ./

# Criar diretório para dados (montado via volume)
RUN mkdir -p /data

# Expor porta
EXPOSE 8000

# Healthcheck (usando urllib que vem com Python)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Comando padrão (pode ser sobrescrito no docker-compose)
# Usa main_integrado.py que combina novos endpoints com legados
CMD ["python", "-m", "uvicorn", "api.main_integrado:app", "--host", "0.0.0.0", "--port", "8000"]
