---
title: Overview
slug: /intro
---

# jobpull overview

`jobpull` is a self-hosted job board starter kit. It crawls official public feeds, classifies roles, stores them in a small database, and serves a searchable board with an admin path for configuration and recrawls.

## What it does well

- ingests public job feeds from Greenhouse, Lever, Ashby, Recruitee, Personio XML, and generic JSON endpoints
- applies role filters, focus categories, remote status, and tags
- supports starter packs for `product`, `engineering`, `design`, and `gtm`
- hides stale jobs by default instead of leaving obviously dead listings in the public board
- runs either on the Cloudflare reference path or the portable Docker/Node/SQLite path

## Who this is for

Use `jobpull` if you want to:

- launch a niche job board for a role or community
- run a self-hosted board instead of relying on a third-party aggregator
- tune job filters and feed sources without rebuilding the whole product
- self-host on Cloudflare, a VPS, or Docker Compose

## Recommended reading order

1. [Cloudflare Quick Start](./getting-started/cloudflare-quickstart.md)
2. [Docker Compose Quick Start](./getting-started/docker-compose.md)
3. [Starter Packs](./guides/starter-packs.md)
4. [Source Feeds](./guides/source-feeds.md)
5. [Operations](./guides/operations.md)
