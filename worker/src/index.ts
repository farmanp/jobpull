import { applyPack, getAdminRuntimeInfo, isPackName, listAdminPacks, listAdminSourceTemplates, updateAdminRuntime, validateSource } from "./admin";
import { loadConfigFromDB, saveConfigToDB, setActiveConfig, validatePartialConfig } from "./config";
import { getTodayDigest } from "./digest";
import { runCrawl } from "./crawler";
import { getStaleThresholdDays } from "./lib/stale";
import { escapeHtml } from "./email";
import { canViewerBrowseBoard, claimBoardWithEmail, deleteActiveResume, getBoardAccessContext, getMeResponse, getOwnerRuntimeFlags, getRequestIdentity, getUserProfile, isAdminAuthorized, listTrackedJobs, requestOwnerSignIn, saveJobState, saveResume, saveUserProfile, setBoardPublicState, verifyOwnerSession } from "./owner";
import { confirmSubscription, createSubscription, getAdminNotificationsInfo, maybeSendScheduledDigest, sendAdminTestDigest, unsubscribeSubscription } from "./notifications";
import type { Env, JobUserStatus, SourceRecord } from "./types";
import { buildClearSessionCookie, buildSessionCookie } from "./session";

function corsHeaders(request: Request): Headers {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-credentials": "true"
  });

  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  } else {
    headers.set("access-control-allow-origin", "*");
  }

  return headers;
}

function mergeHeaders(base: Headers, extra?: HeadersInit): Headers {
  const headers = new Headers(base);
  if (extra) {
    new Headers(extra).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

function json(request: Request, data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: mergeHeaders(
      corsHeaders(request),
      {
        "content-type": "application/json; charset=utf-8",
        ...(init?.headers ?? {})
      }
    )
  });
}

