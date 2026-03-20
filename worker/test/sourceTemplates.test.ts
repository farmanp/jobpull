import { describe, expect, it } from "vitest";
import { buildSourceRecordFromTemplate, sourceRecordToTemplateValues } from "../../shared/sourceTemplates.ts";

describe("source templates", () => {
  it("builds provider-specific payloads from template values", () => {
    const greenhouse = buildSourceRecordFromTemplate("greenhouse", {
      companyName: "Stripe",
      boardToken: "stripe",
      departmentKeywords: "product, platform"
    });

    expect(greenhouse).toMatchObject({
      id: "gh-stripe",
      type: "greenhouse",
      name: "Stripe Greenhouse",
      base_url: "https://boards-api.greenhouse.io",
      enabled: 1
    });
    expect(JSON.parse(greenhouse.config_json)).toEqual({
      boardToken: "stripe",
      departmentKeywords: ["product", "platform"]
    });
  });

  it("round-trips source records back into form values for editing", () => {
    const values = sourceRecordToTemplateValues({
      type: "remote_json",
      name: "Working Nomads Engineering",
      base_url: "https://www.workingnomads.com",
      config_json: JSON.stringify({
        url: "https://www.workingnomads.com/jobsapi/_search?q=title:engineer&size=250",
        sourceLabel: "workingnomads",
        assumeRemote: true
      })
    });

    expect(values).toEqual({
      sourceName: "Working Nomads Engineering",
      url: "https://www.workingnomads.com/jobsapi/_search?q=title:engineer&size=250",
      sourceLabel: "workingnomads",
      assumeRemote: true
    });
  });
});
