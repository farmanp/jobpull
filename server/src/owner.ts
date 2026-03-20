import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ResumeStorage } from "./resumeStorage.ts";
import { canBrowseBoard, isEnabledFlag, resolveBoardVisibilityDefault, resolveMagicLinkDeliveryMode, type MagicLinkDeliveryMode } from "../../shared/ownerRuntime.ts";

type BoardVisibility = "private" | "public";
type OwnerStatus = "active" | "disabled";
type JobStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected" | "archived";

export interface OwnerEnv {
  DB: D1Database;
  ADMIN_TOKEN: string;
  SESSION_SECRET?: string;
  MAGIC_LINK_DELIVERY?: string;
  BOARD_VISIBILITY_DEFAULT?: string;
  ALLOW_UNCLAIMED_BROWSE?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  PUBLIC_BASE_URL?: string;
}

export interface BoardStateRow {
  id: string;
  owner_user_id: string | null;
  visibility: BoardVisibility;
  claimed_at: string | null;
  published_at: string | null;
}

export interface UserRow {
  id: string;
  email: string;
  status: OwnerStatus;
  created_at: string;
  last_seen_at: string | null;
}

export interface UserProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  resume_text: string | null;
  updated_at: string;
}

export interface UserResumeRow {
  id: string;
  user_id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  is_active: number;
}

export interface JobStateRow {
  user_id: string;
  job_id: string;
  favorite: number;
  status: JobStatus;
  notes: string;
  applied_at: string | null;
  rejected_at: string | null;
  updated_at: string;
}

export interface OwnerContext {
  boardState: BoardStateRow;
  sessionUser: UserRow | null;
  isOwner: boolean;
}

const OWNER_SESSION_COOKIE = "jobpull_owner_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function nowIso(): string {
  return new Date().toISOString();
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

function htmlResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomToken(): string {
  return randomBytes(24).toString("hex");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey || rest.length === 0) {
      continue;
    }
    if (rawKey === name) {
      return rest.join("=");
    }
  }

  return null;
}

function buildSessionToken(userId: string, expiresAt: string, secret: string): string {
  const payload = `${userId}|${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}|${signature}`;
}

