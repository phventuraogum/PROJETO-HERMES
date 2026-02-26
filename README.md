# Hermes Insight Engine

Plataforma SaaS de prospecao B2B inteligente com enriquecimento de dados, pipeline de leads e integracoes CRM.

## Monorepo

```
hermes-insight-engine/
  ├── backend/               # API (FastAPI + DuckDB + Redis)
  │   ├── api/               # Routers, services, enrichment
  │   ├── middleware/         # Auth JWT, rate limiting, plan limits
  │   ├── config.py          # Settings centralizados
  │   ├── Dockerfile         # Build de producao
  │   └── requirements.txt   # Dependencias Python
  ├── src/                   # Frontend React
  │   ├── pages/             # Paginas da aplicacao
  │   ├── components/        # Componentes reutilizaveis
  │   ├── auth/              # Contexto de autenticacao
  │   └── tenancy/           # Multi-tenant (org context)
  ├── scripts/               # Deploy, migracoes, backup
  ├── docker-compose.prod.yml
  ├── Dockerfile             # Frontend (multi-stage Vite → Nginx)
  ├── nginx.prod.conf        # Reverse proxy producao
  └── nginx.conf             # Nginx interno do container web
```

## Stack

### Frontend
| Camada | Tecnologia |
|--------|-----------|
| Framework | React 18 + TypeScript + Vite 7 |
| UI | Tailwind CSS + shadcn/ui + Radix |
| Mapas | Leaflet + React-Leaflet |
| Graficos | Recharts |
| Auth | Supabase Auth (JWT) |
| State | React Query (TanStack) |
| Routing | React Router DOM v6 |

### Backend
| Camada | Tecnologia |
|--------|-----------|
| Framework | FastAPI (Python 3.12) |
| Banco | DuckDB (56M+ CNPJs Receita Federal) |
| Cache/Fila | Redis 7 + RQ |
| Auth | JWT local + Supabase fallback |
| Pagamentos | Asaas Pay (HMAC webhook) |
| Scraping | Scrapling + BeautifulSoup |
| IA | OpenAI GPT |

## Paginas

| Pagina | Arquivo | Descricao |
|--------|---------|-----------|
| Landing | `src/pages/Landing.tsx` | LP de vendas com pricing |
| Login | `src/pages/Login.tsx` | Autenticacao via Supabase |
| Configure | `src/pages/Configure.tsx` | Configuracao ICP |
| Results | `src/pages/Results.tsx` | Resultados enriquecidos |
| Pipeline | `src/pages/Pipeline.tsx` | Kanban de leads |
| Dashboard | `src/pages/Dashboard.tsx` | Metricas e KPIs |
| Heatmap | `src/pages/Heatmap.tsx` | Mapa de calor geografico |
| Creditos | `src/pages/ComprarCreditos.tsx` | Compra de creditos (Asaas) |
| Settings | `src/pages/Settings.tsx` | Configuracoes da conta |
| Historico | `src/pages/History.tsx` | Historico de prospeccoes |

## API Endpoints

### Publicos
- `GET /health` — Health check
- `GET /plans` — Planos disponiveis

### Auth
- `POST /auth/signup` — Registro (rate limited)
- `POST /auth/signup-with-plan` — Registro + plano pago

### Prospeccao (JWT)
- `POST /prospeccao/run` — Executar prospeccao
- `POST /prospeccao/run-stream` — Prospeccao com SSE
- `POST /mapa-calor` — Mapa de calor

### Creditos
- `GET /credits/packages` — Pacotes
- `POST /credits/buy` — Comprar (Asaas)
- `POST /subscribe/{plan}` — Assinar plano
- `POST /webhooks/asaas` — Webhook (HMAC + IP allowlist)

## Docker

O frontend e servido via Nginx em container. O build usa multi-stage:

```
Stage 1: node:20-alpine  -> npm ci && npm run build
Stage 2: nginx:1.27-alpine -> serve /dist
```

Build local:
```bash
docker compose -f docker-compose.prod.yml build web
```

## Producao

O `docker-compose.prod.yml` orquestra 5 servicos:

| Servico | Descricao |
|---------|-----------|
| `redis` | Cache + rate limiting + fila |
| `api` | FastAPI backend (icp_radar) |
| `worker` | RQ worker para jobs async |
| `web` | Este frontend (Nginx) |
| `nginx` | Reverse proxy + security headers |

### Variaveis de Ambiente

Copie `.env.production` para `.env` e preencha:

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Sim | Chave publica |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave de servico (nunca expor) |
| `SUPABASE_JWT_SECRET` | Sim | Para validacao local de tokens |
| `REDIS_PASSWORD` | Sim | Gerar com `openssl rand -hex 32` |
| `CORS_ORIGINS` | Sim | Dominio de producao |
| `ASAAS_API_KEY` | Sim | Chave da API Asaas Pay |
| `ASAAS_WEBHOOK_TOKEN` | Sim | Token para validar webhooks |
| `OPENAI_API_KEY` | Nao | Para resumos IA |

### Deploy na VPS

```bash
# 1. Setup (primeira vez)
bash scripts/setup_and_deploy.sh

# 2. Deploy
bash scripts/deploy.sh
```

O deploy valida configuracoes criticas, builda containers, e roda health checks automaticamente.

## Desenvolvimento Local

```bash
npm install
npm run dev
# Acesse http://localhost:8080
```

O Vite proxy redireciona `/prospeccao`, `/docs`, `/openapi.json` para `localhost:8000` (API).

## Migracao Supabase

Rode `scripts/all_migrations.sql` no **Supabase Dashboard > SQL Editor**. Inclui:

- Tabelas: `plans`, `organizations`, `org_members`, `payments`, `pipeline_leads`, `pipeline_notes`
- RLS (Row Level Security) em todas as tabelas
- Funcoes RPC: `consume_usage`, `increment_credits`
- Trigger para plano free automatico no signup

## Licenca

Proprietario. Todos os direitos reservados.
