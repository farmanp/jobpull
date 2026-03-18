---
title: Cloudflare Quick Start
slug: /getting-started/cloudflare-quickstart
---

# Cloudflare quick start

This is the reference deployment path for `jobpull`.

## Prerequisites

- Node.js 20+
- npm
- a Cloudflare account
- Wrangler access

## Fast path

```bash
git clone https://github.com/farmanp/jobpull.git
cd jobpull
npm install
npm run setup
```

The setup CLI will:

1. check local prerequisites
2. ask for your board name, contact email, D1 database name, and starter pack
3. create or patch the local Cloudflare config
4. apply migrations
5. seed the selected starter pack
6. generate local secrets and frontend env files

## Local development

```bash
# terminal 1
npm run dev:worker

# terminal 2
npm run dev:web
```

Default local ports:

- worker API: `http://127.0.0.1:8787`
- web app: `http://127.0.0.1:5173`

## Trigger a crawl

```bash
curl -X POST http://127.0.0.1:8787/api/admin/run-crawl \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Common local gotcha

After schema changes, your local D1 database needs fresh migrations. If the API starts failing with database-column errors, run:

```bash
cd worker
npx wrangler d1 migrations apply DB --local
```

## Deploy

```bash
cd worker
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

Then deploy `web/dist` to Cloudflare Pages with `VITE_API_BASE` pointing at the worker URL.