function verifySessionToken(token: string, secret: string): { userId: string; expiresAt: string } | null {
  const parts = token.split("|");
  if (parts.length !== 3) {
    return null;
  }

  const [userId, expiresAt, signature] = parts;
  if (!userId || !expiresAt || !signature) {
    return null;
  }

  const payload = `${userId}|${expiresAt}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (expected.length !== signature.length) {
    return null;
  }

  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return null;
  }

  if (new Date(expiresAt).getTime() < Date.now()) {
    return null;
  }

  return { userId, expiresAt };
}

function buildSessionCookie(value: string, secure: boolean): string {
  return [
    `${OWNER_SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function buildClearingCookie(): string {
  return [
    `${OWNER_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}

function getBaseUrl(env: OwnerEnv, requestUrl?: string): string {
  if (env.PUBLIC_BASE_URL?.trim()) {
    return env.PUBLIC_BASE_URL.trim().replace(/\/+$/, "");
  }

  if (requestUrl) {
    return new URL(requestUrl).origin.replace(/\/+$/, "");
  }

  return "";
}

function buildAbsoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

function isEmailConfigured(env: OwnerEnv): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

function getMagicLinkDeliveryMode(env: OwnerEnv): MagicLinkDeliveryMode {
  return resolveMagicLinkDeliveryMode(env.MAGIC_LINK_DELIVERY, isEmailConfigured(env));
}

async function sendResendEmail(
  env: OwnerEnv,
  payload: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }
): Promise<void> {
  if (!isEmailConfigured(env)) {
    throw new Error("Email delivery is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      reply_to: env.EMAIL_REPLY_TO || undefined,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Email delivery failed with ${response.status}`);
  }
}

async function getBoardState(db: D1Database, env?: Pick<OwnerEnv, "BOARD_VISIBILITY_DEFAULT">): Promise<BoardStateRow> {
  const defaultVisibility = resolveBoardVisibilityDefault(env?.BOARD_VISIBILITY_DEFAULT);
  const row = await db
    .prepare(
      `SELECT id, owner_user_id, visibility, claimed_at, published_at
       FROM board_state
       WHERE id = 'singleton'`
    )
    .first<BoardStateRow>();

  if (row) {
    return row;
  }

  await db
    .prepare("INSERT OR IGNORE INTO board_state (id, visibility) VALUES ('singleton', ?)")
    .bind(defaultVisibility)
    .run();

  return (
    (await db
      .prepare(
        `SELECT id, owner_user_id, visibility, claimed_at, published_at
         FROM board_state
         WHERE id = 'singleton'`
      )
      .first<BoardStateRow>()) ?? {
      id: "singleton",
      owner_user_id: null,
      visibility: defaultVisibility,
      claimed_at: null,
      published_at: null
    }
  );
}

async function setBoardOwner(db: D1Database, userId: string, defaultVisibility: BoardVisibility): Promise<void> {
  const existing = await getBoardState(db, { BOARD_VISIBILITY_DEFAULT: defaultVisibility });
  const now = nowIso();
  await db
    .prepare(
      `UPDATE board_state
       SET owner_user_id = ?, claimed_at = COALESCE(claimed_at, ?), visibility = ?, published_at = CASE WHEN ? = 'public' THEN COALESCE(published_at, ?) ELSE NULL END
       WHERE id = 'singleton'`
    )
    .bind(userId, now, defaultVisibility, defaultVisibility, now)
    .run();

  if (!existing.owner_user_id) {
    await db
      .prepare("INSERT OR IGNORE INTO board_state (id, visibility, owner_user_id, claimed_at) VALUES ('singleton', ?, ?, ?)")
      .bind(defaultVisibility, userId, now)
      .run();
  }
}

async function clearBoardOwner(db: D1Database, defaultVisibility: BoardVisibility): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE board_state
       SET owner_user_id = NULL, claimed_at = NULL, visibility = ?, published_at = CASE WHEN ? = 'public' THEN COALESCE(published_at, ?) ELSE NULL END
       WHERE id = 'singleton'`
    )
    .bind(defaultVisibility, defaultVisibility, now)
    .run();
}

async function setBoardVisibility(db: D1Database, visibility: BoardVisibility): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE board_state
       SET visibility = ?, published_at = CASE WHEN ? = 'public' THEN COALESCE(published_at, ?) ELSE published_at END
       WHERE id = 'singleton'`
    )
    .bind(visibility, visibility, now)
    .run();
}

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT id, email, status, created_at, last_seen_at
       FROM users
       WHERE email = ?`
    )
    .bind(email)
    .first<UserRow>();
}

async function getUserById(db: D1Database, userId: string): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT id, email, status, created_at, last_seen_at
       FROM users
       WHERE id = ?`
    )
    .bind(userId)
    .first<UserRow>();
}

async function upsertUser(db: D1Database, email: string): Promise<UserRow> {
  const normalizedEmail = normalizeEmail(email);
  const existing = await getUserByEmail(db, normalizedEmail);
  const now = nowIso();

  if (existing) {
    await db
      .prepare("UPDATE users SET last_seen_at = ?, status = 'active' WHERE id = ?")
      .bind(now, existing.id)
      .run();
    return (await getUserById(db, existing.id)) ?? existing;
  }

  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, email, status, created_at, last_seen_at)
       VALUES (?, ?, 'active', ?, ?)`
    )
    .bind(id, normalizedEmail, now, now)
    .run();

  return (await getUserById(db, id)) as UserRow;
}

async function getMagicLinkToken(
  db: D1Database,
  params: {
    userId: string;
    purpose: string;
    ttlMinutes?: number;
  }
): Promise<{ token: string; tokenHash: string; expiresAt: string; rowId: string }> {
  const token = randomToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 60) * 60 * 1000).toISOString();
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO magic_links (
        id, user_id, purpose, token_hash, expires_at, used_at, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?)`
    )
    .bind(id, params.userId, params.purpose, tokenHash, expiresAt, nowIso())
    .run();

  return { token, tokenHash, expiresAt, rowId: id };
}

