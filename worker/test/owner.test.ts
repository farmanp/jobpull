import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env, JobUserStateRecord, MagicLinkRecord, UserProfileRecord, UserRecord, UserResumeRecord } from "../src/types";

type BoardStateRow = {
  id: string;
  owner_user_id: string | null;
  visibility: "private" | "public";
  claimed_at: string | null;
  published_at: string | null;
};

type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote_status: string;
  url: string;
  source: string;
  date_posted: string | null;
  date_seen: string;
  description: string;
  tags: string;
  pm_focus: string;
  is_stale: number;
};

class MockPreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: OwnerMockD1Database,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]): MockPreparedStatement {
    this.values = values;
    return this;
  }

  first<T>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.values);
  }

  all<T>(): Promise<{ results: T[] }> {
    return this.db.all<T>(this.sql, this.values);
  }

  run(): Promise<{ success: true }> {
    this.db.run(this.sql, this.values);
    return Promise.resolve({ success: true });
  }
}

class OwnerMockD1Database {
  boardState: BoardStateRow = {
    id: "singleton",
    owner_user_id: null,
    visibility: "private",
    claimed_at: null,
    published_at: null
  };

  boardConfigRows: Array<{ key: string; value: string }> = [
    { key: "boardName", value: "Private PM Board" },
    { key: "tagline", value: "A board for one owner" },
    { key: "remoteOnly", value: "true" },
    { key: "titleIncludePatterns", value: JSON.stringify([{ label: "Product", source: "\\bproduct\\b" }]) },
    { key: "titleExcludePatterns", value: JSON.stringify([]) },
    { key: "descriptionFallback", value: JSON.stringify(null) },
    { key: "focusCategories", value: JSON.stringify([]) },
    { key: "tagKeywords", value: JSON.stringify([]) }
  ];

  jobs: JobRow[] = [
    {
      id: "job-1",
      title: "Senior Product Manager",
      company: "Acme",
      location: "Remote",
      remote_status: "remote",
      url: "https://example.com/jobs/1",
      source: "greenhouse",
      date_posted: "2026-03-17T00:00:00.000Z",
      date_seen: "2026-03-17T10:00:00.000Z",
      description: "Own the roadmap",
      tags: JSON.stringify(["remote"]),
      pm_focus: "core",
      is_stale: 0
    }
  ];

  sources = [{ id: "starter-remoteok", enabled: 1 }];
  crawlRuns = [{ finished_at: "2026-03-17T12:00:00.000Z", status: "success", jobs_added: 1 }];
  users: UserRecord[] = [];
  magicLinks: MagicLinkRecord[] = [];
  jobUserStates: JobUserStateRecord[] = [];
  profiles: UserProfileRecord[] = [];
  resumes: UserResumeRecord[] = [];

  prepare(sql: string): MockPreparedStatement {
    return new MockPreparedStatement(this, sql);
  }

