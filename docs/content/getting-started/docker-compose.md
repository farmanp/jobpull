---
title: Docker Compose
slug: /getting-started/docker-compose
---

# Docker Compose quick start

Use this path when you want a single portable app container with SQLite and same-origin API + frontend serving.

## What runs in the container

- the Node server adapter
- the existing worker API/crawler logic
- worker migrations applied against SQLite on startup
- the built frontend served from the same origin
- an internal cron scheduler using the same cron string shape as Cloudflare

## First run

```bash
npm install
cp .env.docker.example .env.docker
docker compose up --build
```

## Important environment variables

Set these in `.env.docker`:

```env
ADMIN_TOKEN=change-me
PORT=8787
DB_PATH=/data/job_pull.sqlite
CRON_SCHEDULE=0 7 * * *
USER_AGENT=JobPullBot/1.0 (+contact:you@example.com)
STALE_THRESHOLD_DAYS=14
```

## Runtime shape

- app URL: `http://127.0.0.1:8787`
- persistent DB file: `/data/job_pull.sqlite`
- volume mount: `./data:/data`

## When to choose Docker instead of Cloudflare

Choose Docker if you want:

- one service instead of Worker + Pages
- same-origin API and frontend without extra deployment steps
- a VPS-friendly deployment target
- a migration path to other container hosts later

## Caveat

On non-Docker hosts, the Node server adapter shells out to the `sqlite3` CLI. Inside Docker, that binary is installed in the image for you.
