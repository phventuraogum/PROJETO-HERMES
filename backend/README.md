# Hermes API (ICP Radar)

Backend da plataforma Hermes ? API de prospeccao B2B com enriquecimento de dados, pipeline de leads, integracoes CRM e cobranca.

## Stack

| Componente | Tecnologia |
|------------|-----------|
| Framework | FastAPI (Python 3.12) |
| Banco de dados | DuckDB (56M+ CNPJs da Receita Federal) |
| Cache/Fila | Redis 7 + RQ |
| Auth | Supabase JWT (validacao local + fallback HTTP) |
| Pagamentos | Asaas Pay (webhook HMAC) |
| Scraping | Scrapling + BeautifulSoup |
| IA | OpenAI GPT (resumos e insights) |

## Estrutura

```
api/
  main_integrado.py     # Entrypoint principal (monta todos os routers)
  main.py               # Endpoints legados de prospeccao
  routers/
    auth.py             # Signup, login (rate limited)
    credits.py          # Pacotes, subscricoes, webhook Asaas
    prospeccao.py       # Prospeccao modular v2
    pipeline.py         # Kanban de leads (Supabase)
    crm.py              # Export Ploomes, Pipedrive, HubSpot, RD
    empresas.py         # Consulta individual de empresas
    integrations.py     # Integracoes externas
    webhooks.py         # Webhooks genericos
    health.py           # Health check
  enrichment_service.py # Orquestra enriquecimento waterfall
  prospeccao_service.py # Logica de prospeccao DuckDB
  cache_service.py      # Cache Redis
  db_pool.py            # Pool de conexoes DuckDB
  quality_service.py    # Score de qualidade dos dados
  validation_service.py # Validacao de CNPJ, email, telefone
middleware/
  auth.py               # JWT validation (local + Supabase HTTP)
  rate_limit.py         # Rate limiting por IP (Redis)
  plan_limits.py        # Controle de uso por plano (Supabase RPC)
config.py               # Settings centralizados (pydantic-settings)
icp_worker.py           # RQ worker para jobs assincronos
```

### Modulos de Enriquecimento

| Modulo | Funcao |
|--------|--------|
| `core_scraper.py` | Google Search + scraping de sites |
| `enrichment_opencnpj.py` | Dados via OpenCNPJ API |
| `enrichment_waterfall.py` | Waterfall de email (Hunter, Snov, etc) |
| `enrichment_instagram.py` | Mining de Instagram/link-in-bio |
| `enrichment_score_v2.py` | Score ICP v2 |
| `ultra_enrichment.py` | Enriquecimento de socios (WHOIS, waterfall) |
| `whatsapp_linkedin_ultra.py` | Descoberta WhatsApp + LinkedIn |
| `scrapling_service.py` | Scraping avancado via Scrapling |

## API Endpoints

### Publicos (sem auth)
- `GET /health` ? Health check
- `GET /plans` ? Lista planos disponiveis

### Auth
- `POST /auth/signup` ? Registro (rate limited: 5/min)
- `POST /auth/signup-with-plan` ? Registro + plano pago

### Prospeccao (requer JWT)
- `POST /prospeccao/run` ? Executa prospeccao
- `POST /prospeccao/run-stream` ? Prospeccao com SSE (progresso)
- `POST /mapa-calor` ? Mapa de calor geografico
- `POST /prospeccao/gerar-mensagem` ? Mensagem de abordagem IA

### Creditos e Pagamentos
- `GET /credits/packages` ? Pacotes de creditos
- `POST /credits/buy` ? Comprar pacote (gera cobranca Asaas)
- `POST /subscribe/{plan}` ? Assinar plano
- `POST /webhooks/asaas` ? Webhook Asaas (IP allowlist + HMAC)

### Pipeline
- `GET /pipeline/leads` ? Listar leads
- `POST /pipeline/leads` ? Criar lead
- `PATCH /pipeline/leads/{id}` ? Atualizar lead

### CRM
- `POST /crm/export/{provider}` ? Exportar para CRM externo

## Seguranca

- JWT validado localmente (sem round-trip) com fallback Supabase HTTP
- Rate limiting: Nginx (global) + FastAPI (por endpoint)
- HMAC + IP allowlist para webhooks Asaas
- Idempotencia em pagamentos (previne creditos duplicados)
- Creditos atualizados via RPC atomico (sem race condition)
- Fail-closed em producao se Supabase indisponivel
- Input validation (email regex, sanitizacao XSS, max_length)
- Swagger/Docs desabilitado em producao

## Docker

```dockerfile
FROM python:3.12-slim
# Instala deps de compilacao, pip install, remove deps
# COPY apenas codigo necessario (sem dados, venvs, testes)
CMD ["uvicorn", "api.main_integrado:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build:
```bash
docker compose -f docker-compose.prod.yml build api
```

## Desenvolvimento Local

```bash
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt

# Copiar e preencher .env
cp .env.example .env

# Rodar API
uvicorn api.main_integrado:app --reload --port 8000
```

Acesse `/docs` para Swagger (apenas em desenvolvimento).

## Variaveis de Ambiente

Veja `.env.example` para lista completa. Criticas em producao:

| Variavel | Descricao |
|----------|-----------|
| `ENVIRONMENT` | `production` / `development` |
| `HERMES_AUTH_REQUIRED` | `true` em producao |
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_JWT_SECRET` | Para validacao local |
| `REDIS_PASSWORD` | Obrigatoria em producao |
| `ASAAS_API_KEY` | Chave API Asaas |
| `ASAAS_WEBHOOK_TOKEN` | Token HMAC do webhook |
| `HERMES_DUCKDB_PATH` | Caminho do banco DuckDB |

## Dados

O DuckDB (`cnpj.duckdb`) contem 56M+ registros da Receita Federal e e montado via Docker volume em producao. Nao e versionado no Git (8+ GB).

## Licenca

Proprietario. Todos os direitos reservados.
