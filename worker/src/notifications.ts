import { loadConfigFromDB } from "./config";
import { buildPublicUrl, escapeHtml, resolvePublicBaseUrl, sendResendEmail } from "./email";
import { getDigestJobsForWindow, getLatestDigestWindow, groupDigestJobs, type DigestJobRow, type DigestWindow } from "./digest";
import { sha256Hex } from "./lib/hash";
import type { CrawlSummary, Env } from "./types";

type SubscriberStatus = "pending" | "active" | "unsubscribed";
type NotificationStatus = "running" | "sent" | "partial" | "failed" | "skipped";
type NotificationKind = "digest" | "test";

type SubscriberRow = {
  id: string;
  email: string;
  status: SubscriberStatus;
  confirm_token_hash: string | null;
  unsubscribe_token_hash: string | null;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
};

type NotificationRunRow = {
  id: string;
  crawl_run_id: string | null;
  channel: string;
  kind: NotificationKind;
  status: NotificationStatus;
  recipients_targeted: number;
  recipients_sent: number;
  errors_json: string;
  started_at: string;
  finished_at: string | null;
};

type DigestEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export type NotificationsAdminInfo = {
  provider: {
    ready: boolean;
    service: "resend";
    fromEmail: string | null;
    replyToEmail: string | null;
    publicBaseUrl: string | null;
    issues: string[];
  };
  subscribers: {
    total: number;
    pending: number;
    active: number;
    unsubscribed: number;
  };
  lastRun: null | {
    id: string;
    kind: NotificationKind;
    status: NotificationStatus;
    recipientsTargeted: number;
    recipientsSent: number;
    startedAt: string;
    finishedAt: string | null;
    errorCount: number;
    crawlRunId: string | null;
  };
  publicSignupUrl: string | null;
};

