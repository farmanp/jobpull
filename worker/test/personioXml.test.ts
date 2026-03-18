import { describe, expect, it, vi } from "vitest";
import { fetchSourceJobs } from "../src/crawler";
import { fetchPersonioXmlJobs } from "../src/fetchers/personioXml";
import type { SourceRecord } from "../src/types";

const personioSource: SourceRecord = {
  id: "personio-ory",
  type: "personio_xml",
  name: "Ory Personio XML",
  base_url: "https://ory.jobs.personio.de",
  config_json: JSON.stringify({ companySlug: "ory", language: "en" }),
  enabled: 1
};

const personioPayload = `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
  <position>
    <id>2334461</id>
    <subcompany>Ory Corp</subcompany>
    <office>Remote</office>
    <additionalOffices>
      <office>Remote (United States)</office>
    </additionalOffices>
    <name>Senior Product Manager</name>
    <jobDescriptions>
      <jobDescription>
        <name>About this Role</name>
        <value><![CDATA[<p>Own product strategy for a remote team.</p>]]></value>
      </jobDescription>
      <jobDescription>
        <name>Key Tasks</name>
        <value><![CDATA[<ul><li><p>Partner with engineering.</p></li></ul>]]></value>
      </jobDescription>
    </jobDescriptions>
    <employmentType>permanent</employmentType>
    <schedule>full-time</schedule>
    <occupation>product</occupation>
    <createdAt>2026-03-04T12:00:00+00:00</createdAt>
  </position>
  <position>
    <id>2334462</id>
    <subcompany>Ory Corp</subcompany>
    <office>Remote</office>
    <name>Staff Engineer</name>
    <jobDescriptions>
      <jobDescription>
        <name>About this Role</name>
        <value><![CDATA[<p>Build platform systems.</p>]]></value>
      </jobDescription>
    </jobDescriptions>
    <createdAt>2026-03-04T12:00:00+00:00</createdAt>
  </position>
</workzag-jobs>`;

function createClient(text: string) {
  return {
    fetchText: vi.fn().mockResolvedValue({ status: 200, text })
  } as any;
}

describe("personio xml fetcher", () => {
  it("maps xml positions into plain-text job candidates and derives detail URLs", async () => {
    const jobs = await fetchPersonioXmlJobs(personioSource, createClient(personioPayload));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: "Senior Product Manager",
      company: "Ory Corp",
      location: "Remote, Remote (United States)",
      source: "personio_xml",
      remote_status: "remote",
      url: "https://ory.jobs.personio.de/job/2334461"
    });
    expect(jobs[0].description).toBe(
      "About this Role\nOwn product strategy for a remote team.\n\nKey Tasks\n- Partner with engineering."
    );
  });

  it("dispatches through crawler source routing", async () => {
    const jobs = await fetchSourceJobs(personioSource, createClient(personioPayload));

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe("personio_xml");
  });
});
