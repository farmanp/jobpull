import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";

interface MockJobRow {
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
}

interface MockSourceRow {
  id: string;
  enabled: number;
}

interface MockCrawlRunRow {
  finished_at: string;
  status: string;
  jobs_added: number;
}

interface MockBoardStateRow {
  id: string;
  owner_user_id: string | null;
  visibility: "private" | "public";
  claimed_at: string | null;
  published_at: string | null;
}

class MockPreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: MockD1Database,
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
    return Promise.resolve({ success: true });
  }
}

class MockD1Database {
  boardConfigRows: Array<{ key: string; value: string }> = [];
  jobs: MockJobRow[] = [];
  sources: MockSourceRow[] = [];
  crawlRuns: MockCrawlRunRow[] = [];
  boardState: MockBoardStateRow = {
    id: "singleton",
    owner_user_id: null,
    visibility: "public",
    claimed_at: null,
    published_at: null
  };

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

    if (sql.includes("SELECT COUNT(*) as total FROM jobs WHERE is_stale = 0")) {
      return { total: this.jobs.filter((job) => job.is_stale === 0).length } as T;
    }

    if (sql.includes("SELECT COUNT(*) as total FROM jobs WHERE is_stale = 1")) {
      return { total: this.jobs.filter((job) => job.is_stale === 1).length } as T;
    }

    if (sql.includes("SELECT COUNT(*) as total FROM jobs")) {
      return { total: this.jobs.length } as T;
    }

    if (sql.includes("SELECT COUNT(*) as total FROM sources WHERE enabled = 1")) {
      return { total: this.sources.filter((source) => source.enabled === 1).length } as T;
    }

    if (sql.includes("SELECT finished_at, status, jobs_added FROM crawl_runs")) {
      const latest = [...this.crawlRuns].sort((a, b) => b.finished_at.localeCompare(a.finished_at))[0] ?? null;
      return latest as T | null;
    }

    if (sql.includes("FROM jobs WHERE id = ?")) {
      const [jobId] = values;
      return (this.jobs.find((job) => job.id === jobId) ?? null) as T | null;
    }

    throw new Error(`Unhandled first() SQL in test mock: ${sql}`);
  }

  async all<T>(sql: string, values: unknown[]): Promise<{ results: T[] }> {
    if (sql.includes("SELECT key, value FROM board_config")) {
      return { results: this.boardConfigRows as T[] };
    }

    if (sql.includes("FROM jobs")) {
      return { results: this.queryJobs(sql, values) as T[] };
    }

    throw new Error(`Unhandled all() SQL in test mock: ${sql}`);
  }

  private queryJobs(sql: string, values: unknown[]): MockJobRow[] {
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
}

function createEnv(db: MockD1Database): Env {
  return {
    DB: db as unknown as D1Database,
    ADMIN_TOKEN: "test-token",
    STALE_THRESHOLD_DAYS: "14",
  };
}

