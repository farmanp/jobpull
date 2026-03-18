import { describe, expect, it } from "vitest";
import { dedupeJobs } from "../src/lib/dedupe";

describe("dedupe", () => {
  it("dedupes by canonical URL and id", () => {
    const base = {
      title: "Product Manager",
      company: "Acme",
      location: "Remote",
      remote_status: "remote" as const,
      source: "greenhouse",
      date_seen: "2026-01-01T00:00:00.000Z",
      description: "",
      tags: [],
      pm_focus: "unknown" as const
    };

    const input = [
      { ...base, id: "1", url: "https://x/jobs/1?utm_source=a" },
      { ...base, id: "1", url: "https://x/jobs/1?utm_source=b" },
      { ...base, id: "2", url: "https://x/jobs/1" },
      { ...base, id: "3", url: "https://x/jobs/2" }
    ];

    const out = dedupeJobs(input);
    expect(out).toHaveLength(2);
    expect(out[0].url).toBe("https://x/jobs/1");
    expect(out[1].url).toBe("https://x/jobs/2");
  });
});