function html(request: Request, title: string, body: string, status = 200, extraHeaders?: HeadersInit): Response {
  const content = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · jobpull</title>
    <style>
      :root { color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f8f7; color: #171717; }
      .card { width: min(560px, calc(100vw - 32px)); padding: 32px; border-radius: 24px; background: #ffffff; border: 1px solid #e5e7eb; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
      .kicker { margin-bottom: 12px; color: #00c805; font-size: 12px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
      h1 { margin: 0 0 12px; font-size: 32px; line-height: 1.1; }
      p { margin: 0 0 14px; color: #4b5563; line-height: 1.65; }
      a { display: inline-flex; margin-top: 8px; align-items: center; padding: 12px 18px; border-radius: 999px; background: #00c805; color: #ffffff; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="kicker">jobpull</div>
      ${body}
    </main>
  </body>
</html>`;

  return new Response(content, {
    status,
    headers: mergeHeaders(
      corsHeaders(request),
      {
        "content-type": "text/html; charset=utf-8",
        ...(extraHeaders ?? {})
      }
    )
  });
}

function redirect(request: Request, location: string, cookie?: string): Response {
  const headers = mergeHeaders(corsHeaders(request), { location });
  if (cookie) {
    headers.set("set-cookie", cookie);
  }
  return new Response(null, { status: 302, headers });
}

function unauthorized(request: Request): Response {
  return json(request, { error: "unauthorized" }, { status: 401 });
}

async function readJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const config = await loadConfigFromDB(env.DB);
    setActiveConfig(config);
    const { boardState, ownerSession } = await getBoardAccessContext(request, env);
    const isOwner = Boolean(ownerSession);
    const canBrowse = canViewerBrowseBoard(env, boardState, ownerSession);
    const ownerRuntime = getOwnerRuntimeFlags(env);

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json(request, { ok: true, time: new Date().toISOString() });
    }

    if (url.pathname === "/api/meta" && request.method === "GET") {
      return json(request, {
        boardName: config.boardName,
        tagline: config.tagline,
        remoteOnly: config.remoteOnly,
        focusCategories: config.focusCategories.map((category) => category.label),
        visibility: boardState.visibility,
        claimed: Boolean(boardState.owner_user_id),
        viewerIsOwner: isOwner,
        viewerCanBrowse: canBrowse,
        auth: {
          claimRequired: !ownerRuntime.allowUnclaimedBrowse,
          magicLinkDelivery: ownerRuntime.magicLinkDelivery
        }
      });
    }

    if (url.pathname === "/api/stats" && request.method === "GET") {
      if (!canBrowse) {
        return unauthorized(request);
      }

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

      return json(request, {
        totalJobs: jobCount?.total ?? 0,
        visibleJobs: visibleJobCount?.total ?? 0,
        staleJobs: staleJobCount?.total ?? 0,
        activeSources: sourceCount?.total ?? 0,
        staleThresholdDays: getStaleThresholdDays(env.STALE_THRESHOLD_DAYS),
        lastCrawl: lastCrawl
          ? { finishedAt: lastCrawl.finished_at, status: lastCrawl.status, jobsAdded: lastCrawl.jobs_added }
          : null
      });
    }

    if (url.pathname === "/api/jobs" && request.method === "GET") {
      if (!canBrowse) {
        return unauthorized(request);
      }

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

      return json(request, {
        items: (result.results ?? []).map((row) => ({
          ...row,
          tags: typeof row.tags === "string" ? JSON.parse(row.tags) : []
        })),
        limit,
        offset
      });
    }

    if (url.pathname.startsWith("/api/jobs/") && request.method === "GET") {
      if (!canBrowse) {
        return unauthorized(request);
      }

      const id = decodeURIComponent(url.pathname.replace("/api/jobs/", ""));
      const row = await env.DB
        .prepare(
          "SELECT id, title, company, location, remote_status, url, source, date_posted, date_seen, description, tags, pm_focus, is_stale FROM jobs WHERE id = ?"
        )
        .bind(id)
        .first<Record<string, unknown>>();

      if (!row) {
        return json(request, { error: "not_found" }, { status: 404 });
      }

      return json(request, {
        ...row,
        tags: typeof row.tags === "string" ? JSON.parse(row.tags) : []
      });
    }

    if (url.pathname === "/api/digest/today" && request.method === "GET") {
      if (!canBrowse) {
        return unauthorized(request);
      }

      const digest = await getTodayDigest(env.DB);
      return json(request, {
        generated_at: digest.generatedAt,
        groups: digest.groups,
        total: digest.total
      });
    }

    if (url.pathname === "/api/subscriptions" && request.method === "POST") {
      if (!canBrowse) {
        return unauthorized(request);
      }

      let body: Partial<{ email: string }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      try {
        const result = await createSubscription(env, body.email ?? "", request.url);
        return json(request, result);
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }

    if (url.pathname === "/api/auth/claim" && request.method === "POST") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      let body: Partial<{ email: string }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.email) {
        return json(request, { error: "Missing email" }, { status: 400 });
      }

      try {
        const result = await claimBoardWithEmail(env, body.email, request.url);
        return json(request, result);
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }

    if (url.pathname === "/api/auth/request-link" && request.method === "POST") {
      let body: Partial<{ email: string }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      try {
        const result = await requestOwnerSignIn(env, body.email ?? "", request.url);
        return json(request, result);
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }

    if (url.pathname === "/auth/verify" && request.method === "GET") {
      const token = url.searchParams.get("token") ?? "";
      try {
        const result = await verifyOwnerSession(env, token);
        if (!result) {
          return html(
            request,
            "Sign in failed",
            "<h1>This sign-in link is no longer valid</h1><p>Request a new link from your board if you still need access.</p>",
            400
          );
        }

        return redirect(request, "/", buildSessionCookie(result.sessionToken, request.url));
      } catch (error) {
        return html(
          request,
          "Sign in failed",
          `<h1>Could not create a session</h1><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`,
          400
        );
      }
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return json(request, { ok: true }, { headers: { "set-cookie": buildClearSessionCookie(request.url) } });
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      const me = await getMeResponse(env, request);
      if (!me) {
        return unauthorized(request);
      }

      return json(request, me);
    }

    if (url.pathname === "/api/me/jobs" && request.method === "GET") {
      const session = await getRequestIdentity(request, env);
      if (!session) {
        return unauthorized(request);
      }

      const status = (url.searchParams.get("status") ?? "") as JobUserStatus | "";
      const favoriteOnly = url.searchParams.get("favorite") === "1";
      const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "25", 10) || 25));
      const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
      return json(request, await listTrackedJobs(env.DB, session.user.id, { limit, offset, status, favoriteOnly }));
    }

    if (url.pathname.startsWith("/api/me/jobs/") && request.method === "PUT") {
      const session = await getRequestIdentity(request, env);
      if (!session) {
        return unauthorized(request);
      }

      const jobId = decodeURIComponent(url.pathname.replace("/api/me/jobs/", "").replace("/state", ""));
      let body: Partial<{ favorite: boolean; status: JobUserStatus; notes: string | null }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      if (
        body.status !== undefined &&
        !["saved", "applied", "interviewing", "offer", "rejected", "archived"].includes(body.status)
      ) {
        return json(request, { error: "Invalid job status" }, { status: 400 });
      }

      const updated = await saveJobState(env.DB, session.user.id, jobId, body);
      if (!updated) {
        return json(request, { error: "not_found" }, { status: 404 });
      }

      return json(request, updated);
    }

    if (url.pathname === "/api/me/profile" && request.method === "GET") {
      const session = await getRequestIdentity(request, env);
      if (!session) {
        return unauthorized(request);
      }

      return json(request, await getUserProfile(env.DB, session.user.id));
    }

    if (url.pathname === "/api/me/profile" && request.method === "PUT") {
      const session = await getRequestIdentity(request, env);
      if (!session) {
        return unauthorized(request);
      }

      let body: Partial<Record<string, string | null>>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      const updated = await saveUserProfile(env.DB, session.user.id, {
        full_name: typeof body.full_name === "string" ? body.full_name : undefined,
        email: typeof body.email === "string" ? body.email : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        location: typeof body.location === "string" ? body.location : undefined,
        linkedin_url: typeof body.linkedin_url === "string" ? body.linkedin_url : undefined,
        portfolio_url: typeof body.portfolio_url === "string" ? body.portfolio_url : undefined,
        resume_text: typeof body.resume_text === "string" ? body.resume_text : undefined
      });

      return json(request, updated);
    }

    if (url.pathname === "/api/me/resume" && request.method === "POST") {
      const session = await getRequestIdentity(request, env);
      if (!session) {
        return unauthorized(request);
      }

      try {
        const contentType = request.headers.get("content-type") ?? "";
        let fileName = "resume.pdf";
        let mimeType = "application/pdf";
        let bytes: Uint8Array | null = null;

        if (contentType.includes("multipart/form-data")) {
          const form = await request.formData();
          const fileValue = form.get("resume") ?? form.get("file");
          if (!(fileValue instanceof File)) {
            return json(request, { error: "Upload a PDF file in the resume field." }, { status: 400 });
          }

          fileName = fileValue.name || fileName;
          mimeType = fileValue.type || mimeType;
          bytes = new Uint8Array(await fileValue.arrayBuffer());
        } else {
          bytes = new Uint8Array(await request.arrayBuffer());
          fileName = request.headers.get("x-filename") ?? fileName;
          mimeType = contentType || mimeType;
        }

        if (!mimeType.includes("pdf") && !fileName.toLowerCase().endsWith(".pdf")) {
          return json(request, { error: "Only PDF resumes are supported." }, { status: 400 });
        }

        const result = await saveResume(env.DB, session.user.id, {
          fileName,
          mimeType,
          fileBytes: bytes
        });

        return json(request, result);
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }

    if (url.pathname === "/api/me/resume" && request.method === "DELETE") {
      const session = await getRequestIdentity(request, env);
      if (!session) {
        return unauthorized(request);
      }

      await deleteActiveResume(env.DB, session.user.id);
      return json(request, { ok: true });
    }

    if (url.pathname === "/api/admin/board-state" && request.method === "GET") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      const state = await getBoardAccessContext(request, env);
      return json(request, state.boardState);
    }

    if (url.pathname === "/api/admin/board-state" && request.method === "PUT") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      let body: Partial<{ visibility: "private" | "public" }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      if (body.visibility !== "private" && body.visibility !== "public") {
        return json(request, { error: "Invalid visibility" }, { status: 400 });
      }

      return json(request, await setBoardPublicState(env, body.visibility));
    }

    if (url.pathname === "/api/admin/run-crawl" && request.method === "POST") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      return json(request, await runCrawl(env, { trigger: "manual" }));
    }

    if (url.pathname === "/api/admin/notifications" && request.method === "GET") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      return json(request, await getAdminNotificationsInfo(env, request.url));
    }

    if (url.pathname === "/api/admin/notifications/test" && request.method === "POST") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      let body: Partial<{ email: string }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      try {
        return json(request, await sendAdminTestDigest(env, body.email ?? "", request.url));
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }

    if (url.pathname === "/api/admin/packs" && request.method === "GET") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      return json(request, { packs: listAdminPacks() });
    }

    if (url.pathname === "/api/admin/packs/apply" && request.method === "POST") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      let body: Partial<{ pack: string }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.pack || !isPackName(body.pack)) {
        return json(request, { error: "Invalid pack. Expected one of: product, engineering, design, gtm" }, { status: 400 });
      }

      try {
        return json(request, await applyPack(env.DB, body.pack));
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }

    if (url.pathname === "/api/admin/source-templates" && request.method === "GET") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      return json(request, { templates: listAdminSourceTemplates() });
    }

    if (url.pathname === "/api/admin/sources/validate" && request.method === "POST") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      let body: Partial<{ type: string; values: Record<string, string | boolean | undefined> }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.type || !body.values || typeof body.values !== "object") {
        return json(request, { error: "Expected type and values" }, { status: 400 });
      }

      try {
        return json(request, await validateSource(env, body.type, body.values));
      } catch (error) {
        return json(request, { error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }

    if (url.pathname === "/api/admin/runtime" && request.method === "GET") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      return json(request, await getAdminRuntimeInfo(env));
    }

    if (url.pathname === "/api/admin/runtime" && request.method === "PUT") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      let body: Partial<{ schedule: string }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      try {
        return json(request, await updateAdminRuntime(env, body));
      } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof error.status === "number"
          ? error.status
          : 400;
        return json(request, { error: error instanceof Error ? error.message : String(error) }, { status });
      }
    }

    if (url.pathname === "/api/admin/config" && request.method === "GET") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      return json(request, config);
    }

    if (url.pathname === "/api/admin/config" && request.method === "PUT") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      let body: Record<string, unknown>;
      try {
        body = await readJsonBody<Record<string, unknown>>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      const errors = validatePartialConfig(body);
      if (errors.length > 0) {
        return json(request, { error: "Validation failed", details: errors }, { status: 400 });
      }

      const updated = await saveConfigToDB(env.DB, body);
      setActiveConfig(updated);
      return json(request, updated);
    }

    if (url.pathname === "/api/admin/sources" && request.method === "GET") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      const result = await env.DB
        .prepare("SELECT id, type, name, base_url, config_json, enabled FROM sources ORDER BY name")
        .all<SourceRecord>();
      return json(request, { sources: result.results ?? [] });
    }

    if (url.pathname === "/api/admin/sources" && request.method === "POST") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      let body: { id: string; type: string; name: string; base_url: string; config_json: string; enabled?: boolean };
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      if (!body.id || !body.type || !body.name || !body.base_url) {
        return json(request, { error: "Missing required fields: id, type, name, base_url" }, { status: 400 });
      }

      await env.DB
        .prepare("INSERT INTO sources (id, type, name, base_url, config_json, enabled) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(body.id, body.type, body.name, body.base_url, body.config_json ?? "{}", body.enabled !== false ? 1 : 0)
        .run();

      return json(request, { ok: true, id: body.id }, { status: 201 });
    }

    if (url.pathname.startsWith("/api/admin/sources/") && request.method === "PUT") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      const sourceId = decodeURIComponent(url.pathname.replace("/api/admin/sources/", ""));
      let body: Partial<{ name: string; base_url: string; config_json: string; enabled: boolean }>;
      try {
        body = await readJsonBody<typeof body>(request);
      } catch {
        return json(request, { error: "Invalid JSON body" }, { status: 400 });
      }

      const sets: string[] = [];
      const binds: unknown[] = [];

      if (body.name !== undefined) { sets.push("name = ?"); binds.push(body.name); }
      if (body.base_url !== undefined) { sets.push("base_url = ?"); binds.push(body.base_url); }
      if (body.config_json !== undefined) { sets.push("config_json = ?"); binds.push(body.config_json); }
      if (body.enabled !== undefined) { sets.push("enabled = ?"); binds.push(body.enabled ? 1 : 0); }

      if (sets.length === 0) {
        return json(request, { error: "No fields to update" }, { status: 400 });
      }

      binds.push(sourceId);
      await env.DB
        .prepare(`UPDATE sources SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...binds)
        .run();

      return json(request, { ok: true, id: sourceId });
    }

    if (url.pathname.startsWith("/api/admin/sources/") && request.method === "DELETE") {
      if (!(await isAdminAuthorized(request, env))) {
        return unauthorized(request);
      }

      const sourceId = decodeURIComponent(url.pathname.replace("/api/admin/sources/", ""));
      await env.DB
        .prepare("DELETE FROM sources WHERE id = ?")
        .bind(sourceId)
        .run();

      return json(request, { ok: true, id: sourceId });
    }

    if (url.pathname === "/subscribe/confirm" && request.method === "GET") {
      return confirmSubscription(env, url.searchParams.get("token") ?? "");
    }

    if (url.pathname === "/subscribe/unsubscribe" && request.method === "GET") {
      return unsubscribeSubscription(env, url.searchParams.get("token") ?? "");
    }

    return json(request, { error: "not_found" }, { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const config = await loadConfigFromDB(env.DB);
    setActiveConfig(config);
    const summary = await runCrawl(env, { trigger: "scheduled" });
    await maybeSendScheduledDigest(env, summary);
  }
};