async function consumeMagicLink(db: D1Database, token: string): Promise<UserRow | null> {
  const tokenHash = sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT id, user_id, purpose, token_hash, expires_at, used_at, created_at
       FROM magic_links
       WHERE token_hash = ?`
    )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>();

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return null;
  }

  await db
    .prepare("UPDATE magic_links SET used_at = ? WHERE id = ?")
    .bind(nowIso(), row.id)
    .run();

  await db
    .prepare("UPDATE users SET last_seen_at = ?, status = 'active' WHERE id = ?")
    .bind(nowIso(), row.user_id)
    .run();

  return getUserById(db, row.user_id);
}

async function getSessionUser(request: Request, env: OwnerEnv): Promise<UserRow | null> {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret) {
    return null;
  }

  const token = getCookieValue(request, OWNER_SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const session = verifySessionToken(token, secret);
  if (!session) {
    return null;
  }

  return getUserById(env.DB, session.userId);
}

function createSessionValue(userId: string, secret: string): { value: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  return {
    value: buildSessionToken(userId, expiresAt, secret),
    expiresAt
  };
}

function parseJsonBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function buildVerifyEmail(baseUrl: string, verifyUrl: string): { subject: string; html: string; text: string } {
  return {
    subject: "Your jobpull sign-in link",
    html: `
      <p>Sign in to your job board.</p>
      <p><a href="${verifyUrl}">Open your sign-in link</a></p>
      <p>If the link does not work, paste this URL into your browser:</p>
      <p>${verifyUrl}</p>
    `.trim(),
    text: [
      "Sign in to your job board.",
      verifyUrl,
      "",
      `Base URL: ${baseUrl}`
    ].join("\n")
  };
}

function buildSuccessPage(title: string, message: string): Response {
  return htmlResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`
  );
}

async function deliverMagicLink(
  env: OwnerEnv,
  params: {
    email: string;
    verifyUrl: string;
    baseUrl: string;
  }
): Promise<{ signInUrl?: string; deliveryMode: MagicLinkDeliveryMode }> {
  const deliveryMode = getMagicLinkDeliveryMode(env);
  if (deliveryMode === "disabled") {
    throw new Error("Magic-link delivery is not configured. Set MAGIC_LINK_DELIVERY=console for local development or configure Resend.");
  }

  if (deliveryMode === "console") {
    console.info(`[jobpull] owner sign-in link for ${params.email}: ${params.verifyUrl}`);
    return {
      signInUrl: params.verifyUrl,
      deliveryMode
    };
  }

  const emailPayload = buildVerifyEmail(params.baseUrl, params.verifyUrl);
  await sendResendEmail(env, {
    to: params.email,
    ...emailPayload
  });

  return { deliveryMode };
}

export async function getOwnerContext(request: Request, env: OwnerEnv): Promise<OwnerContext> {
  const boardState = await getBoardState(env.DB, env);
  const sessionUser = await getSessionUser(request, env);
  const isOwner = Boolean(sessionUser && boardState.owner_user_id && sessionUser.id === boardState.owner_user_id);

  return { boardState, sessionUser: isOwner ? sessionUser : null, isOwner };
}

export function shouldGateAnonymousRequest(pathname: string): boolean {
  return (
    pathname === "/api/jobs" ||
    pathname.startsWith("/api/jobs/") ||
    pathname === "/api/stats" ||
    pathname === "/api/digest/today"
  );
}