function uuid(): string {
  return crypto.randomUUID();
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getProviderIssues(env: Env, requestUrl?: string): string[] {
  const issues: string[] = [];
  if (!env.RESEND_API_KEY) {
    issues.push("RESEND_API_KEY is missing.");
  }
  if (!env.EMAIL_FROM) {
    issues.push("EMAIL_FROM is missing.");
  }
  if (!resolvePublicBaseUrl(env, requestUrl)) {
    issues.push("PUBLIC_BASE_URL is missing.");
  }
  return issues;
}

function isProviderReady(env: Env, requestUrl?: string): boolean {
  return getProviderIssues(env, requestUrl).length === 0;
}

async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

async function buildUnsubscribeToken(subscriber: SubscriberRow, env: Env): Promise<string> {
  const confirmedAt = subscriber.confirmed_at ?? subscriber.created_at;
  const signature = await sha256Hex(
    [
      "unsubscribe",
      subscriber.id,
      subscriber.email,
      confirmedAt,
      env.ADMIN_TOKEN
    ].join("|")
  );
  return `${subscriber.id}.${signature}`;
}

async function countSubscribersByStatus(db: D1Database, status: SubscriberStatus): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as total FROM subscribers WHERE status = ?")
    .bind(status)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

async function getLatestNotificationRun(db: D1Database): Promise<NotificationRunRow | null> {
  return db
    .prepare(
      `SELECT id, crawl_run_id, channel, kind, status, recipients_targeted, recipients_sent, errors_json, started_at, finished_at
       FROM notification_runs
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .first<NotificationRunRow>();
}

async function getActiveSubscribers(db: D1Database): Promise<SubscriberRow[]> {
  const result = await db
    .prepare(
      `SELECT id, email, status, confirm_token_hash, unsubscribe_token_hash, created_at, confirmed_at, unsubscribed_at
       FROM subscribers
       WHERE status = 'active'
       ORDER BY confirmed_at ASC, created_at ASC`
    )
    .all<SubscriberRow>();

  return result.results ?? [];
}

async function findSubscriberByEmail(db: D1Database, email: string): Promise<SubscriberRow | null> {
  return db
    .prepare(
      `SELECT id, email, status, confirm_token_hash, unsubscribe_token_hash, created_at, confirmed_at, unsubscribed_at
       FROM subscribers
       WHERE email = ?`
    )
    .bind(email)
    .first<SubscriberRow>();
}

async function findSubscriberByTokenHash(
  db: D1Database,
  column: "confirm_token_hash" | "unsubscribe_token_hash",
  tokenHash: string
): Promise<SubscriberRow | null> {
  return db
    .prepare(
      `SELECT id, email, status, confirm_token_hash, unsubscribe_token_hash, created_at, confirmed_at, unsubscribed_at
       FROM subscribers
       WHERE ${column} = ?`
    )
    .bind(tokenHash)
    .first<SubscriberRow>();
}

async function createNotificationRun(
  db: D1Database,
  params: {
    crawlRunId: string | null;
    kind: NotificationKind;
    status?: NotificationStatus;
    recipientsTargeted?: number;
  }
): Promise<string> {
  const id = uuid();
  const startedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO notification_runs (
        id, crawl_run_id, channel, kind, status, recipients_targeted, recipients_sent, errors_json, started_at, finished_at
      ) VALUES (?, ?, 'email', ?, ?, ?, 0, '[]', ?, NULL)`
    )
    .bind(id, params.crawlRunId, params.kind, params.status ?? "running", params.recipientsTargeted ?? 0, startedAt)
    .run();
  return id;
}

async function finishNotificationRun(
  db: D1Database,
  runId: string,
  params: {
    status: NotificationStatus;
    recipientsSent: number;
    errors: string[];
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE notification_runs
       SET status = ?, recipients_sent = ?, errors_json = ?, finished_at = ?
       WHERE id = ?`
    )
    .bind(params.status, params.recipientsSent, JSON.stringify(params.errors), new Date().toISOString(), runId)
    .run();
}

async function recordDelivery(
  db: D1Database,
  params: {
    notificationRunId: string;
    subscriberId: string | null;
    email: string;
    status: "sent" | "failed";
    providerMessageId?: string | null;
    errorText?: string | null;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO notification_deliveries (
        id, notification_run_id, subscriber_id, email, status, provider_message_id, sent_at, error_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      uuid(),
      params.notificationRunId,
      params.subscriberId,
      params.email,
      params.status,
      params.providerMessageId ?? null,
      params.status === "sent" ? new Date().toISOString() : null,
      params.errorText ?? null
    )
    .run();
}

function renderShell(title: string, body: string): string {
  return `<!doctype html>
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
}

function htmlResponse(title: string, body: string, status = 200): Response {
  return new Response(renderShell(title, body), {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function buildDigestEmailContent(params: {
  boardName: string;
  tagline: string;
  window: DigestWindow;
  jobs: DigestJobRow[];
  unsubscribeUrl?: string | null;
  footerNote?: string;
}): DigestEmailContent {
  const groups = groupDigestJobs(params.jobs);
  const total = params.jobs.length;
  const focusSections = Object.entries(groups)
    .map(([focus, jobs]) => {
      const items = jobs
        .slice(0, 12)
        .map(
          (job) =>
            `<li style="margin:0 0 12px;">
              <a href="${escapeHtml(job.url)}" style="color:#171717;text-decoration:none;font-weight:700;">${escapeHtml(job.title)}</a><br />
              <span style="color:#4b5563;">${escapeHtml(job.company)} · ${escapeHtml(job.location)} · ${escapeHtml(job.remote_status)}</span>
            </li>`
        )
        .join("");
      return `
        <section style="margin:0 0 24px;">
          <h2 style="margin:0 0 12px;font-size:18px;text-transform:capitalize;">${escapeHtml(focus)}</h2>
          <ul style="margin:0;padding-left:18px;">${items}</ul>
        </section>
      `;
    })
    .join("");

  const footerHtml = params.unsubscribeUrl
    ? `You’re receiving this because you subscribed to the daily digest for ${escapeHtml(params.boardName)}.
          <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#171717;">Unsubscribe</a>`
    : escapeHtml(params.footerNote ?? `This is a preview of the ${params.boardName} daily digest.`);

  const html = `
    <div style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8f7;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;padding:32px;">
        <div style="margin-bottom:12px;color:#00c805;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(params.boardName)}</div>
        <h1 style="margin:0 0 12px;font-size:32px;line-height:1.1;">${total} new ${total === 1 ? "job" : "jobs"} in today’s digest</h1>
        <p style="margin:0 0 20px;color:#4b5563;line-height:1.65;">${escapeHtml(params.tagline || "Today’s latest roles grouped by focus area.")}</p>
        ${focusSections || `<p style="color:#4b5563;">No new jobs matched this digest window.</p>`}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;" />
        <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
          ${footerHtml}
        </p>
      </div>
    </div>
  `;

  const textSections = Object.entries(groups)
    .map(([focus, jobs]) =>
      `${focus.toUpperCase()}\n${jobs.map((job) => `- ${job.title} — ${job.company} — ${job.location} (${job.remote_status})\n  ${job.url}`).join("\n")}`
    )
    .join("\n\n");

  const text = [
    `${params.boardName}: ${total} new ${total === 1 ? "job" : "jobs"} in today’s digest`,
    params.tagline,
    textSections || "No new jobs matched this digest window.",
    params.unsubscribeUrl
      ? `Unsubscribe: ${params.unsubscribeUrl}`
      : params.footerNote ?? `Preview send for ${params.boardName}.`
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: `${params.boardName}: ${total} new ${total === 1 ? "job" : "jobs"} today`,
    html,
    text
  };
}

async function createConfirmationEmail(
  env: Env,
  email: string,
  token: string,
  requestUrl?: string
): Promise<DigestEmailContent> {
  const config = await loadConfigFromDB(env.DB);
  const baseUrl = resolvePublicBaseUrl(env, requestUrl);
  if (!baseUrl) {
    throw new Error("Public URL is not configured for subscriber confirmations.");
  }

  const confirmUrl = buildPublicUrl(baseUrl, "/subscribe/confirm", token);
  return {
    subject: `Confirm your ${config.boardName} daily digest`,
    html: `
      <div style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f8f7;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;padding:32px;">
          <div style="margin-bottom:12px;color:#00c805;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(config.boardName)}</div>
          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.1;">Confirm your daily digest</h1>
          <p style="margin:0 0 20px;color:#4b5563;line-height:1.65;">You requested daily email updates from ${escapeHtml(config.boardName)} at ${escapeHtml(email)}.</p>
          <a href="${escapeHtml(confirmUrl)}" style="display:inline-flex;align-items:center;padding:12px 18px;border-radius:999px;background:#00c805;color:#ffffff;text-decoration:none;font-weight:700;">Confirm subscription</a>
        </div>
      </div>
    `,
    text: `Confirm your ${config.boardName} daily digest subscription:\n\n${confirmUrl}`
  };
}

export async function createSubscription(env: Env, email: string, requestUrl?: string): Promise<{ ok: true; message: string }> {
  if (!isProviderReady(env, requestUrl)) {
    throw new Error("Email digest signup is not configured yet.");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }

  const existing = await findSubscriberByEmail(env.DB, normalizedEmail);
  if (existing?.status === "active") {
    return {
      ok: true,
      message: "If that address can receive digests, it is already subscribed."
    };
  }

  const subscriberId = existing?.id ?? uuid();
  const createdAt = existing?.created_at ?? new Date().toISOString();
  const confirmToken = randomToken();
  const confirmTokenHash = await hashToken(confirmToken);

  if (existing) {
    await env.DB
      .prepare(
        `UPDATE subscribers
         SET status = 'pending',
             confirm_token_hash = ?,
             unsubscribe_token_hash = NULL,
             confirmed_at = NULL,
             unsubscribed_at = NULL
         WHERE id = ?`
      )
      .bind(confirmTokenHash, existing.id)
      .run();
  } else {
    await env.DB
      .prepare(
        `INSERT INTO subscribers (
          id, email, status, confirm_token_hash, unsubscribe_token_hash, created_at, confirmed_at, unsubscribed_at
        ) VALUES (?, ?, 'pending', ?, NULL, ?, NULL, NULL)`
      )
      .bind(subscriberId, normalizedEmail, confirmTokenHash, createdAt)
      .run();
  }

  const confirmationEmail = await createConfirmationEmail(env, normalizedEmail, confirmToken, requestUrl);
  await sendResendEmail(env, {
    to: normalizedEmail,
    subject: confirmationEmail.subject,
    html: confirmationEmail.html,
    text: confirmationEmail.text
  }, `confirm-${subscriberId}`);

  return {
    ok: true,
    message: "Check your inbox to confirm the daily digest subscription."
  };
}

export async function confirmSubscription(env: Env, token: string): Promise<Response> {
  if (!token.trim()) {
    return htmlResponse("Missing confirmation token", "<h1>Missing confirmation link</h1><p>This confirmation link is incomplete or expired.</p>", 400);
  }

  const subscriber = await findSubscriberByTokenHash(env.DB, "confirm_token_hash", await hashToken(token.trim()));
  if (!subscriber || subscriber.status !== "pending") {
    return htmlResponse("Confirmation failed", "<h1>That confirmation link is no longer valid</h1><p>Try subscribing again from the board if you still want the daily digest.</p>", 400);
  }

  const confirmedAt = new Date().toISOString();
  const activeSubscriber: SubscriberRow = {
    ...subscriber,
    status: "active",
    confirmed_at: confirmedAt
  };
  const unsubscribeTokenHash = await hashToken(await buildUnsubscribeToken(activeSubscriber, env));

  await env.DB
    .prepare(
      `UPDATE subscribers
       SET status = 'active',
           confirm_token_hash = NULL,
           unsubscribe_token_hash = ?,
           confirmed_at = ?,
           unsubscribed_at = NULL
       WHERE id = ?`
    )
    .bind(unsubscribeTokenHash, confirmedAt, subscriber.id)
    .run();

  return htmlResponse(
    "Subscription confirmed",
    "<h1>You’re confirmed</h1><p>The next scheduled digest will arrive in your inbox after a successful crawl.</p>"
  );
}

export async function unsubscribeSubscription(env: Env, token: string): Promise<Response> {
  if (!token.trim()) {
    return htmlResponse("Missing unsubscribe token", "<h1>Missing unsubscribe link</h1><p>This unsubscribe link is incomplete or expired.</p>", 400);
  }

  const subscriber = await findSubscriberByTokenHash(env.DB, "unsubscribe_token_hash", await hashToken(token.trim()));
  if (!subscriber || subscriber.status !== "active") {
    return htmlResponse("Already unsubscribed", "<h1>This email is already unsubscribed</h1><p>You won’t receive future daily digests from this board.</p>");
  }

  await env.DB
    .prepare(
      `UPDATE subscribers
       SET status = 'unsubscribed',
           unsubscribed_at = ?,
           confirm_token_hash = NULL
       WHERE id = ?`
    )
    .bind(new Date().toISOString(), subscriber.id)
    .run();

  return htmlResponse(
    "Unsubscribed",
    "<h1>You have been unsubscribed</h1><p>You won’t receive future daily digests from this board unless you subscribe again.</p>"
  );
}

export async function getAdminNotificationsInfo(env: Env, requestUrl?: string): Promise<NotificationsAdminInfo> {
  const [pending, active, unsubscribed, lastRun] = await Promise.all([
    countSubscribersByStatus(env.DB, "pending"),
    countSubscribersByStatus(env.DB, "active"),
    countSubscribersByStatus(env.DB, "unsubscribed"),
    getLatestNotificationRun(env.DB)
  ]);

  const issues = getProviderIssues(env, requestUrl);
  const publicBaseUrl = resolvePublicBaseUrl(env, requestUrl);
  const lastRunErrors = lastRun ? JSON.parse(lastRun.errors_json) as string[] : [];

  return {
    provider: {
      ready: issues.length === 0,
      service: "resend",
      fromEmail: env.EMAIL_FROM ?? null,
      replyToEmail: env.EMAIL_REPLY_TO ?? null,
      publicBaseUrl,
      issues
    },
    subscribers: {
      total: pending + active + unsubscribed,
      pending,
      active,
      unsubscribed
    },
    lastRun: lastRun
      ? {
          id: lastRun.id,
          kind: lastRun.kind,
          status: lastRun.status,
          recipientsTargeted: lastRun.recipients_targeted,
          recipientsSent: lastRun.recipients_sent,
          startedAt: lastRun.started_at,
          finishedAt: lastRun.finished_at,
          errorCount: lastRunErrors.length,
          crawlRunId: lastRun.crawl_run_id
        }
      : null,
    publicSignupUrl: publicBaseUrl
  };
}

export async function sendAdminTestDigest(
  env: Env,
  email: string,
  requestUrl?: string
): Promise<{ ok: true; message: string }> {
  if (!isProviderReady(env, requestUrl)) {
    throw new Error("Email delivery is not configured yet.");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }

  const window = await getLatestDigestWindow(env.DB);
  if (!window) {
    throw new Error("Run a crawl before sending a test digest.");
  }

  const jobs = await getDigestJobsForWindow(env.DB, window.startedAt, window.finishedAt);
  const config = await loadConfigFromDB(env.DB);
  const runId = await createNotificationRun(env.DB, {
    crawlRunId: window.crawlRunId,
    kind: "test",
    recipientsTargeted: 1
  });

  try {
    const content = buildDigestEmailContent({
      boardName: config.boardName,
      tagline: config.tagline,
      window,
      jobs,
      footerNote: "This is a test send from the jobpull admin. Subscriber-only unsubscribe links are not included in preview emails."
    });
    const result = await sendResendEmail(env, {
      to: normalizedEmail,
      subject: `[Test] ${content.subject}`,
      html: content.html,
      text: content.text
    }, `test-${runId}-${normalizedEmail}`);

    await recordDelivery(env.DB, {
      notificationRunId: runId,
      subscriberId: null,
      email: normalizedEmail,
      status: "sent",
      providerMessageId: result.providerMessageId
    });
    await finishNotificationRun(env.DB, runId, {
      status: "sent",
      recipientsSent: 1,
      errors: []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordDelivery(env.DB, {
      notificationRunId: runId,
      subscriberId: null,
      email: normalizedEmail,
      status: "failed",
      errorText: message
    });
    await finishNotificationRun(env.DB, runId, {
      status: "failed",
      recipientsSent: 0,
      errors: [message]
    });
    throw error;
  }

  return {
    ok: true,
    message: `Sent a test digest to ${normalizedEmail}.`
  };
}

export async function maybeSendScheduledDigest(env: Env, crawl: CrawlSummary): Promise<void> {
  if (crawl.trigger !== "scheduled" || (crawl.status !== "success" && crawl.status !== "partial")) {
    return;
  }

  const existingRun = await env.DB
    .prepare(
      `SELECT id
       FROM notification_runs
       WHERE crawl_run_id = ?
         AND channel = 'email'
         AND kind = 'digest'
       LIMIT 1`
    )
    .bind(crawl.runId)
    .first<{ id: string }>();

  if (existingRun) {
    return;
  }

  const activeSubscribers = await getActiveSubscribers(env.DB);
  const issues = getProviderIssues(env);
  const skipRunId = await createNotificationRun(env.DB, {
    crawlRunId: crawl.runId,
    kind: "digest",
    recipientsTargeted: activeSubscribers.length
  });

  if (issues.length > 0) {
    await finishNotificationRun(env.DB, skipRunId, {
      status: "skipped",
      recipientsSent: 0,
      errors: issues
    });
    return;
  }

  if (activeSubscribers.length === 0) {
    await finishNotificationRun(env.DB, skipRunId, {
      status: "skipped",
      recipientsSent: 0,
      errors: ["No active subscribers."]
    });
    return;
  }

  const jobs = await getDigestJobsForWindow(env.DB, crawl.startedAt, crawl.finishedAt);
  if (jobs.length === 0) {
    await finishNotificationRun(env.DB, skipRunId, {
      status: "skipped",
      recipientsSent: 0,
      errors: ["No new jobs matched this digest window."]
    });
    return;
  }

  const config = await loadConfigFromDB(env.DB);
  const baseUrl = resolvePublicBaseUrl(env);
  if (!baseUrl) {
    await finishNotificationRun(env.DB, skipRunId, {
      status: "skipped",
      recipientsSent: 0,
      errors: ["PUBLIC_BASE_URL is missing."]
    });
    return;
  }

  const errors: string[] = [];
  let sentCount = 0;

  for (const subscriber of activeSubscribers) {
    try {
      const unsubscribeToken = await buildUnsubscribeToken(subscriber, env);
      const content = buildDigestEmailContent({
        boardName: config.boardName,
        tagline: config.tagline,
        window: {
          crawlRunId: crawl.runId,
          startedAt: crawl.startedAt,
          finishedAt: crawl.finishedAt,
          status: crawl.status,
          trigger: crawl.trigger
        },
        jobs,
        unsubscribeUrl: buildPublicUrl(baseUrl, "/subscribe/unsubscribe", unsubscribeToken)
      });
      const result = await sendResendEmail(env, {
        to: subscriber.email,
        subject: content.subject,
        html: content.html,
        text: content.text
      }, `digest-${crawl.runId}-${subscriber.id}`);

      await recordDelivery(env.DB, {
        notificationRunId: skipRunId,
        subscriberId: subscriber.id,
        email: subscriber.email,
        status: "sent",
        providerMessageId: result.providerMessageId
      });
      sentCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${subscriber.email}: ${message}`);
      await recordDelivery(env.DB, {
        notificationRunId: skipRunId,
        subscriberId: subscriber.id,
        email: subscriber.email,
        status: "failed",
        errorText: message
      });
    }
  }

  await finishNotificationRun(env.DB, skipRunId, {
    status: errors.length === 0 ? "sent" : sentCount > 0 ? "partial" : "failed",
    recipientsSent: sentCount,
    errors
  });
}
