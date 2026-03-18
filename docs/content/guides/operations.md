---
title: Operations
slug: /guides/operations
---

# Operations guide

This guide covers the day-two tasks that keep a board healthy.

## Migrations

Apply worker migrations whenever schema changes land:

```bash
cd worker
npx wrangler d1 migrations apply DB --local
```

For the Docker/Node path, worker migrations are applied against SQLite on startup.

## Stale jobs

Stale handling is soft-hide, not deletion.

Default behavior:

- jobs become stale after 14 days without being seen again
- stale jobs are hidden from default public listings
- stale rows remain queryable by ID
- `include_stale=1` exposes them in `/api/jobs`

## Recrawls

Manual recrawl:

```bash
curl -X POST http://127.0.0.1:8787/api/admin/run-crawl \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Troubleshooting checklist

- API error mentioning a missing DB column: re-apply local migrations
- board looks empty after a pack change: trigger a crawl
- jobs feel outdated: check `staleJobs` and `lastCrawl` in `/api/stats`
- provider errors: validate the upstream public feed before changing parser code

## What to back up

For Cloudflare, treat D1 as the source of truth.

For Docker:

- back up `./data/jobpull.sqlite`
- keep `.env.docker` safe
- keep your source and config choices documented
