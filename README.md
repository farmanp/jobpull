# job_pull 🔍

**Your own job board in 5 minutes.** Fork, customize, deploy — Cloudflare-first, with a portable Docker path and a built-in Docusaurus docs site.

A self-hosted job board that automatically crawls official public feeds from Greenhouse, Lever, Ashby, Recruitee, Personio XML, and generic JSON endpoints. Filter by role, remote status, and focus area. Comes pre-configured for remote Product Management roles, but easily customizable for **any job category**.

> 🎯 Built for the current moment — whether you're job hunting after a layoff, running a community board for your Slack group, or helping bootcamp grads find their first role.

---

## ✨ Features

- **Automated daily crawls** — Greenhouse, Lever, Ashby, Recruitee, Personio XML, and generic JSON feeds
- **Smart classification** — auto-detects role type, remote status, focus area, and industry tags
- **Safety-first crawler** — ETags, backoff, rate limiting, host pause on 429
- **Safer job details** — descriptions are normalized to plain text before storage and rendering
- **Self-host for free** — fits entirely within Cloudflare's free tier (Workers + D1 + Pages)
- **Portable deployment option** — run the same board locally or on a VPS with Docker Compose
- **Docs site included** — Docusaurus docs workspace for setup guides and operator runbooks
- **Customizable** — change role focus by editing a single config file
- **Premium dark UI** — glassmorphism, animations, responsive design

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Job Boards   │────▶│ CF Worker    │────▶│ Cloudflare   │
│ (GH/Lever/   │     │ (Crawler +   │     │ D1 Database  │
│  RemoteOK…)  │     │  REST API)   │     │              │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────▼───────┐
                     │ React SPA    │
                     │ (CF Pages)   │
                     └──────────────┘
```

## 🚀 Quick Start

### Option A: Interactive CLI (recommended)

```bash
git clone YOUR_REPO_URL
cd job_pull
npm install
npm run setup
```

The setup wizard will:
1. Check prerequisites
2. Ask for your board name & contact email
3. Ask for a starter pack
4. Create the D1 database
5. Apply migrations & pack data
6. Generate secrets & env files

### Option B: Manual setup

```bash
# 1. Install
npm install

# 2. Create D1 database
cd worker
npx wrangler d1 create job_pull_db
# Copy the returned database_id into worker/wrangler.toml

# 3. Apply migrations
npx wrangler d1 migrations apply DB --local

# 4. Apply the preferred starter pack
npm run cli -- packs apply product

# 5. Create secrets
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your admin token

# 6. Create frontend env
cd ../web
cp .env.example .env
```

### Start developing

```bash
# Terminal 1: API + crawler
npm run dev:worker

# Terminal 2: Frontend
npm run dev:web

# Terminal 3: Docs site
npm run dev:docs
```

### Trigger a crawl

```bash
curl -X POST http://localhost:8787/api/admin/run-crawl \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Read the docs locally

```bash
npm run dev:docs
```

Default docs URL:

- `http://127.0.0.1:4175`

---

## 🎨 Customization

### Change job focus

Edit `worker/src/config.ts` to target any role — engineering, design, marketing, data, etc.

```typescript
// Example: switch from PM to Software Engineering
export const DEFAULT_CONFIG: BoardConfig = {
  boardName: "Remote Eng Jobs",
  tagline: "Remote-first Engineering roles, updated daily",

  titleIncludePatterns: [
    {
      label: "Engineering titles",
      source: "\\b(software engineer|frontend|backend|fullstack|sre|devops|staff engineer)\\b",
    },
  ],

  titleExcludePatterns: [
    {
      label: "Non-eng roles",
      source: "\\b(sales engineer|support engineer|solutions engineer)\\b",
    },
  ],

  // ... customize focus categories, tags, etc.
};
```

### Add a new job source

Use the interactive CLI when possible:

```bash
npm run cli -- sources
```

Or apply a starter pack first:

```bash
npm run cli -- packs list
npm run cli -- packs show engineering
npm run cli -- packs apply engineering
```

Manual `sources.sql` editing is legacy only.

1. **Greenhouse board** — add a row to `worker/seeds/sources.sql` only if you need a manual example:
   ```sql
   INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
     ('gh-mycompany', 'greenhouse', 'MyCompany', 'https://boards-api.greenhouse.io',
      '{"boardToken":"mycompany","departmentKeywords":["engineering"]}', 1);
   ```

2. **Lever board** — similar, using type `lever`.

3. **Ashby board**:
   ```sql
   INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
     ('ashby-openai', 'ashby', 'OpenAI Ashby', 'https://api.ashbyhq.com',
      '{"organizationSlug":"openai"}', 1);
   ```

4. **Recruitee board**:
   ```sql
   INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
     ('recruitee-publitas', 'recruitee', 'Publitas Recruitee', 'https://publitas.recruitee.com',
      '{"subdomain":"publitas"}', 1);
   ```

5. **Personio XML board**:
   ```sql
   INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
     ('personio-ory', 'personio_xml', 'Ory Personio XML', 'https://ory.jobs.personio.de',
      '{"companySlug":"ory","language":"en"}', 1);
   ```

6. **Custom JSON feed** — use type `remote_json` with a URL to any JSON API.

See [CUSTOMIZING.md](CUSTOMIZING.md) for a full guide.

