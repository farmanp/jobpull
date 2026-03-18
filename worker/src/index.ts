import type { Env, SourceRecord } from "./types";
import { runCrawl } from "./crawler";
import { loadConfigFromDB, saveConfigToDB, setActiveConfig, validatePartialConfig } from "./config";
import { getStaleThresholdDays } from "./lib/stale";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
};

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init?.headers ?? {})
    }
  });
}

function unauthorized(): Response {
  return json({ error: "unauthorized" }, { status: 401 });
}

function isAuthed(req: Request, env: Env): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return Boolean(env.ADMIN_TOKEN) && token === env.ADMIN_TOKEN;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    // Load dynamic config from D1 on every request
    const config = await loadConfigFromDB(env.DB);
    setActiveConfig(config);

    const url = new URL(request.url);

    // ── Public endpoints ──────────────────────────────────────────

    if (url.pathname === "/api/health") {
      return json({ ok: true, time: new Date().toISOString() });
    }

    if (url.pathname === "/api/meta" && request.method === "GET") {
      return json({
        boardName: config.boardName,
        tagline: config.tagline,
        remoteOnly: config.remoteOnly,
        focusCategories: config.focusCategories.map((c) => c.label),
      });
    }

    if (url.pathname === "/api/stats" && request.method === "GET") {
      const jobCount = await env.DB
        .prepare("SELECT COUNT(*) as total FROM jobs")
        .first<{ total: number }>();
      const visibleJobCount = await env.DB
        .prepare("SELECT COUNT(*) as total FROM jobs WHERE is_stale = 0")
        .first<{ total: number }>();
      const staleJobCount = await env.DB
        .prepare("SELECT COUNT(*) as total FROM jobs WHERE is_stale = 1")
        .first<{ total: number }>();
      const sourceCount = await env.DB
        .prepare("SELECT COUNT(*) as total FROM sources WHERE enabled = 1")
        .first<{ total: number }>();
      const lastCrawl = await env.DB
        .prepare(
          "SELECT finished_at, status, jobs_added FROM crawl_runs WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1"
        )
        .first<{ finished_at: string; status: string; jobs_added: number }>();

      return json({
        totalJobs: jobCount?.total ?? 0,
        visibleJobs: visibleJobCount?.total ?? 0,
        staleJobs: staleJobCount?.total ?? 0,
        activeSources: sourceCount?.total ?? 0,
        staleThresholdDays: getStaleThresholdDays(env.STALE_THRESHOLD_DAYS),
        lastCrawl: lastCrawl
          ? { finishedAt: lastCrawl.finished_at, status: lastCrawl.status, jobsAdded: lastCrawl.jobs_added }
          : null,
      });
    }

    if (url.pathname === "/api/jobs" && request.method === "GET") {
      const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
      const pmFocus = url.searchParams.get("pm_focus");
      const remoteStatus = url.searchParams.get("remote_status");
      const company = url.searchParams.get("company");
      const includeStale = url.searchParams.get("include_stale") === "1";
      const sort = url.searchParams.get("sort") === "newest_posted" ? "newest_posted" : "newest_seen";
      const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25));
      const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

      const where: string[] = [];
      const binds: unknown[] = [];

      if (!includeStale) {
        where.push("is_stale = 0");
      }

      if (query) {
        where.push("(lower(title) LIKE ? OR lower(company) LIKE ?)");
        binds.push(`%${query}%`, `%${query}%`);
      }
      if (pmFocus) {
        where.push("pm_focus = ?");
        binds.push(pmFocus);
      }
      if (remoteStatus) {
        where.push("remote_status = ?");
        binds.push(remoteStatus);
      }
      if (company) {
        where.push("company = ?");
        binds.push(company);
      }

      const sql = `
        SELECT id, title, company, location, remote_status, url, source, date_posted, date_seen, tags, pm_focus, is_stale
        FROM jobs
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY ${sort === "newest_posted" ? "COALESCE(date_posted, date_seen) DESC" : "date_seen DESC"}
        LIMIT ? OFFSET ?
      `;

      const result = await env.DB
        .prepare(sql)
        .bind(...binds, limit, offset)
        .all<Record<string, unknown>>();

      return json({
        items: (result.results ?? []).map((row) => ({
          ...row,
          tags: typeof row.tags === "string" ? JSON.parse(row.tags) : []
        })),
        limit,
        offset
      });
    }

    if (url.pathname.startsWith("/api/jobs/") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.replace("/api/jobs/", ""));
      const row = await env.DB
        .prepare(
          "SELECT id, title, company, location, remote_status, url, source, date_posted, date_seen, description, tags, pm_focus, is_stale FROM jobs WHERE id = ?"
        )
        .bind(id)
        .first<Record<string, unknown>>();

      if (!row) {
        return json({ error: "not_found" }, { status: 404 });
      }

      return json({
        ...row,
        tags: typeof row.tags === "string" ? JSON.parse(row.tags) : []
      });
    }

    if (url.pathname === "/api/digest/today" && request.method === "GET") {
      const latestRun = await env.DB
        .prepare(
          "SELECT started_at, finished_at FROM crawl_runs WHERE status IN ('success', 'partial') AND finished_at IS NOT NULL ORDER BY started_at DESC LIMIT 1"
        )
        .first<{ started_at: string; finished_at: string }>();

      let jobs;
      if (latestRun?.started_at && latestRun?.finished_at) {
        jobs = await env.DB
          .prepare(
            "SELECT id, title, company, location, remote_status, url, date_posted, date_seen, pm_focus FROM jobs WHERE is_stale = 0 AND date_seen >= ? AND date_seen <= ? ORDER BY date_seen DESC"
          )
          .bind(latestRun.started_at, latestRun.finished_at)
          .all<Record<string, unknown>>();
      } else {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        jobs = await env.DB
          .prepare(
            "SELECT id, title, company, location, remote_status, url, date_posted, date_seen, pm_focus FROM jobs WHERE is_stale = 0 AND date_seen >= ? ORDER BY date_seen DESC"
          )
          .bind(since)
          .all<Record<string, unknown>>();
      }

      const grouped = (jobs.results ?? []).reduce<Record<string, Record<string, unknown>[]>>((acc, row) => {
        const key = String(row.pm_focus ?? "unknown");
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(row);
        return acc;
      }, {});

      return json({
        generated_at: new Date().toISOString(),
        groups: grouped,
        total: (jobs.results ?? []).length
      });
    }

    // ── Admin endpoints ───────────────────────────────────────────

    if (url.pathname === "/api/admin/run-crawl" && request.method === "POST") {
      if (!isAuthed(request, env)) {
        return unauthorized();
      }

      const summary = await runCrawl(env);
      return json(summary);
    }

    // Admin: Board Config
    if (url.pathname === "/api/admin/config" && request.method === "GET") {
      if (!isAuthed(request, env)) {
        return unauthorized();
      }
      return json(config);
    }

    if (url.pathname === "/api/admin/config" && request.method === "PUT") {
      if (!isAuthed(request, env)) {
        return unauthorized();
      }

      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const errors = validatePartialConfig(body);
      if (errors.length > 0) {
        return json({ error: "Validation failed", details: errors }, { status: 400 });
      }

      const updated = await saveConfigToDB(env.DB, body);
      setActiveConfig(updated);
      return json(updated);
    }

    // Admin: Sources CRUD
    if (url.pathname === "/api/admin/sources" && request.method === "GET") {
      if (!isAuthed(request, env)) {
        return unauthorized();
      }
      const result = await env.DB
        .prepare("SELECT id, type, name, base_url, config_json, enabled FROM sources ORDER BY name")
        .all<SourceRecord>();
      return json({ sources: result.results ?? [] });
    }

    if (url.pathname === "/api/admin/sources" && request.method === "POST") {
      if (!isAuthed(request, env)) {
        return unauthorized();
      }

      let body: { id: string; type: string; name: string; base_url: string; config_json: string; enabled?: boolean };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.id || !body.type || !body.name || !body.base_url) {
        return json({ error: "Missing required fields: id, type, name, base_url" }, { status: 400 });
      }

      await env.DB
        .prepare("INSERT INTO sources (id, type, name, base_url, config_json, enabled) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(body.id, body.type, body.name, body.base_url, body.config_json ?? "{}", body.enabled !== false ? 1 : 0)
        .run();

      return json({ ok: true, id: body.id }, { status: 201 });
    }

    if (url.pathname.startsWith("/api/admin/sources/") && request.method === "PUT") {
      if (!isAuthed(request, env)) {
        return unauthorized();
      }

      const sourceId = decodeURIComponent(url.pathname.replace("/api/admin/sources/", ""));
      let body: Partial<{ name: string; base_url: string; config_json: string; enabled: boolean }>;
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const sets: string[] = [];
      const binds: unknown[] = [];

      if (body.name !== undefined) { sets.push("name = ?"); binds.push(body.name); }
      if (body.base_url !== undefined) { sets.push("base_url = ?"); binds.push(body.base_url); }
      if (body.config_json !== undefined) { sets.push("config_json = ?"); binds.push(body.config_json); }
      if (body.enabled !== undefined) { sets.push("enabled = ?"); binds.push(body.enabled ? 1 : 0); }

      if (sets.length === 0) {
        return json({ error: "No fields to update" }, { status: 400 });
      }

      binds.push(sourceId);
      await env.DB
        .prepare(`UPDATE sources SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...binds)
        .run();

      return json({ ok: true, id: sourceId });
    }

    if (url.pathname.startsWith("/api/admin/sources/") && request.method === "DELETE") {
      if (!isAuthed(request, env)) {
        return unauthorized();
      }

      const sourceId = decodeURIComponent(url.pathname.replace("/api/admin/sources/", ""));
      await env.DB
        .prepare("DELETE FROM sources WHERE id = ?")
        .bind(sourceId)
        .run();

      return json({ ok: true, id: sourceId });
    }

    return json({ error: "not_found" }, { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    // Load dynamic config before crawling
    const config = await loadConfigFromDB(env.DB);
    setActiveConfig(config);
    await runCrawl(env);
  }
};
