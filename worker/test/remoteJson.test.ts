import { describe, expect, it } from "vitest";
import { parseRemoteJsonItems } from "../src/fetchers/remoteJson";
import type { SourceRecord } from "../src/types";

const source: SourceRecord = {
  id: "test",
  type: "remote_json",
  name: "Test Source",
  base_url: "https://example.com",
  config_json: "{\"url\":\"https://example.com/api\"}",
  enabled: 1
};

describe("remote_json parsing", () => {
  it("maps remotive-like items and preserves explicit remote status", () => {
    const out = parseRemoteJsonItems(
      [
        {
          title: "Senior Product Manager",
          company_name: "Acme",
          candidate_required_location: "US",
          url: "https://jobs.example.com/1",
          description: "Remote role",
          publication_date: "2026-02-01T00:00:00Z",
          remote: true
        }
      ],
      source,
      "remotive"
    );

    expect(out).toHaveLength(1);
    expect(out[0].company).toBe("Acme");
    expect(out[0].source).toBe("remotive");
    expect(out[0].remote_status).toBe("remote");
    expect(out[0].title).toBe("Senior Product Manager");
  });

  it("rejects non-PM titles", () => {
    const out = parseRemoteJsonItems(
      [
        {
          title: "Software Engineer",
          company_name: "Acme",
          location: "Remote",
          url: "https://jobs.example.com/2",
          description: "Build backend services"
        }
      ],
      source
    );

    expect(out).toHaveLength(0);
  });

  it("maps working-nomads style _source records", () => {
    const out = parseRemoteJsonItems(
      [
        {
          title: "Product Manager - Core Product",
          company: "ExampleCo",
          apply_url: "https://jobs.example.com/apply/123",
          description: "Remote-first team",
          locations: ["Worldwide"],
          pub_date: "2026-02-10T00:00:00Z"
        }
      ],
      source,
      "workingnomads",
      true
    );

    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://jobs.example.com/apply/123");
    expect(out[0].remote_status).toBe("remote");
    expect(out[0].source).toBe("workingnomads");
  });
});