  async batch(statements: MockPreparedStatement[]): Promise<Array<{ success: true }>> {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  async first<T>(sql: string, values: unknown[]): Promise<T | null> {
    if (sql.includes("SELECT key, value FROM board_config")) {
      return null;
    }

    if (sql.includes("FROM board_state")) {
      return this.boardState as T;
    }

    if (sql.includes("FROM users") && sql.includes("WHERE email = ?")) {
      const [email] = values;
      return (this.users.find((user) => user.email === email) ?? null) as T | null;
    }

    if (sql.includes("FROM users") && sql.includes("WHERE id = ?")) {
      const [id] = values;
      return (this.users.find((user) => user.id === id) ?? null) as T | null;
    }

    if (sql.includes("FROM magic_links") && sql.includes("WHERE token_hash = ?")) {
      const [tokenHash] = values;
      return (this.magicLinks.find((link) => link.token_hash === tokenHash) ?? null) as T | null;
    }

    if (sql.includes("FROM user_profiles") && sql.includes("WHERE user_id = ?")) {
      const [userId] = values;
      return (this.profiles.find((profile) => profile.user_id === userId) ?? null) as T | null;
    }

    if (sql.includes("FROM user_resumes") && sql.includes("WHERE user_id = ?") && sql.includes("is_active = 1")) {
      const [userId] = values;
      const row = [...this.resumes].reverse().find((resume) => resume.user_id === userId && resume.is_active === 1) ?? null;
      return (row ?? null) as T | null;
    }

    if (sql.includes("FROM job_user_states") && sql.includes("WHERE user_id = ?") && sql.includes("job_id = ?")) {
      const [userId, jobId] = values;
      return (this.jobUserStates.find((state) => state.user_id === userId && state.job_id === jobId) ?? null) as T | null;
    }

    if (sql.includes("FROM jobs") && sql.includes("WHERE id = ?")) {
      const [jobId] = values;
      return (this.jobs.find((job) => job.id === jobId) ?? null) as T | null;
    }

    if (sql.includes("SELECT COUNT(*) as total FROM jobs WHERE is_stale = 0")) {
      return { total: this.jobs.filter((job) => job.is_stale === 0).length } as T;
    }

    if (sql.includes("SELECT COUNT(*) as total FROM jobs WHERE is_stale = 1")) {
      return { total: this.jobs.filter((job) => job.is_stale === 1).length } as T;
    }

    if (sql.includes("SELECT COUNT(*) as total FROM jobs")) {
      return { total: this.jobs.length } as T;
    }

    if (sql.includes("SELECT COUNT(*) as total FROM sources") && sql.includes("enabled = 1")) {
      return { total: this.sources.filter((source) => source.enabled === 1).length } as T;
    }

    if (sql.includes("SELECT finished_at, status, jobs_added FROM crawl_runs")) {
      const latest = [...this.crawlRuns].sort((a, b) => b.finished_at.localeCompare(a.finished_at))[0] ?? null;
      return latest as T | null;
    }

    if (sql.includes("SELECT COUNT(*) as total") && sql.includes("FROM job_user_states") && sql.includes("WHERE job_user_states.user_id = ?")) {
      const [userId, status] = values;
      const total = this.jobUserStates.filter((item) => item.user_id === userId && (!status || item.status === status)).length;
      return { total } as T;
    }

    throw new Error(`Unhandled first() SQL in test mock: ${sql}`);
  }

  async all<T>(sql: string, values: unknown[]): Promise<{ results: T[] }> {
    if (sql.includes("SELECT key, value FROM board_config")) {
      return { results: this.boardConfigRows as T[] };
    }

    if (sql.includes("FROM job_user_states") && sql.includes("JOIN jobs")) {
      return { results: this.queryTrackedJobs(sql, values) as T[] };
    }

    if (sql.includes("FROM jobs")) {
      return { results: this.queryJobs(sql, values) as T[] };
    }

    throw new Error(`Unhandled all() SQL in test mock: ${sql}`);
  }

  run(sql: string, values: unknown[]): void {
    if (sql.includes("UPDATE board_state")) {
      const [value1, value2] = values;
      if (sql.includes("SET owner_user_id = ?")) {
        this.boardState.owner_user_id = String(value1);
        this.boardState.visibility = "private";
        this.boardState.claimed_at = this.boardState.claimed_at ?? String(value2);
        this.boardState.published_at = null;
        return;
      }

      if (sql.includes("SET visibility = ?")) {
        this.boardState.visibility = String(value1) as "private" | "public";
        this.boardState.published_at = String(value1) === "public" ? (this.boardState.published_at ?? String(values[2] ?? new Date().toISOString())) : null;
        return;
      }
    }

    if (sql.includes("INSERT INTO users")) {
      const [id, email, createdAt, lastSeenAt] = values;
      const existing = this.users.find((user) => user.id === id || user.email === email);
      const next = {
        id: String(id),
        email: String(email),
        status: "owner",
        created_at: String(createdAt),
        last_seen_at: String(lastSeenAt)
      };
      if (existing) {
        Object.assign(existing, next);
      } else {
        this.users.push(next);
      }
      return;
    }

    if (sql.includes("UPDATE users SET status = 'owner'")) {
      const [lastSeenAt, userId] = values;
      const user = this.users.find((entry) => entry.id === userId);
      if (user) {
        user.status = "owner";
        user.last_seen_at = String(lastSeenAt);
      }
      return;
    }

    if (sql.includes("INSERT INTO magic_links")) {
      const [id, userId, purpose, tokenHash, expiresAt, createdAt] = values;
      this.magicLinks.push({
        id: String(id),
        user_id: String(userId),
        purpose: String(purpose),
        token_hash: String(tokenHash),
        expires_at: String(expiresAt),
        used_at: null,
        created_at: String(createdAt)
      });
      return;
    }

    if (sql.includes("UPDATE magic_links SET used_at = ?")) {
      const [usedAt, id] = values;
      const link = this.magicLinks.find((entry) => entry.id === id);
      if (link) {
        link.used_at = String(usedAt);
      }
      return;
    }

    if (sql.includes("INSERT OR REPLACE INTO user_profiles")) {
      const [userId, fullName, email, phone, location, linkedinUrl, portfolioUrl, resumeText, updatedAt] = values;
      const next = {
        user_id: String(userId),
        full_name: fullName === null ? null : String(fullName ?? ""),
        email: email === null ? null : String(email ?? ""),
        phone: phone === null ? null : String(phone ?? ""),
        location: location === null ? null : String(location ?? ""),
        linkedin_url: linkedinUrl === null ? null : String(linkedinUrl ?? ""),
        portfolio_url: portfolioUrl === null ? null : String(portfolioUrl ?? ""),
        resume_text: resumeText === null ? null : String(resumeText ?? ""),
        updated_at: String(updatedAt)
      };
      const existing = this.profiles.find((entry) => entry.user_id === userId);
      if (existing) {
        Object.assign(existing, next);
      } else {
        this.profiles.push(next);
      }
      return;
    }

    if (sql.includes("UPDATE user_resumes SET is_active = 0")) {
      const [userId] = values;
      for (const resume of this.resumes) {
        if (resume.user_id === userId && resume.is_active === 1) {
          resume.is_active = 0;
        }
      }
      return;
    }

    if (sql.includes("INSERT INTO user_resumes")) {
      const [id, userId, storageKey, fileName, mimeType, sizeBytes, fileBlob, resumeText, uploadedAt] = values;
      this.resumes.push({
        id: String(id),
        user_id: String(userId),
        storage_key: String(storageKey),
        file_name: String(fileName),
        mime_type: String(mimeType),
        size_bytes: Number(sizeBytes),
        file_blob: fileBlob as ArrayBuffer | null,
        resume_text: resumeText === null ? null : String(resumeText ?? ""),
        uploaded_at: String(uploadedAt),
        is_active: 1
      });
      return;
    }

    if (sql.includes("INSERT INTO job_user_states")) {
      const [userId, jobId, favorite, status, notes, appliedAt, rejectedAt, updatedAt] = values;
      const existing = this.jobUserStates.find((entry) => entry.user_id === userId && entry.job_id === jobId);
      const next = {
        user_id: String(userId),
        job_id: String(jobId),
        favorite: Number(favorite),
        status: String(status),
        notes: notes === null ? null : String(notes ?? ""),
        applied_at: appliedAt === null ? null : String(appliedAt ?? ""),
        rejected_at: rejectedAt === null ? null : String(rejectedAt ?? ""),
        updated_at: String(updatedAt)
      };
      if (existing) {
        Object.assign(existing, next);
      } else {
        this.jobUserStates.push(next);
      }
      return;
    }
  }

  private queryJobs(sql: string, values: unknown[]): JobRow[] {
    let jobs = [...this.jobs];
    let valueIndex = 0;

    if (sql.includes("is_stale = 0")) {
      jobs = jobs.filter((job) => job.is_stale === 0);
    }

    if (sql.includes("lower(title) LIKE ? OR lower(company) LIKE ?")) {
      const titleLike = String(values[valueIndex++] ?? "").toLowerCase().replaceAll("%", "");
      const companyLike = String(values[valueIndex++] ?? "").toLowerCase().replaceAll("%", "");
      jobs = jobs.filter(
        (job) =>
          job.title.toLowerCase().includes(titleLike) ||
          job.company.toLowerCase().includes(companyLike)
      );
    }

    if (sql.includes("pm_focus = ?")) {
      const pmFocus = String(values[valueIndex++] ?? "");
      jobs = jobs.filter((job) => job.pm_focus === pmFocus);
    }

    if (sql.includes("remote_status = ?")) {
      const remoteStatus = String(values[valueIndex++] ?? "");
      jobs = jobs.filter((job) => job.remote_status === remoteStatus);
    }

    if (sql.includes("company = ?")) {
      const company = String(values[valueIndex++] ?? "");
      jobs = jobs.filter((job) => job.company === company);
    }

    jobs.sort((a, b) => b.date_seen.localeCompare(a.date_seen));

    const limit = Number(values.at(-2) ?? 25);
    const offset = Number(values.at(-1) ?? 0);
    return jobs.slice(offset, offset + limit);
  }

  private queryTrackedJobs(sql: string, values: unknown[]): Array<Record<string, unknown>> {
    const [userId] = values;
    let states = this.jobUserStates.filter((state) => state.user_id === userId);

    if (sql.includes("job_user_states.status = ?")) {
      const status = String(values[1] ?? "");
      states = states.filter((state) => state.status === status);
    }

    if (sql.includes("job_user_states.favorite = 1")) {
      states = states.filter((state) => state.favorite === 1);
    }

    states.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const limit = Number(values.at(-2) ?? 25);
    const offset = Number(values.at(-1) ?? 0);
    const selected = states.slice(offset, offset + limit);

    return selected.map((state) => {
      const job = this.jobs.find((entry) => entry.id === state.job_id);
      if (!job) {
        return null;
      }
      return {
        ...job,
        tags: job.tags,
        favorite: state.favorite,
        user_status: state.status,
        notes: state.notes,
        applied_at: state.applied_at,
        rejected_at: state.rejected_at,
        updated_at: state.updated_at
      };
    }).filter(Boolean) as Array<Record<string, unknown>>;
  }
}

function createEnv(db: OwnerMockD1Database): Env {
  return {
    DB: db as unknown as D1Database,
    ADMIN_TOKEN: "test-token",
    SESSION_SECRET: "session-secret",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "JobPull <digest@example.com>",
    PUBLIC_BASE_URL: "https://example.com",
    STALE_THRESHOLD_DAYS: "14"
  };
}

describe("owner workspace", () => {
  let db: OwnerMockD1Database;
  let env: Env;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = new OwnerMockD1Database();
    env = createEnv(db);
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.resend.com/emails")) {
        return new Response(JSON.stringify({ id: "email_123" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response("not mocked", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("claims the board, issues a magic link, and signs the owner in with a cookie", async () => {
    const claimResponse = await worker.fetch(
      new Request("https://example.com/api/auth/claim", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ email: "owner@example.com" })
      }),
      env
    );

    expect(claimResponse.status).toBe(200);
    expect(db.boardState.owner_user_id).toBeTruthy();
    expect(db.magicLinks).toHaveLength(1);

    const emailPayload = JSON.parse(fetchMock.mock.calls[0]?.[1] instanceof Request ? "{}" : String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { text?: string; html?: string };
    const signInUrl = new URL((emailPayload.text ?? emailPayload.html ?? "").match(/https:\/\/[^\s]+/)?.[0] ?? "");

    const verifyResponse = await worker.fetch(
      new Request(signInUrl.toString(), { method: "GET" }),
      env
    );

    expect(verifyResponse.status).toBe(302);
    expect(verifyResponse.headers.get("set-cookie")).toContain("jobpull_session=");

    const sessionCookie = verifyResponse.headers.get("set-cookie") ?? "";
    const meResponse = await worker.fetch(
      new Request("https://example.com/api/me", {
        headers: {
          cookie: sessionCookie.split(";")[0] ?? ""
        }
      }),
      env
    );

    expect(meResponse.status).toBe(200);
    const mePayload = await meResponse.json() as { user: { email: string }; boardState: { visibility: string } };
    expect(mePayload.user.email).toBe("owner@example.com");
    expect(mePayload.boardState.visibility).toBe("private");
  });

  it("blocks anonymous board access while private and allows it after publish", async () => {
    const privateJobsResponse = await worker.fetch(new Request("https://example.com/api/jobs"), env);
    expect(privateJobsResponse.status).toBe(401);

    const publishResponse = await worker.fetch(
      new Request("https://example.com/api/admin/board-state", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ visibility: "public" })
      }),
      env
    );
    expect(publishResponse.status).toBe(200);

    const publicJobsResponse = await worker.fetch(new Request("https://example.com/api/jobs"), env);
    expect(publicJobsResponse.status).toBe(200);
  });

  it("stores resume uploads and updates the owner profile", async () => {
    const claimResponse = await worker.fetch(
      new Request("https://example.com/api/auth/claim", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ email: "owner@example.com" })
      }),
      env
    );