describe("worker API stale job behavior", () => {
  let db: MockD1Database;
  let env: Env;

  beforeEach(() => {
    db = new MockD1Database();
    env = createEnv(db);
    db.jobs = [
      {
        id: "fresh-job",
        title: "Senior Product Manager",
        company: "Acme",
        location: "Remote",
        remote_status: "remote",
        url: "https://jobs.example.com/fresh",
        source: "ashby",
        date_posted: "2026-03-10T00:00:00.000Z",
        date_seen: "2026-03-16T00:00:00.000Z",
        description: "Fresh role",
        tags: JSON.stringify(["remote"]),
        pm_focus: "growth",
        is_stale: 0,
      },
      {
        id: "stale-job",
        title: "Director of Product",
        company: "Acme",
        location: "Remote",
        remote_status: "remote",
        url: "https://jobs.example.com/stale",
        source: "recruitee",
        date_posted: "2026-02-01T00:00:00.000Z",
        date_seen: "2026-02-10T00:00:00.000Z",
        description: "Stale role",
        tags: JSON.stringify(["remote"]),
        pm_focus: "core",
        is_stale: 1,
      },
    ];
    db.sources = [
      { id: "starter-remoteok", enabled: 1 },
      { id: "starter-remotive", enabled: 1 },
      { id: "disabled-source", enabled: 0 },
    ];
    db.crawlRuns = [
      {
        finished_at: "2026-03-16T12:00:00.000Z",
        status: "success",
        jobs_added: 9,
      },
    ];
  });

  it("hides stale jobs from the default jobs listing", async () => {
    const response = await worker.fetch(new Request("https://example.com/api/jobs"), env);
    const payload = await response.json() as { items: MockJobRow[] };

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].id).toBe("fresh-job");
    expect(payload.items[0].is_stale).toBe(0);
  });

  it("includes stale jobs when include_stale=1 is set and keeps stale detail lookups accessible", async () => {
    const listResponse = await worker.fetch(
      new Request("https://example.com/api/jobs?include_stale=1"),
      env
    );
    const listPayload = await listResponse.json() as { items: MockJobRow[] };

    expect(listPayload.items.map((job) => job.id)).toEqual(["fresh-job", "stale-job"]);

    const detailResponse = await worker.fetch(
      new Request("https://example.com/api/jobs/stale-job"),
      env
    );
    const detailPayload = await detailResponse.json() as MockJobRow;

    expect(detailResponse.status).toBe(200);
    expect(detailPayload.id).toBe("stale-job");
    expect(detailPayload.is_stale).toBe(1);
  });

  it("reports visible and stale job counts in stats", async () => {
    const response = await worker.fetch(new Request("https://example.com/api/stats"), env);
    const payload = await response.json() as {
      totalJobs: number;
      visibleJobs: number;
      staleJobs: number;
      activeSources: number;
      staleThresholdDays: number;
      lastCrawl: { jobsAdded: number; status: string } | null;
    };

    expect(response.status).toBe(200);
    expect(payload.totalJobs).toBe(2);
    expect(payload.visibleJobs).toBe(1);
    expect(payload.staleJobs).toBe(1);
    expect(payload.activeSources).toBe(2);
    expect(payload.staleThresholdDays).toBe(14);
    expect(payload.lastCrawl).toMatchObject({ status: "success", jobsAdded: 9 });
  });

  it("allows browsing an unclaimed private board when ALLOW_UNCLAIMED_BROWSE is enabled", async () => {
    db.boardState = {
      id: "singleton",
      owner_user_id: null,
      visibility: "private",
      claimed_at: null,
      published_at: null
    };
    env = {
      ...env,
      ALLOW_UNCLAIMED_BROWSE: "true"
    };

    const metaResponse = await worker.fetch(new Request("https://example.com/api/meta"), env);
    const jobsResponse = await worker.fetch(new Request("https://example.com/api/jobs"), env);

    expect(metaResponse.status).toBe(200);
    expect(jobsResponse.status).toBe(200);

    const metaPayload = await metaResponse.json() as {
      viewerCanBrowse: boolean;
      auth: { claimRequired: boolean; magicLinkDelivery: string };
    };

    expect(metaPayload.viewerCanBrowse).toBe(true);
    expect(metaPayload.auth.claimRequired).toBe(false);
  });

  it("returns pack and source-template metadata for the admin UI", async () => {
    const packsResponse = await worker.fetch(
      new Request("https://example.com/api/admin/packs", {
        headers: { authorization: "Bearer test-token" }
      }),
      env
    );
    const templatesResponse = await worker.fetch(
      new Request("https://example.com/api/admin/source-templates", {
        headers: { authorization: "Bearer test-token" }
      }),
      env
    );

    expect(packsResponse.status).toBe(200);
    expect(templatesResponse.status).toBe(200);

    const packsPayload = await packsResponse.json() as {
      packs: Array<{
        key: string;
        starterSources: Array<{ id: string }>;
        review: { tagline: string; remoteOnly: boolean; focusAreas: string[]; boardTags: string[] };
      }>;
    };
    const templatesPayload = await templatesResponse.json() as { templates: Array<{ type: string; fields: Array<{ key: string }> }> };

    expect(packsPayload.packs.map((pack) => pack.key)).toEqual(["product", "engineering", "design", "gtm"]);
    expect(packsPayload.packs[0]?.starterSources[0]?.id).toBe("starter-remoteok");
    expect(packsPayload.packs[0]?.review.tagline).toBeTruthy();
    expect(Array.isArray(packsPayload.packs[0]?.review.focusAreas)).toBe(true);
    expect(templatesPayload.templates.map((template) => template.type)).toContain("ashby");
    expect(templatesPayload.templates.find((template) => template.type === "remote_json")?.fields.map((field) => field.key))
      .toContain("assumeRemote");
  });

  it("reports the runtime as read-only on the cloudflare worker path", async () => {
    const runtimeResponse = await worker.fetch(
      new Request("https://example.com/api/admin/runtime", {
        headers: { authorization: "Bearer test-token" }
      }),
      env
    );

    expect(runtimeResponse.status).toBe(200);
    const runtimePayload = await runtimeResponse.json() as {
      platform: string;
      schedule: string;
      scheduleEditable: boolean;
      staleThresholdDays: number;
      editableFields: string[];
      checks: {
        schedulerAvailable: boolean;
        adminTokenConfigured: boolean;
        runtimeStorageAvailable: boolean;
        databaseConnected: boolean;
      };
      externalSteps: string[];
    };

    expect(runtimePayload.platform).toBe("cloudflare");
    expect(runtimePayload.schedule).toBe("0 7 * * *");
    expect(runtimePayload.scheduleEditable).toBe(false);
    expect(runtimePayload.staleThresholdDays).toBe(14);
    expect(runtimePayload.editableFields).toEqual([]);
    expect(runtimePayload.checks).toEqual({
      schedulerAvailable: true,
      adminTokenConfigured: true,
      runtimeStorageAvailable: false,
      databaseConnected: true
    });
    expect(runtimePayload.externalSteps[0]).toContain("Current cron schedule");
    expect(runtimePayload.externalSteps[1]).toContain("Worker cron trigger");
  });

  it("rejects runtime schedule edits on the cloudflare worker path", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/admin/runtime", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({ schedule: "30 5 * * *" })
      }),
      env
    );

    expect(response.status).toBe(409);
    const payload = await response.json() as { error: string };
    expect(payload.error).toContain("Cloudflare cron trigger");
  });
});
