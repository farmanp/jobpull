import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerRuntime } from "../src/runtime.ts";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));

describe("server runtime", () => {
  let dir: string;
  let dbPath: string;
  let webDistDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "job-pull-runtime-"));
    dbPath = join(dir, "job_pull.sqlite");
    webDistDir = join(dir, "web-dist");
    mkdirSync(webDistDir, { recursive: true });
    writeFileSync(join(webDistDir, "index.html"), "<!doctype html><html><body>job-pull</body></html>");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reuses the worker handler for api requests", async () => {
    const runtime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "test-token",
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
    assert.match(html, /job-pull/);
  });
});
