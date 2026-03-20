import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SettingsPanel } from "./SettingsPanel";

global.fetch = vi.fn();

function createMockResponse(data: unknown) {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(data)
  } as Response;
}

function getNavButton(label: string): HTMLButtonElement {
  const button = screen
    .getAllByRole("button")
    .find((candidate) => candidate.textContent?.trim().startsWith(label));

  if (!button) {
    throw new Error(`Could not find nav button for ${label}`);
  }

  return button as HTMLButtonElement;
}

function mockFetchAll(overrides?: {
  jobs?: unknown;
  meta?: unknown;
  stats?: unknown;
  runtime?: unknown;
  boardState?: unknown;
  notifications?: unknown;
  sources?: unknown;
  packs?: unknown;
  templates?: unknown;
}) {
  (global.fetch as unknown as { mockImplementation: (value: (url: string, init?: RequestInit) => Promise<Response>) => void }).mockImplementation(
    (url: string, init?: RequestInit) => {
      if (url.includes("/api/meta")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.meta ?? {
              boardName: "Test Board",
              tagline: "Test tagline",
              remoteOnly: true,
              focusCategories: ["growth", "technical"]
            }
          )
        );
      }
      if (url.includes("/api/stats")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.stats ?? {
              totalJobs: 42,
              visibleJobs: 40,
              staleJobs: 2,
              activeSources: 3,
              staleThresholdDays: 14,
              lastCrawl: { finishedAt: new Date().toISOString(), status: "success", jobsAdded: 5 }
            }
          )
        );
      }
      if (url.includes("/api/jobs")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.jobs ?? {
              items: [
                {
                  id: "1",
                  title: "Senior PM",
                  company: "Acme",
                  location: "Remote",
                  remote_status: "remote",
                  url: "https://example.com/job1",
                  pm_focus: "growth",
                  date_seen: "2025-01-01",
                  tags: [],
                  description: "Build growth loop."
                },
                {
                  id: "2",
                  title: "Technical PM",
                  company: "Beta",
                  location: "New York",
                  remote_status: "hybrid",
                  url: "https://example.com/job2",
                  pm_focus: "technical",
                  date_seen: "2025-01-02",
                  tags: [],
                  description: "Manage API platform."
                }
              ]
            }
          )
        );
      }
      if (url.includes("/api/admin/config")) {
        return Promise.resolve(
          createMockResponse({
            boardName: "Remote PM Jobs",
            tagline: "Remote-first Product Management roles, updated daily",
            contactEmail: "you@example.com",
            remoteOnly: true,
            titleIncludePatterns: [],
            titleExcludePatterns: [],
            descriptionFallback: null,
            focusCategories: [],
            tagKeywords: []
          })
        );
      }
      if (url.includes("/api/admin/sources")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.sources ?? {
              sources: [
                {
                  id: "starter-remoteok",
                  type: "remote_json",
                  name: "RemoteOK",
                  base_url: "",
                  config_json: "{}",
                  enabled: 1
                }
              ]
            }
          )
        );
      }
      if (url.includes("/api/admin/packs")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.packs ?? {
              packs: [
                {
                  key: "product",
                  label: "Product",
                  summary: "Remote-first PM roles.",
                  providerRecommendations: [],
                  starterSources: [{ id: "starter-remoteok", type: "remote_json", name: "RemoteOK Product" }],
                  review: {
                    tagline: "Remote-first product roles",
                    remoteOnly: true,
                    includeKeywords: ["product manager", "group product manager"],
                    excludeKeywords: ["designer"],
                    focusAreas: ["growth", "platform"],
                    boardTags: ["b2b", "remote"]
                  }
                }
              ]
            }
          )
        );
      }
      if (url.includes("/api/admin/source-templates")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.templates ?? {
              templates: [
                {
                  type: "ashby",
                  label: "Ashby",
                  summary: "Public Ashby API",
                  fields: [
                    { key: "companyName", label: "Company name", kind: "text", required: true },
                    { key: "organizationSlug", label: "Organization slug", kind: "text", required: true }
                  ]
                }
              ]
            }
          )
        );
      }
      if (url.includes("/api/admin/runtime")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.runtime ?? {
              platform: "cloudflare",
              schedule: "0 7 * * *",
              scheduleEditable: false,
              staleThresholdDays: 14,
              lastCrawl: null,
              editableFields: [],
              checks: {
                schedulerAvailable: true,
                adminTokenConfigured: true,
                runtimeStorageAvailable: false,
                databaseConnected: true
              },
              externalSteps: ["Update the Cloudflare Worker cron trigger in deployment config and redeploy."]
            }
          )
        );
      }
      if (url.includes("/api/admin/board-state")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.boardState ?? {
              id: "singleton",
              owner_user_id: "owner_1",
              visibility: "private",
              claimed_at: new Date().toISOString(),
              published_at: null
            }
          )
        );
      }
      if (url.includes("/api/admin/notifications/test") && init?.method === "POST") {
        return Promise.resolve(
          createMockResponse({
            ok: true,
            message: "Sent a test digest to operator@example.com."
          })
        );
      }
      if (url.includes("/api/admin/notifications")) {
        return Promise.resolve(
          createMockResponse(
            overrides?.notifications ?? {
              provider: {
                ready: false,
                service: "resend",
                fromEmail: null,
                replyToEmail: null,
                publicBaseUrl: null,
                issues: ["EMAIL_FROM is missing."]
              },
              subscribers: {
                total: 0,
                pending: 0,
                active: 0,
                unsubscribed: 0
              },
              lastRun: null,
              publicSignupUrl: null
            }
          )
        );
      }
      return Promise.resolve(createMockResponse({}));
    }
  );
}

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("lands first-run admins in the guided setup flow", async () => {
    mockFetchAll({
      sources: { sources: [] },
      stats: {
        totalJobs: 0,
        visibleJobs: 0,
        staleJobs: 0,
        activeSources: 0,
        staleThresholdDays: 14,
        lastCrawl: null
      },
      runtime: {
        platform: "cloudflare",
        schedule: "0 7 * * *",
        scheduleEditable: false,
        staleThresholdDays: 14,
        lastCrawl: null,
        editableFields: [],
        checks: {
          schedulerAvailable: true,
          adminTokenConfigured: true,
          runtimeStorageAvailable: false,
          databaseConnected: true
        },
        externalSteps: ["Update the Cloudflare Worker cron trigger in deployment config and redeploy."]
      }
    });

    render(<SettingsPanel apiBase="" />);

    await waitFor(() => {
      expect(screen.getByText("Guided setup")).toBeInTheDocument();
    });

    expect(screen.getByText(/setup progress/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose starter pack" })).toBeInTheDocument();
    expect(screen.getAllByText("Connect sources").length).toBeGreaterThan(0);
    expect(getNavButton("Deployment")).toBeInTheDocument();
  });

  it("shows a pack preview before the starter pack is applied", async () => {
    mockFetchAll({
      sources: { sources: [] },
      stats: {
        totalJobs: 0,
        visibleJobs: 0,
        staleJobs: 0,
        activeSources: 0,
        staleThresholdDays: 14,
        lastCrawl: null
      },
      runtime: {
        platform: "cloudflare",
        schedule: "0 7 * * *",
        scheduleEditable: false,
        staleThresholdDays: 14,
        lastCrawl: null,
        editableFields: [],
        checks: {
          schedulerAvailable: true,
          adminTokenConfigured: true,
          runtimeStorageAvailable: false,
          databaseConnected: true
        },
        externalSteps: ["Update the Cloudflare Worker cron trigger in deployment config and redeploy."]
      }
    });

    render(<SettingsPanel apiBase="" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Product preview" })).toBeInTheDocument();
    });

    expect(screen.getByText("Remote-first product roles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review and continue/i })).toBeInTheDocument();
  });

  it("shows read-only deployment guidance for cloudflare runtimes", async () => {
    mockFetchAll({
      runtime: {
        platform: "cloudflare",
        schedule: "0 7 * * *",
        scheduleEditable: false,
        staleThresholdDays: 14,
        lastCrawl: {
          finishedAt: new Date().toISOString(),
          status: "success",
          jobsAdded: 3
        },
        editableFields: [],
        checks: {
          schedulerAvailable: true,
          adminTokenConfigured: true,
          runtimeStorageAvailable: false,
          databaseConnected: true
        },
        externalSteps: ["Update the Cloudflare Worker cron trigger in deployment config and redeploy."]
      }
    });

    render(<SettingsPanel apiBase="" />);

    await waitFor(() => {
      expect(getNavButton("Deployment")).toBeInTheDocument();
    });

    fireEvent.click(getNavButton("Deployment"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("cloudflare")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0 7 * * *")).toHaveAttribute("readonly");
    expect(screen.getByText("Update the Cloudflare Worker cron trigger in deployment config and redeploy.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save schedule/i })).not.toBeInTheDocument();
  });

  it("allows schedule editing on server runtimes", async () => {
    mockFetchAll({
      runtime: {
        platform: "server",
        schedule: "0 7 * * *",
        scheduleEditable: true,
        staleThresholdDays: 14,
        lastCrawl: {
          finishedAt: new Date().toISOString(),
          status: "success",
          jobsAdded: 3
        },
        editableFields: ["schedule"],
        checks: {
          schedulerAvailable: true,
          adminTokenConfigured: true,
          runtimeStorageAvailable: true,
          databaseConnected: true
        },
        externalSteps: ["The Node runtime manages schedule edits from this UI."]
      }
    });

    render(<SettingsPanel apiBase="" />);

    await waitFor(() => {
      expect(getNavButton("Deployment")).toBeInTheDocument();
    });

    fireEvent.click(getNavButton("Deployment"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Runtime" })).toBeInTheDocument();
    });

    const editableSettingsCard = screen.getByRole("heading", { name: "Can change here" }).closest(".admin-card");
    if (!editableSettingsCard) {
      throw new Error("Editable settings card not found");
    }

    const scheduleInput = within(editableSettingsCard).getByDisplayValue("0 7 * * *");
    expect(scheduleInput).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: /save schedule/i })).toBeInTheDocument();
  });

  it("shows notification readiness and sends a test digest from admin", async () => {
    mockFetchAll({
      notifications: {
        provider: {
          ready: true,
          service: "resend",
          fromEmail: "JobPull <digest@example.com>",
          replyToEmail: "support@example.com",
          publicBaseUrl: "https://jobs.example.com",
          issues: []
        },
        subscribers: {
          total: 5,
          pending: 1,
          active: 3,
          unsubscribed: 1
        },
        lastRun: {
          id: "run_1",
          kind: "digest",
          status: "sent",
          recipientsTargeted: 3,
          recipientsSent: 3,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          errorCount: 0,
          crawlRunId: "crawl_1"
        },
        publicSignupUrl: "https://jobs.example.com"
      }
    });

    render(<SettingsPanel apiBase="" />);

    await waitFor(() => {
      expect(getNavButton("Notifications")).toBeInTheDocument();
    });

    fireEvent.click(getNavButton("Notifications"));

    await waitFor(() => {
      expect(screen.getByText(/email delivery is ready/i)).toBeInTheDocument();
    });

    expect(screen.getByText("https://jobs.example.com")).toBeInTheDocument();
    const activeStat = screen.getByText("Active").closest(".admin-stat-card");
    if (!activeStat) {
      throw new Error("Active subscriber stat not found");
    }
    expect(within(activeStat).getByText("3")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/test email address/i), {
      target: { value: "operator@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: /send test digest/i }));

    expect(await screen.findByText(/sent a test digest to operator@example.com/i)).toBeInTheDocument();
  });
});