    const claimBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { text?: string };
    const signInUrl = new URL((claimBody.text ?? "").match(/https:\/\/[^\s]+/)?.[0] ?? "");
    const verifyResponse = await worker.fetch(new Request(signInUrl.toString()), env);
    const cookie = verifyResponse.headers.get("set-cookie") ?? "";

    const resumeResponse = await worker.fetch(
      new Request("https://example.com/api/me/resume", {
        method: "POST",
        headers: {
          cookie: cookie.split(";")[0] ?? "",
          "content-type": "application/pdf",
          "x-filename": "resume.pdf"
        },
        body: new TextEncoder().encode("%PDF-1.4\nJohn Doe\nowner@example.com\n(555) 555-5555\nSeattle, WA\nLinkedIn https://linkedin.com/in/owner")
      }),
      env
    );

    expect(resumeResponse.status).toBe(200);
    const resumePayload = await resumeResponse.json() as { profile: { email: string | null; full_name: string | null; location: string | null }; resume: { is_active: number } };
    expect(resumePayload.resume.is_active).toBe(1);
    expect(resumePayload.profile.email).toBe("owner@example.com");
    expect(resumePayload.profile.full_name).toBe("John Doe");
    expect(resumePayload.profile.location).toBe("Seattle, WA");
  });

  it("tracks saved and applied jobs for the signed-in owner", async () => {
    const claimResponse = await worker.fetch(
      new Request("https://example.com/api/auth/claim", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ email: "owner@example.com" })
      }),
      env
    );

    const claimBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { text?: string };
    const signInUrl = new URL((claimBody.text ?? "").match(/https:\/\/[^\s]+/)?.[0] ?? "");
    const verifyResponse = await worker.fetch(new Request(signInUrl.toString()), env);
    const cookie = verifyResponse.headers.get("set-cookie") ?? "";

    const stateResponse = await worker.fetch(
      new Request("https://example.com/api/me/jobs/job-1/state", {
        method: "PUT",
        headers: {
          cookie: cookie.split(";")[0] ?? "",
          "content-type": "application/json"
        },
        body: JSON.stringify({ favorite: true, status: "applied", notes: "Applied on company site" })
      }),
      env
    );

    expect(stateResponse.status).toBe(200);
    const statePayload = await stateResponse.json() as { state: { favorite: boolean; status: string; notes: string | null } };
    expect(statePayload.state.favorite).toBe(true);
    expect(statePayload.state.status).toBe("applied");
    expect(statePayload.state.notes).toBe("Applied on company site");

    const jobsResponse = await worker.fetch(
      new Request("https://example.com/api/me/jobs", {
        headers: { cookie: cookie.split(";")[0] ?? "" }
      }),
      env
    );

    expect(jobsResponse.status).toBe(200);
    const jobsPayload = await jobsResponse.json() as { items: Array<{ id: string; state: { status: string } }> };
    expect(jobsPayload.items).toHaveLength(1);
    expect(jobsPayload.items[0]?.id).toBe("job-1");
    expect(jobsPayload.items[0]?.state.status).toBe("applied");
  });
});