export async function handleOwnerRoute(
  request: Request,
  env: OwnerEnv,
  storage: ResumeStorage
): Promise<Response | null> {
  const url = new URL(request.url);
  const context = await getOwnerContext(request, env);

  if (url.pathname === "/api/meta" && request.method === "GET") {
    const config = await env.DB
      .prepare("SELECT key, value FROM board_config")
      .all<{ key: string; value: string }>();
    const boardName = (config.results ?? []).find((row) => row.key === "boardName")?.value ?? "Job Board";
    const tagline = (config.results ?? []).find((row) => row.key === "tagline")?.value ?? "";
    const remoteOnlyValue = (config.results ?? []).find((row) => row.key === "remoteOnly")?.value;
    const boardConfig = {
      boardName,
      tagline,
      remoteOnly: remoteOnlyValue !== "false",
      focusCategories: []
    };

    const allowUnclaimedBrowse = isEnabledFlag(env.ALLOW_UNCLAIMED_BROWSE);
    const viewerCanBrowse = canBrowseBoard({
      visibility: context.boardState.visibility,
      claimed: Boolean(context.boardState.owner_user_id),
      isOwner: context.isOwner,
      allowUnclaimedBrowse
    });

    return jsonResponse({
      ...boardConfig,
      visibility: context.boardState.visibility,
      claimed: Boolean(context.boardState.owner_user_id),
      ownerSignedIn: context.isOwner,
      viewerIsOwner: context.isOwner,
      viewerCanBrowse,
      auth: {
        claimRequired: !allowUnclaimedBrowse,
        magicLinkDelivery: getMagicLinkDeliveryMode(env)
      }
    });
  }

  if (url.pathname === "/api/auth/claim" && request.method === "POST") {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, { status: 401 });
    }

    if (!env.SESSION_SECRET?.trim()) {
      return jsonResponse({ error: "SESSION_SECRET is not configured on this server." }, { status: 500 });
    }

    if (context.boardState.owner_user_id) {
      return jsonResponse({ error: "board already claimed" }, { status: 409 });
    }

    let body: { email?: string };
    try {
      body = await parseJsonBody<typeof body>(request);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = normalizeEmail(body.email ?? "");
    if (!isValidEmail(email)) {
      return jsonResponse({ error: "Enter a valid email address." }, { status: 400 });
    }

    const user = await upsertUser(env.DB, email);

    const { token: magicToken } = await getMagicLinkToken(env.DB, {
      userId: user.id,
      purpose: "claim"
    });

    const baseUrl = getBaseUrl(env, request.url);
    const verifyUrl = buildAbsoluteUrl(baseUrl, "/auth/verify?token=" + encodeURIComponent(magicToken));
    const defaultVisibility = resolveBoardVisibilityDefault(env.BOARD_VISIBILITY_DEFAULT);
    await setBoardOwner(env.DB, user.id, defaultVisibility);

    try {
      const delivery = await deliverMagicLink(env, {
        email,
        verifyUrl,
        baseUrl
      });

      return jsonResponse({
        ok: true,
        claimed: true,
        email,
        message: delivery.signInUrl
          ? "Claim accepted. Open the local sign-in link to finish setup."
          : "Claim accepted. Check your email for the sign-in link.",
        signInUrl: delivery.signInUrl
      });
    } catch (error) {
      await clearBoardOwner(env.DB, defaultVisibility);
      return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
    }
  }

  if (url.pathname === "/api/auth/request-link" && request.method === "POST") {
    if (!env.SESSION_SECRET?.trim()) {
      return jsonResponse({ error: "SESSION_SECRET is not configured on this server." }, { status: 500 });
    }

    if (!context.boardState.owner_user_id) {
      return jsonResponse({ error: "board is not claimed yet" }, { status: 409 });
    }

    let body: { email?: string };
    try {
      body = await parseJsonBody<typeof body>(request);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = normalizeEmail(body.email ?? "");
    if (!isValidEmail(email)) {
      return jsonResponse({ error: "Enter a valid email address." }, { status: 400 });
    }

    const owner = context.boardState.owner_user_id ? await getUserById(env.DB, context.boardState.owner_user_id) : null;
    if (!owner || owner.email !== email) {
      return jsonResponse({ error: "Use the owner email for this board." }, { status: 403 });
    }

    const { token: magicToken } = await getMagicLinkToken(env.DB, {
      userId: owner.id,
      purpose: "sign_in"
    });

    const baseUrl = getBaseUrl(env, request.url);
    const verifyUrl = buildAbsoluteUrl(baseUrl, "/auth/verify?token=" + encodeURIComponent(magicToken));
    const delivery = await deliverMagicLink(env, {
      email: owner.email,
      verifyUrl,
      baseUrl
    });

    return jsonResponse({
      ok: true,
      message: delivery.signInUrl
        ? "Sign-in link generated locally."
        : "Sign-in link sent.",
      signInUrl: delivery.signInUrl
    });
  }

  if (url.pathname === "/auth/verify" && request.method === "GET") {
    const token = url.searchParams.get("token") ?? "";
    if (!token) {
      return buildSuccessPage("Sign-in failed", "No sign-in token was provided.");
    }

    const user = await consumeMagicLink(env.DB, token);
    if (!user) {
      return buildSuccessPage("Sign-in failed", "That sign-in link is invalid or expired.");
    }

    const secret = env.SESSION_SECRET?.trim();
    if (!secret) {
      return buildSuccessPage("Sign-in failed", "SESSION_SECRET is not configured on this server.");
    }

    const session = createSessionValue(user.id, secret);
    const secure = new URL(request.url).protocol === "https:";
    return new Response(null, {
      status: 302,
      headers: {
        "set-cookie": buildSessionCookie(session.value, secure),
        "cache-control": "no-store",
        location: "/"
      }
    });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return jsonResponse(
      { ok: true },
      {
        headers: {
          "set-cookie": buildClearingCookie()
        }
      }
    );
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    return jsonResponse({
      authenticated: Boolean(context.isOwner),
      board: {
        visibility: context.boardState.visibility,
        claimed: Boolean(context.boardState.owner_user_id),
        ownerSignedIn: context.isOwner
      },
      user: context.sessionUser
        ? {
            id: context.sessionUser.id,
            email: context.sessionUser.email,
            lastSeenAt: context.sessionUser.last_seen_at
          }
        : null
    });
  }

  if (!context.isOwner && (url.pathname.startsWith("/api/me/") || url.pathname === "/api/me")) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  if (url.pathname === "/api/me/profile" && request.method === "GET") {
    const profile = await env.DB
      .prepare(
        `SELECT user_id, full_name, email, phone, location, linkedin_url, portfolio_url, resume_text, updated_at
         FROM user_profiles
         WHERE user_id = ?`
      )
      .bind(context.sessionUser?.id)
      .first<UserProfileRow>();

    return jsonResponse(
      profile ?? {
        user_id: context.sessionUser?.id ?? "",
        full_name: null,
        email: context.sessionUser?.email ?? null,
        phone: null,
        location: null,
        linkedin_url: null,
        portfolio_url: null,
        resume_text: null,
        updated_at: nowIso()
      }
    );
  }

  if (url.pathname === "/api/me/profile" && request.method === "PUT") {
    let body: Partial<UserProfileRow>;
    try {
      body = await parseJsonBody<typeof body>(request);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
    }

    const updatedAt = nowIso();
    await env.DB
      .prepare(
        `INSERT INTO user_profiles (
          user_id, full_name, email, phone, location, linkedin_url, portfolio_url, resume_text, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
          full_name = excluded.full_name,
          email = excluded.email,
          phone = excluded.phone,
          location = excluded.location,
          linkedin_url = excluded.linkedin_url,
          portfolio_url = excluded.portfolio_url,
          resume_text = excluded.resume_text,
          updated_at = excluded.updated_at`
      )
      .bind(
        context.sessionUser?.id,
        body.full_name ?? null,
        body.email ?? context.sessionUser?.email ?? null,
        body.phone ?? null,
        body.location ?? null,
        body.linkedin_url ?? null,
        body.portfolio_url ?? null,
        body.resume_text ?? null,
        updatedAt
      )
      .run();

    const profile = await env.DB
      .prepare(
        `SELECT user_id, full_name, email, phone, location, linkedin_url, portfolio_url, resume_text, updated_at
         FROM user_profiles
         WHERE user_id = ?`
      )
      .bind(context.sessionUser?.id)
      .first<UserProfileRow>();

    return jsonResponse(profile);
  }

  if (url.pathname === "/api/me/jobs" && request.method === "GET") {
    const result = await env.DB
      .prepare(
        `SELECT
          j.id,
          j.title,
          j.company,
          j.location,
          j.remote_status,
          j.url,
          j.source,
          j.date_posted,
          j.date_seen,
          j.description,
          j.tags,
          j.pm_focus,
          COALESCE(s.favorite, 0) AS favorite,
          COALESCE(s.status, 'saved') AS status,
          COALESCE(s.notes, '') AS notes,
          s.applied_at,
          s.rejected_at,
          s.updated_at
         FROM job_user_states s
         INNER JOIN jobs j ON j.id = s.job_id
         WHERE s.user_id = ?
         ORDER BY s.updated_at DESC, j.date_seen DESC`
      )
      .bind(context.sessionUser?.id)
      .all<Record<string, unknown>>();

    return jsonResponse({
      items: (result.results ?? []).map((row) => ({
        ...row,
        tags: typeof row.tags === "string" ? JSON.parse(row.tags) : []
      }))
    });
  }

  if (url.pathname.startsWith("/api/me/jobs/") && url.pathname.endsWith("/state") && request.method === "PUT") {
    const jobId = decodeURIComponent(url.pathname.replace("/api/me/jobs/", "").replace("/state", ""));
    let body: Partial<{ favorite: boolean; status: JobStatus; notes: string }>;
    try {
      body = await parseJsonBody<typeof body>(request);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
    }

    const status = body.status ?? "saved";
    const allowedStatuses: JobStatus[] = ["saved", "applied", "interviewing", "offer", "rejected", "archived"];
    if (!allowedStatuses.includes(status)) {
      return jsonResponse({ error: "Invalid status" }, { status: 400 });
    }

    const now = nowIso();
    const existing = await env.DB
      .prepare(
        `SELECT user_id, job_id, favorite, status, notes, applied_at, rejected_at, updated_at
         FROM job_user_states
         WHERE user_id = ? AND job_id = ?`
      )
      .bind(context.sessionUser?.id, jobId)
      .first<JobStateRow>();

    const appliedAt = status === "applied" ? existing?.applied_at ?? now : existing?.applied_at ?? null;
    const rejectedAt = status === "rejected" ? existing?.rejected_at ?? now : existing?.rejected_at ?? null;

    await env.DB
      .prepare(
        `INSERT INTO job_user_states (
          user_id, job_id, favorite, status, notes, applied_at, rejected_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, job_id) DO UPDATE SET
          favorite = excluded.favorite,
          status = excluded.status,
          notes = excluded.notes,
          applied_at = excluded.applied_at,
          rejected_at = excluded.rejected_at,
          updated_at = excluded.updated_at`
      )
      .bind(
        context.sessionUser?.id,
        jobId,
        body.favorite ? 1 : 0,
        status,
        body.notes ?? existing?.notes ?? "",
        appliedAt,
        rejectedAt,
        now
      )
      .run();

    const saved = await env.DB
      .prepare(
        `SELECT user_id, job_id, favorite, status, notes, applied_at, rejected_at, updated_at
         FROM job_user_states
         WHERE user_id = ? AND job_id = ?`
      )
      .bind(context.sessionUser?.id, jobId)
      .first<JobStateRow>();

    return jsonResponse(saved);
  }

  if (url.pathname === "/api/me/resume" && request.method === "POST") {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonResponse({ error: "Upload a PDF resume file." }, { status: 400 });
    }
    const fileEntry = formData.get("resume") ?? formData.get("file");
    if (!(fileEntry instanceof File)) {
      return jsonResponse({ error: "Upload a PDF resume file." }, { status: 400 });
    }

    if (fileEntry.type !== "application/pdf" && !fileEntry.name.toLowerCase().endsWith(".pdf")) {
      return jsonResponse({ error: "Only PDF resumes are supported in this version." }, { status: 400 });
    }

    const bytes = new Uint8Array(await fileEntry.arrayBuffer());
    const resumeId = randomUUID();
    const { storageKey } = await storage.save({
      userId: context.sessionUser?.id ?? "",
      resumeId,
      filename: fileEntry.name || "resume.pdf",
      data: bytes
    });

    await env.DB
      .prepare("UPDATE user_resumes SET is_active = 0 WHERE user_id = ?")
      .bind(context.sessionUser?.id)
      .run();

    await env.DB
      .prepare(
        `INSERT INTO user_resumes (
          id, user_id, storage_key, file_name, mime_type, size_bytes, file_blob, resume_text, uploaded_at, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .bind(
        resumeId,
        context.sessionUser?.id,
        storageKey,
        fileEntry.name || "resume.pdf",
        fileEntry.type || "application/pdf",
        bytes.length,
        bytes,
        null,
        nowIso()
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO user_profiles (
          user_id, full_name, email, phone, location, linkedin_url, portfolio_url, resume_text, updated_at
        ) VALUES (?, NULL, ?, NULL, NULL, NULL, NULL, NULL, ?)
         ON CONFLICT(user_id) DO UPDATE SET
          email = COALESCE(excluded.email, user_profiles.email),
          updated_at = excluded.updated_at`
      )
      .bind(
        context.sessionUser?.id,
        context.sessionUser?.email ?? null,
        nowIso()
      )
      .run();

    return jsonResponse({
      ok: true,
      resume: {
        id: resumeId,
        storageKey,
        filename: fileEntry.name || "resume.pdf",
        mimeType: fileEntry.type || "application/pdf",
        sizeBytes: bytes.length
      }
    });
  }

  if (url.pathname === "/api/me/resume" && request.method === "DELETE") {
    const resumes = await env.DB
      .prepare(
        `SELECT id, user_id, storage_key, file_name AS filename, mime_type, size_bytes, uploaded_at, is_active
         FROM user_resumes
         WHERE user_id = ? AND is_active = 1`
      )
      .bind(context.sessionUser?.id)
      .all<UserResumeRow>();

    for (const resume of resumes.results ?? []) {
      await storage.delete(resume.storage_key);
      await env.DB
        .prepare("DELETE FROM user_resumes WHERE id = ?")
        .bind(resume.id)
        .run();
    }

    return jsonResponse({ ok: true });
  }

  return null;
}

export async function getOwnerAccessContext(request: Request, env: OwnerEnv): Promise<OwnerContext> {
  return getOwnerContext(request, env);
}

export async function applyOwnerSessionToRequest(request: Request, env: OwnerEnv): Promise<Request> {
  const context = await getOwnerContext(request, env);
  if (!context.isOwner) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${env.ADMIN_TOKEN}`);
  return new Request(request, { headers });
}

export function buildUnauthenticatedBoardResponse(): Response {
  return jsonResponse(
    {
      error: "private_board",
      message: "This board is private. Sign in as the owner to continue."
    },
    { status: 403 }
  );
}
