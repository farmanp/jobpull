import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerRuntime } from "../src/runtime.ts";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));

function readCookie(header: string | null, name: string): string {
  if (!header) {
    return "";
  }

  const part = header.split(";")[0] ?? "";
  return part.startsWith(`${name}=`) ? part : "";
}

describe("owner runtime", () => {
  let dir: string;
  let dbPath: string;
  let webDistDir: string;
  let uploadsDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jobpull-owner-"));
    dbPath = join(dir, "jobpull.sqlite");
    webDistDir = join(dir, "web-dist");
    uploadsDir = join(dir, "uploads");
    mkdirSync(webDistDir, { recursive: true });
    writeFileSync(join(webDistDir, "index.html"), "<!doctype html><html><body>jobpull</body></html>");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  });

  it("claims the board, creates a signed owner session, and gates private board data", async () => {
    globalThis.fetch = async (_input, init) => {
      void init;
      return new Response(JSON.stringify({ id: "email_1" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const runtime = await createServerRuntime({
      dbPath,
      webDistDir,
      migrationsDir: join(ROOT_DIR, "worker", "migrations"),
      adminToken: "admin-token",
      sessionSecret: "session-secret",
      magicLinkDelivery: "console",
      resendApiKey: "re_test",
      emailFrom: "JobPull <digest@example.com>",
      emailReplyTo: "support@example.com",
      publicBaseUrl: "http://localhost:8787",
      uploadsDir,
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
        "job-owner-1",
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
        "growth",
        0,
        null
      )
      .run();

    const privateResponse = await runtime.handleRequest(new Request("http://localhost:8787/api/jobs?limit=10"));
    assert.equal(privateResponse.status, 403);

    const claimResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/auth/claim", {
        method: "POST",
        headers: {
          authorization: "Bearer admin-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ email: "owner@example.com" })
      })
    );
    assert.equal(claimResponse.status, 200);
    const claimBody = (await claimResponse.json()) as { signInUrl: string };
    assert.match(claimBody.signInUrl, /\/auth\/verify\?token=/);

    const repeatClaim = await runtime.handleRequest(
      new Request("http://localhost:8787/api/auth/claim", {
        method: "POST",
        headers: {
          authorization: "Bearer admin-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ email: "owner@example.com" })
      })
    );
    assert.equal(repeatClaim.status, 409);

    const requestLinkResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/auth/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@example.com" })
      })
    );
    assert.equal(requestLinkResponse.status, 200);

    const verifyResponse = await runtime.handleRequest(new Request(claimBody.signInUrl));
    assert.equal(verifyResponse.status, 302);
    const sessionCookie = readCookie(verifyResponse.headers.get("set-cookie"), "jobpull_owner_session");
    assert.ok(sessionCookie);

    const meResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/me", {
        headers: { cookie: sessionCookie }
      })
    );
    assert.equal(meResponse.status, 200);
    const meBody = (await meResponse.json()) as {
      authenticated: boolean;
      board: { visibility: string; claimed: boolean; ownerSignedIn: boolean };
      user: { id: string; email: string } | null;
    };
    assert.equal(meBody.authenticated, true);
    assert.equal(meBody.board.visibility, "private");
    assert.equal(meBody.board.claimed, true);
    assert.equal(meBody.board.ownerSignedIn, true);
    assert.equal(meBody.user?.email, "owner@example.com");

    const adminRuntimeResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/admin/runtime", {
        headers: { cookie: sessionCookie }
      })
    );
    assert.equal(adminRuntimeResponse.status, 200);

    const ownerId = meBody.user?.id ?? "";
    const saveStateResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/me/jobs/job-owner-1/state", {
        method: "PUT",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json"
        },
        body: JSON.stringify({ favorite: true, status: "applied", notes: "Applied through company site" })
      })
    );
    assert.equal(saveStateResponse.status, 200);
    const savedState = (await saveStateResponse.json()) as {
      favorite: number;
      status: string;
      notes: string;
      applied_at: string | null;
    };
    assert.equal(savedState.favorite, 1);
    assert.equal(savedState.status, "applied");
    assert.equal(savedState.notes, "Applied through company site");
    assert.ok(savedState.applied_at);

    const trackedJobsResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/me/jobs", {
        headers: { cookie: sessionCookie }
      })
    );
    assert.equal(trackedJobsResponse.status, 200);
    const trackedJobs = (await trackedJobsResponse.json()) as {
      items: Array<{ id: string; favorite: number; status: string; notes: string }>;
    };
    assert.equal(trackedJobs.items.length, 1);
    assert.equal(trackedJobs.items[0]?.id, "job-owner-1");
    assert.equal(trackedJobs.items[0]?.favorite, 1);
    assert.equal(trackedJobs.items[0]?.status, "applied");

    const profileResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/me/profile", {
        method: "PUT",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          full_name: "Owner Person",
          location: "Denver, CO",
          linkedin_url: "https://linkedin.com/in/owner-person"
        })
      })
    );
    assert.equal(profileResponse.status, 200);
    const profileBody = (await profileResponse.json()) as { full_name: string; location: string };
    assert.equal(profileBody.full_name, "Owner Person");
    assert.equal(profileBody.location, "Denver, CO");

    const resume = new File([new Uint8Array([1, 2, 3, 4])], "resume.pdf", { type: "application/pdf" });
    const formData = new FormData();
    formData.append("resume", resume);

    const resumeResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/me/resume", {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData
      })
    );
    assert.equal(resumeResponse.status, 200);
    const resumeBody = (await resumeResponse.json()) as { resume: { id: string; storageKey: string } };
    const storedPath = join(uploadsDir, "resumes", resumeBody.resume.storageKey);
    assert.equal(existsSync(storedPath), true);

    const deleteResponse = await runtime.handleRequest(
      new Request("http://localhost:8787/api/me/resume", {
        method: "DELETE",
        headers: { cookie: sessionCookie }
      })
    );
    assert.equal(deleteResponse.status, 200);
    assert.equal(existsSync(storedPath), false);

    const resumeRows = await runtime.db
      .prepare("SELECT COUNT(*) as total FROM user_resumes WHERE user_id = ?")
      .bind(ownerId)
      .first<{ total: number }>();
    assert.equal(resumeRows?.total, 0);
  });
});
