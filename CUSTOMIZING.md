# Customizing Your Job Board

This guide covers every way to make jobpull your own — from a quick role-focus change to building entirely new crawler integrations.

---

## Table of Contents

1. [Apply a starter pack](#1-apply-a-starter-pack)
2. [Change the target role](#2-change-the-target-role)
3. [Add focus categories](#3-add-focus-categories)
4. [Add auto-tags](#4-add-auto-tags)
5. [Add a new job source](#5-add-a-new-job-source)
6. [Build a custom fetcher](#6-build-a-custom-fetcher)
7. [Branding & theming](#7-branding--theming)
8. [Cron schedule](#8-cron-schedule)
9. [Stale jobs](#9-stale-jobs)
10. [Docker Compose](#10-docker-compose)

---

## 1. Apply a Starter Pack

Starter packs are the preferred onboarding path. They set the board focus, categories, tags, and a small set of starter sources.

```bash
npm run cli -- packs list
npm run cli -- packs show product
npm run cli -- packs apply product
```

Available packs:
- `product`
- `engineering`
- `design`
- `gtm`

Pack application preserves your `boardName` and `contactEmail` values, updates role-targeting config, and upserts managed starter sources by stable IDs without deleting custom sources.

---

## 2. Change the Target Role

**File:** `worker/src/config.ts`

The `DEFAULT_CONFIG` object controls what roles your board keeps. Edit the `titleIncludePatterns` and `titleExcludePatterns`:

### Example: Software Engineering

```typescript
titleIncludePatterns: [
  {
    label: "Engineering titles",
    source: "\\b(software engineer|frontend engineer|backend engineer|fullstack|full stack|sre|site reliability|devops engineer|staff engineer|principal engineer|engineering manager)\\b",
  },
],

titleExcludePatterns: [
  {
    label: "Non-eng roles",
    source: "\\b(sales engineer|solutions engineer|support engineer|qa engineer|test engineer)\\b",
  },
],

// Disable the PM-specific fallback
descriptionFallback: null,
```

### Example: Design

```typescript
titleIncludePatterns: [
  {
    label: "Design titles",
    source: "\\b(product designer|ux designer|ui designer|design lead|head of design|design manager|interaction designer|visual designer|ux researcher)\\b",
  },
],

titleExcludePatterns: [
  {
    label: "Non-design roles",
    source: "\\b(graphic designer|web designer|interior designer)\\b",
  },
],

descriptionFallback: null,
```

### Example: Data & Analytics

```typescript
titleIncludePatterns: [
  {
    label: "Data titles",
    source: "\\b(data scientist|data engineer|data analyst|analytics engineer|ml engineer|machine learning|bi analyst|business intelligence)\\b",
  },
],
```

### Keep all roles (no filtering)

```typescript
titleIncludePatterns: [
  { label: "All roles", source: "." },  // matches everything
],
titleExcludePatterns: [],
descriptionFallback: null,
```

### Include non-remote jobs

```typescript
remoteOnly: false,
```

---

## 3. Add Focus Categories

Focus categories let users filter by sub-discipline. They appear as dropdown options in the UI.

```typescript
focusCategories: [
  { label: "frontend", source: "frontend|react|vue|angular|css" },
  { label: "backend", source: "backend|api|microservices|distributed" },
  { label: "infrastructure", source: "infra|devops|sre|kubernetes|terraform" },
  { label: "mobile", source: "mobile|ios|android|react native|flutter" },
  { label: "ml", source: "machine learning|ml|ai|deep learning|nlp" },
],
```

The `source` is a regex pattern (case-insensitive) matched against the job title + description.

---

## 4. Add Auto-Tags

Tags help users quickly scan industry/skill signals. They're automatically applied based on job content.

```typescript
tagKeywords: [
  { tag: "typescript", source: "\\btypescript\\b|\\bts\\b" },
  { tag: "python", source: "\\bpython\\b" },
  { tag: "rust", source: "\\brust\\b" },
  { tag: "go", source: "\\bgolang\\b|\\bgo\\b" },
  { tag: "remote", source: "\\bremote\\b|distributed" },
  { tag: "startup", source: "startup|seed|series [ab]" },
  { tag: "enterprise", source: "enterprise|fortune 500" },
],
```

---

## 5. Add a New Job Source

Preferred path:

```bash
npm run cli -- sources
```

That flow writes the right `type`, `base_url`, and `config_json` shape for the built-in providers below.
If you are starting from scratch, use `packs apply` first and treat `worker/seeds/sources.sql` as a legacy/manual example rather than the primary onboarding path.

### Greenhouse board

Add a row to `worker/seeds/sources.sql`:

```sql
INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
  ('gh-spotify', 'greenhouse', 'Spotify Greenhouse', 'https://boards-api.greenhouse.io',
   '{"boardToken":"spotify","departmentKeywords":["engineering"]}', 1);
```

**Config options:**
- `boardToken` — the company's Greenhouse board token (from their careers page URL)
- `departmentKeywords` — filter by department name (optional, defaults to `["product"]`)

### Lever board

```sql
INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
  ('lever-figma', 'lever', 'Figma Lever', 'https://api.lever.co',
   '{"site":"figma","teamKeywords":["design"]}', 1);
```

**Config options:**
- `site` — the company's Lever site name
- `teamKeywords` — filter by team name (optional, defaults to `["product"]`)

### Ashby board

```sql
INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
  ('ashby-openai', 'ashby', 'OpenAI Ashby', 'https://api.ashbyhq.com',
   '{"organizationSlug":"openai"}', 1);
```

**Config options:**
- `organizationSlug` — the public Ashby organization slug used in `/posting-api/job-board/:slug`

### Recruitee board

```sql
INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
  ('recruitee-publitas', 'recruitee', 'Publitas Recruitee', 'https://publitas.recruitee.com',
   '{"subdomain":"publitas"}', 1);
```

**Config options:**
- `subdomain` — the company subdomain used in `https://SUBDOMAIN.recruitee.com/api/offers/`

### Personio XML board

```sql
INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
  ('personio-ory', 'personio_xml', 'Ory Personio XML', 'https://ory.jobs.personio.de',
   '{"companySlug":"ory","language":"en"}', 1);
```

**Config options:**
- `companySlug` — the company slug used in `https://SLUG.jobs.personio.de/xml`
- `language` — optional feed language, defaults to `"en"`

### Generic JSON feed

```sql
INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
  ('myjobfeed', 'remote_json', 'My Job Feed', 'https://example.com',
   '{"url":"https://example.com/api/jobs","sourceLabel":"myfeed","assumeRemote":false}', 1);
```

The parser auto-detects common JSON structures (arrays, `{ jobs: [...] }`, `{ data: [...] }`, ElasticSearch hits).

### Apply after editing

```bash
cd worker
npx wrangler d1 execute DB --local --file=./seeds/sources.sql
```

This file is still useful as a manual example or for low-level experimentation, but it is no longer the preferred way to bootstrap a new board.

---

## 6. Build a Custom Fetcher

### Validation-first checklist

Before you add a new source type to the repo:

1. Find one real public tenant that uses the provider.
2. Call the official public JSON or XML endpoint directly without credentials.
3. Confirm the response includes the minimum fields needed for `JobCandidate`: title, canonical URL, company or company source, location/workplace info, optional posting date, and description.
4. Save a minimal fixture derived from that live payload only after the endpoint is proven.
5. If the endpoint requires auth, has no stable detail URL, or the shape is too tenant-specific, defer the provider instead of scaffolding around it.

Built-in read-only providers follow this rule. The current wave validated Ashby, Recruitee, and Personio XML against live public tenants before the fetchers were added.

For job boards with non-standard APIs, create a new fetcher:

### 1. Create the fetcher file

`worker/src/fetchers/myboard.ts`:

```typescript
import type { JobCandidate, SourceRecord } from "../types";
import { isTargetRole } from "../lib/classify";
import { SafeFetchClient } from "../lib/fetchClient";

interface MyBoardConfig {
  apiUrl: string;
  // add custom config fields
}

export async function fetchMyBoardJobs(
  source: SourceRecord,
  client: SafeFetchClient
): Promise<JobCandidate[]> {
  const config = JSON.parse(source.config_json) as MyBoardConfig;
  const response = await client.fetchText(config.apiUrl);

  if (response.notModified || !response.text) return [];

  const data = JSON.parse(response.text) as any[];

  return data
    .filter((item) => isTargetRole(item.title, item.description))
    .map((item) => ({
      title: item.title,
      company: item.company,
      location: item.location ?? "Unknown",
      url: item.url,
      source: source.name,
      date_posted: item.posted_at,
      description: item.description ?? "",
    }));
}
```

### 2. Register in crawler.ts

```typescript
import { fetchMyBoardJobs } from "./fetchers/myboard";

// In fetchSourceJobs():
case "myboard":
  return fetchMyBoardJobs(source, client);
```

### 3. Update types.ts

```typescript
export type SourceType =
  | "greenhouse"
  | "lever"
  | "remote_json"
  | "ashby"
  | "recruitee"
  | "personio_xml"
  | "myboard";
```

### 4. Add a source record

```sql
INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES
  ('myboard-1', 'myboard', 'My Board', 'https://myboard.com',
   '{"apiUrl":"https://myboard.com/api/v1/jobs"}', 1);
```

---

## 7. Branding & Theming

### Board name & tagline

**Option A:** Edit `worker/src/config.ts`:
```typescript
boardName: "DevJobs Remote",
tagline: "Curated remote engineering roles",
```

**Option B:** Set env vars in `web/.env`:
```env
VITE_BOARD_NAME=DevJobs Remote
VITE_TAGLINE=Curated remote engineering roles
```

### Accent color

Edit `web/src/styles.css`:
```css
:root {
  --accent: #10b981;        /* emerald green */
  --accent-light: #34d399;
  --accent-dim: rgba(16, 185, 129, 0.15);
}
```

Or via env var: `VITE_ACCENT_COLOR=#10b981`

### Light mode

The default theme is dark. To switch to light, update the CSS tokens in `:root`.

---

## 8. Cron Schedule

The crawler runs on a cron schedule defined in `worker/wrangler.toml`:

```toml
[triggers]
crons = ["0 7 * * *"]  # 7:00 AM UTC daily
```

Examples:
- Twice daily: `["0 7 * * *", "0 19 * * *"]`
- Every 6 hours: `["0 */6 * * *"]`
- Weekdays only: `["0 7 * * 1-5"]`

---

## 9. Stale Jobs

The board uses soft stale hiding rather than deleting rows.

Default behavior:
- jobs are marked stale after 14 days without being seen again
- stale jobs are hidden from default public listings
- stale rows remain in the database and are still accessible by `GET /api/jobs/:id`
- pass `include_stale=1` to `GET /api/jobs` to inspect hidden rows

The public stats endpoint exposes both visible and stale counts so you can see how much of the board is currently hidden.

---

## 10. Docker Compose

The Docker path is a single app container with SQLite and same-origin API + web. Use it when you want portability outside Cloudflare without splitting the system into multiple services.

```bash
docker compose up --build
```

Expected runtime shape:
- file-backed SQLite at `/data/jobpull.sqlite`
- internal scheduler using the same cron shape as Cloudflare
- built `web/dist` served by the same Node process that handles API routes

Keep Cloudflare as the reference path for production defaults. Docker is the portable alternative for VPS/self-hosted installs.
