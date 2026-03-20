import { loadConfigFromDB } from "./config";
import { buildPublicUrl, escapeHtml, resolvePublicBaseUrl, sendResendEmail } from "./email";
import { claimBoard, clearBoardClaim, getBoardStateWithDefaults, isBoardClaimed, setBoardVisibility } from "./boardState";
import { createSignedSessionToken, getSessionTokenFromRequest, verifySignedSessionToken } from "./session";
import { sha256Hex } from "./lib/hash";
import { canBrowseBoard, isEnabledFlag, resolveMagicLinkDeliveryMode, type MagicLinkDeliveryMode } from "../../shared/ownerRuntime";
import type {
  BoardStateRecord,
  Env,
  JobUserStatus,
  JobUserStateRecord,
  MagicLinkRecord,
  UserProfileRecord,
  UserRecord,
  UserResumeRecord
} from "./types";
import { extractResumeText, parseResumeProfile } from "./resume";

type OwnerSession = {
  user: UserRecord;
  boardState: BoardStateRecord;
};

type MagicLinkResult = {
  signInUrl?: string;
  deliveryMode: MagicLinkDeliveryMode;
};

type OwnerMeResponse = {
  user: {
    id: string;
    email: string;
    status: string;
    lastSeenAt: string | null;
  };
  boardState: BoardStateRecord;
  profile: UserProfileRecord;
  resume: ResumeSummary | null;
};

export type ResumeSummary = Pick<UserResumeRecord, "id" | "file_name" | "mime_type" | "size_bytes" | "uploaded_at" | "is_active" | "storage_key" | "resume_text">;

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

function uuid(): string {
  return crypto.randomUUID();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

async function createMagicLinkToken(userId: string, purpose: string): Promise<{ token: string; tokenHash: string; expiresAt: string }> {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_SECONDS * 1000).toISOString();

  return { token, tokenHash, expiresAt };
}

async function sendMagicLinkEmail(
  env: Env,
  params: {
    email: string;
    token: string;
    purpose: "claim" | "sign_in";
    requestUrl?: string;
  }
): Promise<MagicLinkResult> {
  const config = await loadConfigFromDB(env.DB);
  const baseUrl = resolvePublicBaseUrl(env, params.requestUrl);
  if (!baseUrl) {
    throw new Error("Public URL is not configured for owner sign-in.");
  }

  const signInUrl = buildPublicUrl(baseUrl, "/auth/verify", params.token);
  const deliveryMode = resolveMagicLinkDeliveryMode(
    env.MAGIC_LINK_DELIVERY,
    Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
  );
  if (deliveryMode === "disabled") {
    throw new Error("Magic-link delivery is not configured. Set MAGIC_LINK_DELIVERY=console for local development or configure Resend.");
  }

  const subject = params.purpose === "claim"
    ? `Claim your ${config.boardName} board`
    : `Sign in to ${config.boardName}`;

  if (deliveryMode === "console") {
    console.info(`[jobpull] ${params.purpose} sign-in link for ${params.email}: ${signInUrl}`);
    return { signInUrl, deliveryMode };
  }

  await sendResendEmail(env, {
    to: params.email,
    subject,
    html: `
      <div style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8f7;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;padding:32px;">
          <div style="margin-bottom:12px;color:#00c805;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(config.boardName)}</div>
          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.1;">${params.purpose === "claim" ? "Claim your board" : "Sign in"}</h1>
          <p style="margin:0 0 20px;color:#4b5563;line-height:1.65;">Use this link to access your personal job board and admin controls.</p>
          <a href="${escapeHtml(signInUrl)}" style="display:inline-flex;align-items:center;padding:12px 18px;border-radius:999px;background:#00c805;color:#ffffff;text-decoration:none;font-weight:700;">Open jobpull</a>
        </div>
      </div>
    `,
    text: `${params.purpose === "claim" ? "Claim your board" : "Sign in"}:\n\n${signInUrl}`
  }, `owner-${params.purpose}-${params.email}`);

  return { deliveryMode };
}

async function getUserById(db: D1Database, userId: string): Promise<UserRecord | null> {
  return db
    .prepare(
      `SELECT id, email, status, created_at, last_seen_at
       FROM users
       WHERE id = ?`
    )
    .bind(userId)
    .first<UserRecord>();
}

async function getUserByEmail(db: D1Database, email: string): Promise<UserRecord | null> {
  return db
    .prepare(
      `SELECT id, email, status, created_at, last_seen_at
       FROM users
       WHERE email = ?`
    )
    .bind(email)
    .first<UserRecord>();
}

