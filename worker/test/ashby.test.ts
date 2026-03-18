import { describe, expect, it, vi } from "vitest";
import { fetchSourceJobs } from "../src/crawler";
import { fetchAshbyJobs } from "../src/fetchers/ashby";
import type { SourceRecord } from "../src/types";

const ashbySource: SourceRecord = {
  id: "ashby-openai",
  type: "ashby",
  name: "OpenAI Ashby",
  base_url: "https://api.ashbyhq.com",
  config_json: JSON.stringify({ organizationSlug: "openai" }),
  enabled: 1
};

const ashbyPayload = JSON.stringify({
  jobs: [
    {
      title: "Senior Product Manager",
      location: "San Francisco, CA",
      publishedAt: "2026-03-01T12:00:00Z",
      isRemote: true,
      workplaceType: "remote",
      jobUrl: "https://jobs.ashbyhq.com/openai/abc123",
      descriptionHtml: "<p>Own roadmap &amp; platform strategy.</p>"
    },
    {
      title: "Software Engineer",
      location: "Remote",
      publishedAt: "2026-03-02T12:00:00Z",
      isRemote: true,
      workplaceType: "remote",
      jobUrl: "https://jobs.ashbyhq.com/openai/def456",
      descriptionHtml: "<p>Build backend systems.</p>"
    }
  ]
});

function createClient(text: string) {
  return {
    fetchText: vi.fn().mockResolvedValue({ status: 200, text })
  } as any;
}

describe("ashby fetcher", () => {
  it("maps public job board responses and normalizes descriptions to plain text", async () => {
    const jobs = await fetchAshbyJobs(ashbySource, createClient(ashbyPayload));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: "Senior Product Manager",
      company: "OpenAI",
      location: "San Francisco, CA",
      source: "ashby",
      remote_status: "remote",
      url: "https://jobs.ashbyhq.com/openai/abc123"
    });
    expect(jobs[0].description).toBe("Own roadmap & platform strategy.");
  });

  it("dispatches through crawler source routing", async () => {
    const jobs = await fetchSourceJobs(ashbySource, createClient(ashbyPayload));

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe("ashby");
  });
});
