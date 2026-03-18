import { describe, expect, it, vi } from "vitest";
import { fetchSourceJobs } from "../src/crawler";
import { fetchRecruiteeJobs } from "../src/fetchers/recruitee";
import type { SourceRecord } from "../src/types";

const recruiteeSource: SourceRecord = {
  id: "recruitee-publitas",
  type: "recruitee",
  name: "Publitas Recruitee",
  base_url: "https://publitas.recruitee.com",
  config_json: JSON.stringify({ subdomain: "publitas" }),
  enabled: 1
};

const recruiteePayload = JSON.stringify({
  offers: [
    {
      company_name: "Publitas",
      careers_url: "https://publitas.recruitee.com/o/senior-product-manager",
      careers_apply_url: "https://publitas.recruitee.com/o/senior-product-manager/apply",
      location: "Amsterdam",
      city: "Amsterdam",
      country: "Netherlands",
      remote: true,
      hybrid: false,
      on_site: false,
      created_at: "2026-03-03T12:00:00Z",
      translations: {
        en: {
          title: "Senior Product Manager",
          description: "<p>Lead product strategy for a distributed team.</p>"
        }
      }
    },
    {
      company_name: "Publitas",
      careers_url: "https://publitas.recruitee.com/o/staff-backend-engineer",
      location: "Amsterdam",
      remote: true,
      created_at: "2026-03-03T12:00:00Z",
      translations: {
        en: {
          title: "Staff Backend Engineer",
          description: "<p>Build backend services.</p>"
        }
      }
    }
  ]
});

function createClient(text: string) {
  return {
    fetchText: vi.fn().mockResolvedValue({ status: 200, text })
  } as any;
}

describe("recruitee fetcher", () => {
  it("maps public offers responses and preserves remote flags", async () => {
    const jobs = await fetchRecruiteeJobs(recruiteeSource, createClient(recruiteePayload));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: "Senior Product Manager",
      company: "Publitas",
      location: "Amsterdam",
      source: "recruitee",
      remote_status: "remote",
      url: "https://publitas.recruitee.com/o/senior-product-manager"
    });
    expect(jobs[0].description).toBe("Lead product strategy for a distributed team.");
  });

  it("dispatches through crawler source routing", async () => {
    const jobs = await fetchSourceJobs(recruiteeSource, createClient(recruiteePayload));

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe("recruitee");
  });
});