async function ensureOwnerUser(db: D1Database, email: string): Promise<UserRecord> {
  const normalizedEmail = normalizeEmail(email);
  const existing = await getUserByEmail(db, normalizedEmail);
  const now = nowIso();

  if (existing) {
    await db
      .prepare(
        `UPDATE users
         SET status = 'owner', last_seen_at = ?
         WHERE id = ?`
      )
      .bind(now, existing.id)
      .run();
    return (await getUserById(db, existing.id)) ?? existing;
  }

  const user: UserRecord = {
    id: uuid(),
    email: normalizedEmail,
    status: "owner",
    created_at: now,
    last_seen_at: now
  };

  await db
    .prepare(
      `INSERT INTO users (id, email, status, created_at, last_seen_at)
       VALUES (?, ?, 'owner', ?, ?)`
    )
    .bind(user.id, user.email, user.created_at, user.last_seen_at)
    .run();

  return user;
}

async function createMagicLink(
  db: D1Database,
  userId: string,
  purpose: "claim" | "sign_in"
): Promise<{ token: string; tokenHash: string }> {
  const { token, tokenHash, expiresAt } = await createMagicLinkToken(userId, purpose);
  await db
    .prepare(
      `INSERT INTO magic_links (
        id, user_id, purpose, token_hash, expires_at, used_at, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?)`
    )
    .bind(uuid(), userId, purpose, tokenHash, expiresAt, nowIso())
    .run();
  return { token, tokenHash };
}

async function findMagicLinkByTokenHash(db: D1Database, tokenHash: string): Promise<MagicLinkRecord | null> {
  return db
    .prepare(
      `SELECT id, user_id, purpose, token_hash, expires_at, used_at, created_at
       FROM magic_links
       WHERE token_hash = ?`
    )
    .bind(tokenHash)
    .first<MagicLinkRecord>();
}

async function getValidOwnerSession(request: Request, env: Env): Promise<OwnerSession | null> {
  if (!env.SESSION_SECRET?.trim()) {
    return null;
  }

  const token = getSessionTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const claims = await verifySignedSessionToken(token, env.SESSION_SECRET);
  if (!claims) {
    return null;
  }

  const boardState = await getBoardStateWithDefaults(env.DB, env);
  if (!boardState.owner_user_id || boardState.owner_user_id !== claims.userId) {
    return null;
  }

  const user = await getUserById(env.DB, claims.userId);
  if (!user || normalizeEmail(user.email) !== normalizeEmail(claims.email)) {
    return null;
  }

  return { user, boardState };
}

export async function getRequestIdentity(request: Request, env: Env): Promise<OwnerSession | null> {
  return getValidOwnerSession(request, env);
}