## 📥 Supported Read-Only Feeds

| Provider | Official endpoint | Auth required | Config fields | Notes |
|:---|:---|:---|:---|:---|
| `greenhouse` | Job Board API JSON | No | `boardToken`, `departmentKeywords` | Public listings only |
| `lever` | Postings API JSON | No | `site`, `teamKeywords` | Public listings only |
| `ashby` | Public job board JSON | No | `organizationSlug` | Validated against a live public Ashby tenant |
| `recruitee` | Careers offers JSON | No | `subdomain` | Validated against a live public Recruitee tenant |
| `personio_xml` | Career page XML | No | `companySlug`, `language` | Detail URLs are derived using Personio's documented pattern |
| `remote_json` | Generic JSON feed | Usually no | `url`, `sourceLabel`, `assumeRemote` | Supports arrays, `{ jobs }`, `{ data }`, and search hits |

## 🎒 Starter Packs

Starter packs are the preferred way to bootstrap a board.

Use these commands:
```bash
npm run cli -- packs list
npm run cli -- packs show product
npm run cli -- packs apply product
```

Available packs:
- `product` — remote PM boards and PM-adjacent public feeds
- `engineering` — software, infra, data, and ML roles
- `design` — product design, UX, and research roles
- `gtm` — sales, marketing, success, and revops roles

Each pack updates board config and seeds a small set of starter sources by stable IDs without deleting custom sources.

### Branding

Set these in your `web/.env`:
```env
VITE_BOARD_NAME=My Job Board
VITE_TAGLINE=The best remote jobs, daily
VITE_ACCENT_COLOR=#6366f1
```

---

## 📡 API Endpoints

| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/meta` | — | Board name, tagline, focus categories |
| `GET` | `/api/stats` | — | Total jobs, visible jobs, stale jobs, sources, last crawl info |
| `GET` | `/api/jobs` | — | Search & filter jobs; add `include_stale=1` to show hidden rows |
| `GET` | `/api/jobs/:id` | — | Single job detail, including stale rows |
| `GET` | `/api/digest/today` | — | Today's new jobs grouped by focus |
| `POST` | `/api/admin/run-crawl` | Bearer | Trigger a manual crawl |

### Query parameters for `/api/jobs`

| Param | Description |
|:---|:---|
| `query` | Search title or company |
| `pm_focus` | Filter by focus category |
| `remote_status` | `remote`, `hybrid`, `onsite`, `unknown` |
| `company` | Filter by company name |
| `sort` | `newest_seen` (default) or `newest_posted` |
| `limit` | 1–100 (default 25) |
| `offset` | Pagination offset |
| `include_stale` | `1` to include stale rows in `/api/jobs` |

---

## 🧪 Testing

```bash
npm test          # Worker unit tests (Vitest)
npm run test:web  # Frontend tests
npm run build -w docs
```

---

## 🚢 Deploy

### Worker

```bash
cd worker
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --file=./seeds/sources.sql
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

For Cloudflare-first installs, `npm run setup` and `npm run cli -- packs apply ...` are the preferred setup path. `sources.sql` remains as a manual example for advanced use.

### Frontend (Cloudflare Pages)

Create a Pages project with:
- **Build command:** `npm run build`
- **Build output:** `web/dist`
- **Environment variable:** `VITE_API_BASE=https://your-worker.workers.dev`

### Docker Compose

Use the Docker path when you want a single portable app container with SQLite and same-origin API + web:

```bash
docker compose up --build
```

The container mounts a persistent `./data` volume and serves the built web app alongside the API. See [CUSTOMIZING.md](CUSTOMIZING.md) for the Docker guide and environment file.

---

## 🔐 Security

Do not commit secrets or local runtime files.

Ignored by default:

- `.env`
- `.env.local`
- `.env.production`
- `.env.docker`
- `.dev.vars`
- `worker/.wrangler/`
- local SQLite files in `data/`

If you change deployment or setup flows, double-check that admin tokens, production env files, and local database state are still excluded from git before committing.

---

## 🛡️ Safety Controls

The crawler is designed to be a good citizen:
- Per-host concurrency limiting
- Per-host request spacing (750ms default)
- Exponential backoff with jitter on 429/503
- `Retry-After` header support
- Request timeouts + max retries
- ETag / If-Modified-Since cache validation
- Automatic host pause after repeated 429s

---

## Monorepo Structure

```
├── worker/                 # Cloudflare Worker (API + crawler)
│   ├── src/
│   │   ├── index.ts        # API routes
│   │   ├── crawler.ts      # Crawl orchestration
│   │   ├── config.ts       # ⭐ Board config (edit this!)
│   │   ├── types.ts        # TypeScript interfaces
│   │   ├── fetchers/       # Greenhouse, Lever, Ashby, Recruitee, Personio XML, JSON
│   │   └── lib/            # classify, hash, backoff, dedupe
│   ├── migrations/         # D1 SQL schema
│   ├── seeds/              # Initial source data
│   └── test/               # Vitest tests
├── web/                    # React + Vite frontend
│   └── src/
│       ├── App.tsx          # Main UI
│       └── styles.css       # Design system
├── scripts/
│   └── setup.ts            # Interactive setup CLI
└── package.json            # Workspace root
```

---

## License

MIT — do whatever you want with it. If you build something cool, let us know!
