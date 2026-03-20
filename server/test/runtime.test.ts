import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerRuntime } from "../src/runtime.ts";
import { maybeSendScheduledDigest } from "../../worker/src/notifications.ts";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("server runtime", () => {
  let dir: string;
  let dbPath: string;
  let webDistDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jobpull-runtime-"));
    dbPath = join(dir, "jobpull.sqlite");
    webDistDir = join(dir, "web-dist");
    mkdirSync(webDistDir, { recursive: true });
    writeFileSync(join(webDistDir, "index.html"), "<!doctype html><html><body>jobpull</body></html>");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  });

  it("reuses the worker handler for api requests", async () => {
    const runtime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "test-token",
      resendApiKey: "",
      emailFrom: "",
      emailReplyTo: "",
      publicBaseUrl: "http://localhost:8787",
      port: 8787,
      cronSchedule: "0 7 * * *",
      userAgent: "JobPullBot/1.0 (+contact:test@example.com)",
      defaultTimeoutMs: "10000",
      defaultMaxRetries: "3",
      hostConcurrency: "2",
      hostSpacingMs: "750",
      staleThresholdDays: "14"
    });

    await runtime.db
      .prepare(
        `INSERT INTO jobs (
          id, title, company, location, remote_status, url, source,
          date_posted, date_seen, description, tags, pm_focus, is_stale, stale_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        "job-visible",
        "Senior Product Manager",
        "Acme",
        "Remote",
        "remote",
        "https://example.com/jobs/1",
        "seed",
        "2026-03-17T00:00:00.000Z",
        "2026-03-17T10:00:00.000Z",
        "Own the roadmap",
        JSON.stringify(["remote"]),
        "core",
        0,
        null
      )
      .run();

    await runtime.db
      .prepare(
        `INSERT INTO jobs (
          id, title, company, location, remote_status, url, source,
          date_posted, date_seen, description, tags, pm_focus, is_stale, stale_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        "job-stale",
        "Old Product Manager",
        "Acme",
        "Remote",
        "remote",
        "https://example.com/jobs/2",
        "seed",
        "2025-01-01T00:00:00.000Z",
        "2025-01-01T00:00:00.000Z",
        "Outdated",
        JSON.stringify(["remote"]),
        "core",
        1,
        "2025-02-01T00:00:00.000Z"
      )
      .run();

    await runtime.db
      .prepare(
        `UPDATE board_state
         SET visibility = 'public', published_at = CURRENT_TIMESTAMP
         WHERE id = 'singleton'`
      )
      .run();

    const visibleResponse = await runtime.handleRequest(new Request("http://localhost/api/jobs?limit=10"));
    assert.equal(visibleResponse.status, 200);
    const visibleBody = (await visibleResponse.json()) as { items: Array<{ id: string; is_stale: number }> };
    assert.equal(visibleBody.items.length, 1);
    assert.equal(visibleBody.items[0]?.id, "job-visible");
    assert.equal(visibleBody.items[0]?.is_stale, 0);

    const healthResponse = await runtime.handleRequest(new Request("http://localhost/api/health"));
    assert.equal(healthResponse.status, 200);
    const healthBody = (await healthResponse.json()) as { ok: boolean };
    assert.equal(healthBody.ok, true);

    const allResponse = await runtime.handleRequest(
      new Request("http://localhost/api/jobs?limit=10&include_stale=1")
    );
    assert.equal(allResponse.status, 200);
    const allBody = (await allResponse.json()) as { items: Array<{ id: string; is_stale: number }> };
    assert.equal(allBody.items.length, 2);
    assert.equal(allBody.items.find((item) => item.id === "job-stale")?.is_stale, 1);

    const statsResponse = await runtime.handleRequest(new Request("http://localhost/api/stats"));
    assert.equal(statsResponse.status, 200);
    const stats = (await statsResponse.json()) as {
      totalJobs: number;
      visibleJobs: number;
      staleJobs: number;
      staleThresholdDays: number;
    };

    assert.equal(stats.totalJobs, 2);
    assert.equal(stats.visibleJobs, 1);
    assert.equal(stats.staleJobs, 1);
    assert.equal(stats.staleThresholdDays, 14);
  });

  it("serves the built frontend shell on non-api routes", async () => {
    const runtime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "test-token",
      resendApiKey: "",
      emailFrom: "",
      emailReplyTo: "",
      publicBaseUrl: "http://localhost:8787",
      port: 8787,
      cronSchedule: "0 7 * * *",
      userAgent: "JobPullBot/1.0 (+contact:test@example.com)",
      defaultTimeoutMs: "10000",
      defaultMaxRetries: "3",
      hostConcurrency: "2",
      hostSpacingMs: "750",
      staleThresholdDays: "14"
    });

    const response = await runtime.handleRequest(new Request("http://localhost/"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    const html = await response.text();
    assert.match(html, /jobpull/);
  });

  it("exposes runtime schedule updates and persists them for the server path", async () => {
    const runtime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "test-token",
      resendApiKey: "",
      emailFrom: "",
      emailReplyTo: "",
      publicBaseUrl: "http://localhost:8787",
      port: 8787,
      cronSchedule: "0 7 * * *",
      userAgent: "JobPullBot/1.0 (+contact:test@example.com)",
      defaultTimeoutMs: "10000",
      defaultMaxRetries: "3",
      hostConcurrency: "2",
      hostSpacingMs: "750",
      staleThresholdDays: "14"
    });

    const initialResponse = await runtime.handleRequest(
      new Request("http://localhost/api/admin/runtime", {
        headers: { authorization: "Bearer test-token" }
      })
    );
    assert.equal(initialResponse.status, 200);
    const initialPayload = (await initialResponse.json()) as {
      platform: string;
      schedule: string;
      scheduleEditable: boolean;
      editableFields: string[];
      checks: {
        schedulerAvailable: boolean;
        adminTokenConfigured: boolean;
        runtimeStorageAvailable: boolean;
        databaseConnected: boolean;
      };
      externalSteps: string[];
    };

    assert.equal(initialPayload.platform, "server");
    assert.equal(initialPayload.schedule, "0 7 * * *");
    assert.equal(initialPayload.scheduleEditable, true);
    assert.deepEqual(initialPayload.editableFields, ["schedule"]);
    assert.deepEqual(initialPayload.checks, {
      schedulerAvailable: true,
      adminTokenConfigured: true,
      runtimeStorageAvailable: true,
      databaseConnected: true
    });
    assert.equal(initialPayload.externalSteps[0], "Schedule changes are saved in the app and hot-reload the runtime scheduler.");
    assert.equal(initialPayload.externalSteps[1], "Save a new cron value above to apply it without restarting the server.");

    const updateResponse = await runtime.handleRequest(
      new Request("http://localhost/api/admin/runtime", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ schedule: "30 5 * * *" })
      })
    );
    assert.equal(updateResponse.status, 200);
    const updatedPayload = (await updateResponse.json()) as { schedule: string; scheduleEditable: boolean };
    assert.equal(updatedPayload.schedule, "30 5 * * *");
    assert.equal(updatedPayload.scheduleEditable, true);

    const reloadedRuntime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "test-token",
      resendApiKey: "",
      emailFrom: "",
      emailReplyTo: "",
      publicBaseUrl: "http://localhost:8787",
      port: 8787,
      cronSchedule: "0 7 * * *",
      userAgent: "JobPullBot/1.0 (+contact:test@example.com)",
      defaultTimeoutMs: "10000",
      defaultMaxRetries: "3",
      hostConcurrency: "2",
      hostSpacingMs: "750",
      staleThresholdDays: "14"
    });

    const persistedResponse = await reloadedRuntime.handleRequest(
      new Request("http://localhost/api/admin/runtime", {
        headers: { authorization: "Bearer test-token" }
      })
    );
    const persistedPayload = (await persistedResponse.json()) as { schedule: string };
    assert.equal(persistedPayload.schedule, "30 5 * * *");
  });

  it("validates unsaved sources and returns a preview payload", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              title: "Senior Product Manager",
              location: "Remote",
              publishedAt: "2026-03-01T12:00:00Z",
              isRemote: true,
              workplaceType: "remote",
              jobUrl: "https://jobs.ashbyhq.com/openai/abc123",
              descriptionPlain: "Own roadmap and platform strategy."
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );

    const runtime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "test-token",
      resendApiKey: "",
      emailFrom: "",
      emailReplyTo: "",
      publicBaseUrl: "http://localhost:8787",
      port: 8787,
      cronSchedule: "0 7 * * *",
      userAgent: "JobPullBot/1.0 (+contact:test@example.com)",
      defaultTimeoutMs: "10000",
      defaultMaxRetries: "3",
      hostConcurrency: "2",
      hostSpacingMs: "750",
      staleThresholdDays: "14"
    });

    const response = await runtime.handleRequest(
      new Request("http://localhost/api/admin/sources/validate", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          type: "ashby",
          values: {
            companyName: "OpenAI",
            organizationSlug: "openai"
          }
        })
      })
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      source: { id: string; name: string };
      totalFetched: number;
      previewJobs: Array<{ title: string; remote_status: string }>;
    };

    assert.equal(payload.source.id, "ashby-openai");
    assert.equal(payload.source.name, "OpenAI Ashby");
    assert.equal(payload.totalFetched, 1);
    assert.equal(payload.previewJobs[0]?.title, "Senior Product Manager");
    assert.equal(payload.previewJobs[0]?.remote_status, "remote");
  });

  it("creates pending subscriptions, confirms them, and unsubscribes them", async () => {
    let confirmationUrl = "";

    globalThis.fetch = async (_input, init) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      const match = payload.text?.match(/https?:\/\/\S+\/subscribe\/confirm\?token=[^\s]+/);
      confirmationUrl = match?.[0] ?? "";

      return new Response(JSON.stringify({ id: "email_1" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const runtime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "test-token",
      resendApiKey: "re_test",
      emailFrom: "JobPull <digest@example.com>",
      emailReplyTo: "support@example.com",
      publicBaseUrl: "http://localhost:8787",
      port: 8787,
      cronSchedule: "0 7 * * *",
      userAgent: "JobPullBot/1.0 (+contact:test@example.com)",
      defaultTimeoutMs: "10000",
      defaultMaxRetries: "3",
      hostConcurrency: "2",
      hostSpacingMs: "750",
      staleThresholdDays: "14"
    });

    await runtime.db
      .prepare(
        `UPDATE board_state
         SET visibility = 'public', published_at = CURRENT_TIMESTAMP
         WHERE id = 'singleton'`
      )
      .run();

    const subscribeResponse = await runtime.handleRequest(
      new Request("http://localhost/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "reader@example.com" })
      })
    );
    assert.equal(subscribeResponse.status, 200);
    assert.ok(confirmationUrl.includes("/subscribe/confirm?token="));

    const pendingSubscriber = await runtime.db
      .prepare("SELECT id, status, confirm_token_hash FROM subscribers WHERE email = ?")
      .bind("reader@example.com")
      .first<{ id: string; status: string; confirm_token_hash: string | null }>();
    assert.equal(pendingSubscriber?.status, "pending");
    assert.ok(pendingSubscriber?.confirm_token_hash);

    const confirmResponse = await runtime.handleRequest(new Request(confirmationUrl));
    assert.equal(confirmResponse.status, 200);
    const confirmHtml = await confirmResponse.text();
    assert.match(confirmHtml, /You’re confirmed/);

    const activeSubscriber = await runtime.db
      .prepare("SELECT id, email, status, confirmed_at, unsubscribe_token_hash FROM subscribers WHERE email = ?")
      .bind("reader@example.com")
      .first<{
        id: string;
        email: string;
        status: string;
        confirmed_at: string;
        unsubscribe_token_hash: string | null;
      }>();

    assert.equal(activeSubscriber?.status, "active");
    assert.ok(activeSubscriber?.confirmed_at);
    assert.ok(activeSubscriber?.unsubscribe_token_hash);

    const unsubscribeToken = `${activeSubscriber?.id}.${sha256Hex(
      `unsubscribe|${activeSubscriber?.id}|${activeSubscriber?.email}|${activeSubscriber?.confirmed_at}|test-token`
    )}`;

    const unsubscribeResponse = await runtime.handleRequest(
      new Request(`http://localhost:8787/subscribe/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`)
    );
    assert.equal(unsubscribeResponse.status, 200);
    const unsubscribeHtml = await unsubscribeResponse.text();
    assert.match(unsubscribeHtml, /You have been unsubscribed/);

    const unsubscribedRow = await runtime.db
      .prepare("SELECT status FROM subscribers WHERE email = ?")
      .bind("reader@example.com")
      .first<{ status: string }>();
    assert.equal(unsubscribedRow?.status, "unsubscribed");
  });

  it("sends one scheduled digest per crawl run and surfaces notification status in admin", async () => {
    let resendCalls = 0;

    globalThis.fetch = async () => {
      resendCalls += 1;
      return new Response(JSON.stringify({ id: `email_${resendCalls}` }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const runtime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "test-token",
      resendApiKey: "re_test",
      emailFrom: "JobPull <digest@example.com>",
      emailReplyTo: "support@example.com",
      publicBaseUrl: "http://localhost:8787",
      port: 8787,
      cronSchedule: "0 7 * * *",
      userAgent: "JobPullBot/1.0 (+contact:test@example.com)",
      defaultTimeoutMs: "10000",
      defaultMaxRetries: "3",
      hostConcurrency: "2",
      hostSpacingMs: "750",
      staleThresholdDays: "14"
    });

    const confirmedAt = "2026-03-18T07:00:00.000Z";
    const subscriberId = "subscriber-1";
    const unsubscribeToken = `${subscriberId}.${sha256Hex(
      `unsubscribe|${subscriberId}|reader@example.com|${confirmedAt}|test-token`
    )}`;
    const unsubscribeTokenHash = sha256Hex(unsubscribeToken);

    await runtime.db
      .prepare(
        `INSERT INTO subscribers (
          id, email, status, confirm_token_hash, unsubscribe_token_hash, created_at, confirmed_at, unsubscribed_at
        ) VALUES (?, ?, 'active', NULL, ?, ?, ?, NULL)`
      )
      .bind(
        subscriberId,
        "reader@example.com",
        unsubscribeTokenHash,
        "2026-03-18T06:00:00.000Z",
        confirmedAt
      )
      .run();

    await runtime.db
      .prepare(
        `INSERT INTO jobs (
          id, title, company, location, remote_status, url, source,
          date_posted, date_seen, description, tags, pm_focus, is_stale, stale_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        "digest-job-1",
        "Senior Product Manager",
        "Acme",
        "Remote",
        "remote",
        "https://example.com/jobs/1",
        "seed",
        "2026-03-18T07:15:00.000Z",
        "2026-03-18T08:30:00.000Z",
        "Own the roadmap",
        JSON.stringify(["remote"]),
        "growth",
        0,
        null
      )
      .run();

    await maybeSendScheduledDigest(runtime.env as never, {
      runId: "crawl-manual",
      startedAt: "2026-03-18T08:00:00.000Z",
      finishedAt: "2026-03-18T09:00:00.000Z",
      jobsAdded: 1,
      errors: [],
      status: "success",
      trigger: "manual"
    });
    assert.equal(resendCalls, 0);

    await maybeSendScheduledDigest(runtime.env as never, {
      runId: "crawl-scheduled",
      startedAt: "2026-03-18T08:00:00.000Z",
      finishedAt: "2026-03-18T09:00:00.000Z",
      jobsAdded: 1,
      errors: [],
      status: "success",
      trigger: "scheduled"
    });
    assert.equal(resendCalls, 1);

    await maybeSendScheduledDigest(runtime.env as never, {
      runId: "crawl-scheduled",
      startedAt: "2026-03-18T08:00:00.000Z",
      finishedAt: "2026-03-18T09:00:00.000Z",
      jobsAdded: 1,
      errors: [],
      status: "success",
      trigger: "scheduled"
    });
    assert.equal(resendCalls, 1);

    const notificationResponse = await runtime.handleRequest(
      new Request("http://localhost/api/admin/notifications", {
        headers: { authorization: "Bearer test-token" }
      })
    );
    assert.equal(notificationResponse.status, 200);
    const payload = (await notificationResponse.json()) as {
      provider: { ready: boolean };
      subscribers: { active: number };
      lastRun: { kind: string; status: string; recipientsSent: number; recipientsTargeted: number } | null;
    };

    assert.equal(payload.provider.ready, true);
    assert.equal(payload.subscribers.active, 1);
    assert.equal(payload.lastRun?.kind, "digest");
    assert.equal(payload.lastRun?.status, "sent");
    assert.equal(payload.lastRun?.recipientsSent, 1);
    assert.equal(payload.lastRun?.recipientsTargeted, 1);
  });
});
