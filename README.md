<p align="center">
  <strong>README</strong> · <a href="#licença">Licença</a>
</p>

---

<p align="center">
  <strong style="font-size: 2em;">Hermes Insight Engine</strong>
</p>

<p align="center">
  <b>Prospecção B2B inteligente para o mercado moderno</b>
</p>

<p align="center">
  <a href="#prospecção-e-dados">Prospecção</a> ·
  <a href="#enriquecimento">Enriquecimento</a> ·
  <a href="#pipeline-e-crm">Pipeline</a> ·
  <a href="#stack-tecnológica">Stack</a> ·
  <a href="#começando">Começando</a> ·
  <a href="#deploy-em-produção">Deploy</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61dafb?logo=react" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/FastAPI-Python_3.12-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/License-Proprietary-red" alt="License" />
</p>

---

Hermes é uma **plataforma SaaS de prospecção B2B** que une busca em milhões de CNPJs da Receita Federal, enriquecimento automático (e-mail, telefone, redes sociais), pipeline visual e exportação para CRMs — com controle por créditos e planos. Autenticação multi-tenant, rate limiting e segurança em produção. **Uma plataforma, zero compromissos.**

*Feita para times de vendas e marketing que precisam encontrar e qualificar empresas no Brasil.*

---

### Uso rápido — desenvolvimento local

```bash
# Clone e instale dependências
git clone https://github.com/phventuraogum/PROJETO-HERMES.git
cd PROJETO-HERMES
npm install

# Sobe o frontend com proxy para a API (backend em outra janela)
npm run dev
# → http://localhost:8080
```

O Vite faz proxy das rotas da API para o backend; inicie a API separadamente (por exemplo `uvicorn` na porta 8000).

### Ou suba tudo com Docker

```bash
# Configure .env a partir do exemplo e rode
docker compose -f docker-compose.prod.yml up -d

# Health check
curl -s http://localhost/health
```

Redis, API, worker, frontend e Nginx sobem em conjunto. Consulte a documentação interna para variáveis de ambiente obrigatórias.

---

## Principais recursos

### Prospecção e dados

- **Base nacional** — Dezenas de milhões de CNPJs da Receita Federal em DuckDB: consultas rápidas e filtros complexos.
- **Filtros avançados** — CNAE, porte, UF, município, faturamento, natureza jurídica e combinações.
- **Execução assíncrona** — Prospecções pesadas em background com progresso em tempo real (SSE) e resultados persistidos.

### Enriquecimento

- **Múltiplas fontes** — Waterfall de provedores para e-mail e telefone; scraping e APIs especializadas quando configuradas.
- **Score de qualidade** — Pontuação de fit (ICP) e qualidade dos dados por lead para priorização.
- **Resumos com IA** — Opcional: resumos e sugestões de abordagem via modelo de linguagem.

### Pipeline e CRM

- **Kanban** — Leads em estágios (Novo, Contato, Proposta, Fechado), com notas e histórico por organização.
- **Exportação** — Um clique para Ploomes, Pipedrive, HubSpot e RD Station.
- **Mapa de calor** — Distribuição geográfica dos resultados para priorizar regiões.

### Infraestrutura e segurança

- **Containers** — Frontend (Nginx), API (FastAPI), worker (RQ), Redis e Nginx reverso via Docker Compose.
- **Segurança** — Rate limiting (Nginx + app), validação de entrada, headers de segurança, fail-closed em produção.
- **Deploy** — Scripts de setup de VPS (Docker, firewall, swap) e deploy com health checks e validação de config.

---

## Stack tecnológica

| Camada        | Tecnologias |
|---------------|-------------|
| **Frontend**  | React 18, TypeScript, Vite 7, Tailwind CSS, shadcn/ui, Radix, React Query, React Router, Leaflet, Recharts |
| **Backend**   | FastAPI (Python 3.12), DuckDB, Redis 7, RQ |
| **Auth e dados** | Supabase (Auth, Postgres, RLS, RPC) |
| **Pagamentos**   | Gateway de pagamento com webhooks validados |
| **Scraping e IA** | Scrapling, BeautifulSoup; OpenAI (opcional) |
| **Produção**  | Docker, Docker Compose, Nginx |

A documentação interna da API e variáveis de ambiente não são expostas neste README.

---

## Estrutura do projeto

Monorepo: frontend e backend na mesma raiz.

```
hermes-insight-engine/
├── backend/                 # API e workers
│   ├── api/                 # Routers, prospecção e enriquecimento
│   ├── middleware/          # Auth, rate limit, limites de plano
│   ├── config.py
│   ├── requirements.txt
│   └── Dockerfile
├── src/                     # Frontend React
│   ├── pages/                # Landing, Login, Configure, Results, Pipeline, Dashboard…
│   ├── components/           # Layout, dashboard, UI (shadcn)
│   ├── auth/
│   └── tenancy/              # Multi-tenant
├── scripts/                  # Migrações SQL, deploy, backup
├── docker-compose.prod.yml
├── Dockerfile                # Frontend (Vite → Nginx)
└── nginx.prod.conf
```

A base DuckDB não é versionada; em produção é montada via volume.

---

## Começando

**Pré-requisitos:** Node.js 20+, Python 3.12+, Redis, conta Supabase e (opcional) Docker.

1. **Clone** o repositório.
2. **Backend:** ambiente virtual, `pip install -r backend/requirements.txt`, configure variáveis (veja `.env.example` no backend).
3. **Frontend:** `npm install` na raiz, configure variáveis de build (`.env.example` na raiz).
4. **Supabase:** execute `scripts/all_migrations.sql` no SQL Editor do projeto.
5. **Redis:** acessível e URL configurada no backend.

Chaves de API e tokens são definidos apenas por variáveis de ambiente e não são documentados aqui.

---

## Deploy em produção

1. **Primeira vez:** rode o script de setup da VPS em `scripts/` (Docker, firewall, swap, diretórios, volume DuckDB).
2. **A cada deploy:** use o script de deploy que valida config, faz build dos containers, sobe os serviços e executa health checks.

Variáveis de ambiente vêm de arquivo não versionado (ex.: `.env`); detalhes na documentação interna.

---

## Licença

Proprietário. Todos os direitos reservados.

---

## Agradecimentos

Este projeto utiliza, entre outras, as seguintes tecnologias ou projetos de código aberto:

- [Scrapling](https://github.com/D4Vinci/Scrapling) — framework de web scraping adaptativo (BSD-3-Clause).
- Supabase, FastAPI, React, Vite e as demais bibliotecas das dependências do frontend e do backend.

Respeite os termos de uso dos serviços e fontes de dados utilizados.