export async function isAdminAuthorized(request: Request, env: Env): Promise<boolean> {
  if (await getValidOwnerSession(request, env)) {
    return true;
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return Boolean(env.ADMIN_TOKEN) && token === env.ADMIN_TOKEN;
}

export async function requireOwnerSession(request: Request, env: Env): Promise<OwnerSession | null> {
  return getValidOwnerSession(request, env);
}

export async function getBoardAccessContext(request: Request, env: Env): Promise<{
  boardState: BoardStateRecord;
  ownerSession: OwnerSession | null;
}> {
  const [boardState, ownerSession] = await Promise.all([
    getBoardStateWithDefaults(env.DB, env),
    getValidOwnerSession(request, env)
  ]);

  return { boardState, ownerSession };
}

export async function claimBoardWithEmail(
  env: Env,
  email: string,
  requestUrl?: string
): Promise<{ boardState: BoardStateRecord; user: UserRecord; message: string; signInUrl?: string }> {
  const boardState = await getBoardStateWithDefaults(env.DB, env);
  if (boardState.owner_user_id) {
    throw new Error("This board has already been claimed.");
  }

  if (!env.SESSION_SECRET?.trim()) {
    throw new Error("SESSION_SECRET is missing.");
  }

  const user = await ensureOwnerUser(env.DB, email);
  const { token } = await createMagicLink(env.DB, user.id, "claim");
  const updatedState = await claimBoard(env.DB, user.id, env);

  try {
    const delivery = await sendMagicLinkEmail(env, { email: user.email, token, purpose: "claim", requestUrl });
    return {
      boardState: updatedState,
      user,
      message: delivery.signInUrl
        ? "Claim started. Open the local sign-in link to finish setup."
        : "Claim started. Check your inbox to finish owner sign-in.",
      signInUrl: delivery.signInUrl
    };
  } catch (error) {
    await clearBoardClaim(env.DB, env);
    throw error;
  }
}

export async function requestOwnerSignIn(
  env: Env,
  email: string,
  requestUrl?: string
): Promise<{ ok: true; message: string; signInUrl?: string }> {
  const boardState = await getBoardStateWithDefaults(env.DB, env);
  if (!boardState.owner_user_id) {
    throw new Error("This board has not been claimed yet.");
  }

  const owner = await getUserById(env.DB, boardState.owner_user_id);
  const normalizedEmail = normalizeEmail(email);
  if (!owner || normalizeEmail(owner.email) !== normalizedEmail) {
    return {
      ok: true,
      message: "If that address owns this board, a sign-in link has been sent."
    };
  }

  const { token } = await createMagicLink(env.DB, owner.id, "sign_in");
  const delivery = await sendMagicLinkEmail(env, { email: owner.email, token, purpose: "sign_in", requestUrl });

  return {
    ok: true,
    message: delivery.signInUrl
      ? "If that address owns this board, a local sign-in link is ready."
      : "If that address owns this board, a sign-in link has been sent.",
    signInUrl: delivery.signInUrl
  };
}

export async function verifyOwnerSession(
  env: Env,
  token: string
): Promise<{ user: UserRecord; sessionToken: string } | null> {
  if (!env.SESSION_SECRET?.trim()) {
    throw new Error("SESSION_SECRET is missing.");
  }

  const tokenHash = await hashToken(token);
  const magicLink = await findMagicLinkByTokenHash(env.DB, tokenHash);
  if (!magicLink || magicLink.used_at || Date.parse(magicLink.expires_at) < Date.now()) {
    return null;
  }

  const boardState = await getBoardStateWithDefaults(env.DB, env);
  const user = await getUserById(env.DB, magicLink.user_id);
  if (!user || !boardState.owner_user_id || boardState.owner_user_id !== user.id) {
    return null;
  }

  const now = nowIso();
  await env.DB
    .prepare(
      `UPDATE magic_links
       SET used_at = ?
       WHERE id = ?`
    )
    .bind(now, magicLink.id)
    .run();

  await env.DB
    .prepare(
      `UPDATE users
       SET last_seen_at = ?
       WHERE id = ?`
    )
    .bind(now, user.id)
    .run();

  const sessionToken = await createSignedSessionToken(
    {
      userId: user.id,
      email: user.email,
      role: "owner",
      exp: Math.floor((Date.now() + SESSION_TTL_SECONDS * 1000) / 1000)
    },
    env.SESSION_SECRET
  );

  return { user: { ...user, last_seen_at: now }, sessionToken };
}

export async function getMeResponse(env: Env, request: Request): Promise<OwnerMeResponse | null> {
  const session = await getValidOwnerSession(request, env);
  if (!session) {
    return null;
  }

  const profile = await getUserProfile(env.DB, session.user.id);
  const resume = await getActiveResumeSummary(env.DB, session.user.id);

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      status: session.user.status,
      lastSeenAt: session.user.last_seen_at
    },
    boardState: session.boardState,
    profile,
    resume
  };
}

export async function getUserProfile(db: D1Database, userId: string): Promise<UserProfileRecord> {
  const row = await db
    .prepare(
      `SELECT user_id, full_name, email, phone, location, linkedin_url, portfolio_url, resume_text, updated_at
       FROM user_profiles
       WHERE user_id = ?`
    )
    .bind(userId)
    .first<UserProfileRecord>();

  if (row) {
    return row;
  }

  const user = await getUserById(db, userId);
  return {
    user_id: userId,
    full_name: null,
    email: user?.email ?? null,
    phone: null,
    location: null,
    linkedin_url: null,
    portfolio_url: null,
    resume_text: null,
    updated_at: nowIso()
  };
}

export async function saveUserProfile(
  db: D1Database,
  userId: string,
  patch: Partial<Omit<UserProfileRecord, "user_id" | "updated_at">>
): Promise<UserProfileRecord> {
  const current = await getUserProfile(db, userId);
  const next: UserProfileRecord = {
    ...current,
    ...patch,
    user_id: userId,
    updated_at: nowIso()
  };

  if (patch.full_name === undefined) next.full_name = current.full_name;
  if (patch.email === undefined) next.email = current.email;
  if (patch.phone === undefined) next.phone = current.phone;
  if (patch.location === undefined) next.location = current.location;
  if (patch.linkedin_url === undefined) next.linkedin_url = current.linkedin_url;
  if (patch.portfolio_url === undefined) next.portfolio_url = current.portfolio_url;
  if (patch.resume_text === undefined) next.resume_text = current.resume_text;

  await db
    .prepare(
      `INSERT OR REPLACE INTO user_profiles (
        user_id, full_name, email, phone, location, linkedin_url, portfolio_url, resume_text, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      next.user_id,
      next.full_name,
      next.email,
      next.phone,
      next.location,
      next.linkedin_url,
      next.portfolio_url,
      next.resume_text,
      next.updated_at
    )
    .run();

  return next;
}

export async function listTrackedJobs(
  db: D1Database,
  userId: string,
  params: { limit: number; offset: number; status?: JobUserStatus | ""; favoriteOnly?: boolean }
): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
  const where: string[] = ["job_user_states.user_id = ?"];
  const binds: unknown[] = [userId];

  if (params.status) {
    where.push("job_user_states.status = ?");
    binds.push(params.status);
  }

  if (params.favoriteOnly) {
    where.push("job_user_states.favorite = 1");
  }

  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) as total
       FROM job_user_states
       WHERE ${where.join(" AND ")}`
    )
    .bind(...binds)
    .first<{ total: number }>();

  const result = await db
    .prepare(
      `SELECT
        jobs.id, jobs.title, jobs.company, jobs.location, jobs.remote_status, jobs.url, jobs.source,
        jobs.date_posted, jobs.date_seen, jobs.description, jobs.tags, jobs.pm_focus, jobs.is_stale,
        job_user_states.favorite, job_user_states.status as user_status, job_user_states.notes,
        job_user_states.applied_at, job_user_states.rejected_at, job_user_states.updated_at
       FROM job_user_states
       JOIN jobs ON jobs.id = job_user_states.job_id
       WHERE ${where.join(" AND ")}
       ORDER BY job_user_states.updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...binds, params.limit, params.offset)
    .all<Record<string, unknown>>();

  return {
    items: (result.results ?? []).map((row) => ({
      ...row,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : [],
      state: {
        favorite: Boolean(row.favorite),
        status: row.user_status,
        notes: row.notes,
        applied_at: row.applied_at,
        rejected_at: row.rejected_at,
        updated_at: row.updated_at
      }
    })),
    total: totalRow?.total ?? 0
  };
}

export async function saveJobState(
  db: D1Database,
  userId: string,
  jobId: string,
  patch: Partial<{ favorite: boolean; status: JobUserStatus; notes: string | null }>
): Promise<Record<string, unknown> | null> {
  const currentJob = await db
    .prepare(
      `SELECT id, title, company, location, remote_status, url, source, date_posted, date_seen, description, tags, pm_focus, is_stale
       FROM jobs
       WHERE id = ?`
    )
    .bind(jobId)
    .first<Record<string, unknown>>();

  if (!currentJob) {
    return null;
  }

  const now = nowIso();
  const currentState = await db
    .prepare(
      `SELECT user_id, job_id, favorite, status, notes, applied_at, rejected_at, updated_at
       FROM job_user_states
       WHERE user_id = ? AND job_id = ?`
    )
    .bind(userId, jobId)
    .first<JobUserStateRecord>();

  const nextFavorite = patch.favorite !== undefined ? patch.favorite : Boolean(currentState?.favorite);
  const nextStatus = patch.status ?? currentState?.status ?? "saved";
  const nextNotes = patch.notes !== undefined ? patch.notes : currentState?.notes ?? null;
  const nextAppliedAt = nextStatus === "applied" ? (currentState?.applied_at ?? now) : currentState?.applied_at ?? null;
  const nextRejectedAt = nextStatus === "rejected" ? (currentState?.rejected_at ?? now) : currentState?.rejected_at ?? null;

  await db
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
    .bind(userId, jobId, nextFavorite ? 1 : 0, nextStatus, nextNotes, nextAppliedAt, nextRejectedAt, now)
    .run();

  return {
    ...currentJob,
    tags: typeof currentJob.tags === "string" ? JSON.parse(currentJob.tags as string) : [],
    state: {
      favorite: nextFavorite,
      status: nextStatus,
      notes: nextNotes,
      applied_at: nextAppliedAt,
      rejected_at: nextRejectedAt,
      updated_at: now
    }
  };
}

export async function getActiveResumeSummary(db: D1Database, userId: string): Promise<ResumeSummary | null> {
  const row = await db
    .prepare(
      `SELECT id, user_id, storage_key, file_name, mime_type, size_bytes, file_blob, resume_text, uploaded_at, is_active
       FROM user_resumes
       WHERE user_id = ? AND is_active = 1
       ORDER BY uploaded_at DESC
       LIMIT 1`
    )
    .bind(userId)
    .first<UserResumeRecord>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    storage_key: row.storage_key,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    resume_text: row.resume_text,
    uploaded_at: row.uploaded_at,
    is_active: row.is_active
  };
}

export async function saveResume(
  db: D1Database,
  userId: string,
  input: {
    fileName: string;
    mimeType: string;
    fileBytes: Uint8Array;
  }
): Promise<{ resume: ResumeSummary; profile: UserProfileRecord }> {
  const now = nowIso();
  const storageKey = `resume-${userId}-${Date.now()}`;
  const text = extractResumeText(input.fileBytes);
  const parsed = parseResumeProfile(text);

  await db
    .prepare(
      `UPDATE user_resumes
       SET is_active = 0
       WHERE user_id = ? AND is_active = 1`
    )
    .bind(userId)
    .run();

  const id = uuid();
  await db
    .prepare(
      `INSERT INTO user_resumes (
        id, user_id, storage_key, file_name, mime_type, size_bytes, file_blob, resume_text, uploaded_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .bind(
      id,
      userId,
      storageKey,
      input.fileName,
      input.mimeType,
      input.fileBytes.byteLength,
      input.fileBytes,
      text || null,
      now
    )
    .run();

  const profile = await saveUserProfile(db, userId, {
    email: parsed.email ?? (await getUserById(db, userId))?.email ?? null,
    full_name: parsed.fullName ?? null,
    phone: parsed.phone ?? null,
    location: parsed.location ?? null,
    linkedin_url: parsed.linkedinUrl ?? null,
    portfolio_url: parsed.portfolioUrl ?? null,
    resume_text: text || null
  });

  return {
    resume: {
      id,
      storage_key: storageKey,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.fileBytes.byteLength,
      resume_text: text || null,
      uploaded_at: now,
      is_active: 1
    },
    profile
  };
}

export async function deleteActiveResume(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE user_resumes
       SET is_active = 0
       WHERE user_id = ? AND is_active = 1`
    )
    .bind(userId)
    .run();
}

export async function getOwnerSummary(env: Env, request: Request): Promise<{
  session: OwnerSession;
  boardState: BoardStateRecord;
  config: Awaited<ReturnType<typeof loadConfigFromDB>>;
}> {
  const session = await getValidOwnerSession(request, env);
  if (!session) {
    throw new Error("unauthorized");
  }

  const config = await loadConfigFromDB(env.DB);
  const boardState = await getBoardStateWithDefaults(env.DB, env);
  return { session, boardState, config };
}

export async function getBoardSummary(env: Env, request: Request): Promise<{
  boardState: BoardStateRecord;
  isOwner: boolean;
}> {
  const [boardState, ownerSession] = await Promise.all([
    getBoardStateWithDefaults(env.DB, env),
    getValidOwnerSession(request, env)
  ]);

  return {
    boardState,
    isOwner: Boolean(ownerSession)
  };
}

export async function getClaimEligibility(env: Env): Promise<boolean> {
  return !(await isBoardClaimed(env.DB, env));
}

export async function setBoardPublicState(env: Env, visibility: "private" | "public"): Promise<BoardStateRecord> {
  return setBoardVisibility(env.DB, visibility, env);
}

export function canViewerBrowseBoard(env: Env, boardState: BoardStateRecord, ownerSession: OwnerSession | null): boolean {
  return canBrowseBoard({
    visibility: boardState.visibility,
    claimed: Boolean(boardState.owner_user_id),
    isOwner: Boolean(ownerSession),
    allowUnclaimedBrowse: isEnabledFlag(env.ALLOW_UNCLAIMED_BROWSE)
  });
}

export function getOwnerRuntimeFlags(env: Env): {
  allowUnclaimedBrowse: boolean;
  magicLinkDelivery: MagicLinkDeliveryMode;
} {
  return {
    allowUnclaimedBrowse: isEnabledFlag(env.ALLOW_UNCLAIMED_BROWSE),
    magicLinkDelivery: resolveMagicLinkDeliveryMode(
      env.MAGIC_LINK_DELIVERY,
      Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
    )
  };
}
