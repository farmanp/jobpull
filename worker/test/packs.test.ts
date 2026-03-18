import { describe, expect, it } from "vitest";
import { buildPackConfigPatch, buildPackSeedSql, buildPackStarterSources, getRolePack } from "../../scripts/lib/packs";

describe("starter role packs", () => {
  it("returns the product pack with starter sources using stable ids", () => {
    const pack = getRolePack("product");
    const starterSources = buildPackStarterSources("product");

    expect(pack?.label).toBe("Product");
    expect(starterSources.map((source) => source.id)).toEqual([
      "starter-remoteok",
      "starter-remotive",
      "starter-arbeitnow",
      "starter-workingnomads"
    ]);
    expect(JSON.parse(starterSources[3].config_json)).toMatchObject({
      sourceLabel: "workingnomads",
      assumeRemote: true
    });
  });

  it("builds role-specific config patches for non-product packs", () => {
    const engineering = buildPackConfigPatch("engineering");
    const design = buildPackConfigPatch("design");

    expect(engineering.tagline).toContain("engineering");
    expect(engineering.titleIncludePatterns[0].source).toContain("software engineer");
    expect(design.focusCategories.map((category) => category.label)).toContain("systems");
  });

  it("renders SQL seed content with preserved board identity and managed source upserts", () => {
    const sql = buildPackSeedSql("gtm", "Revenue Jobs", "team@example.com");

    expect(sql).toContain("INSERT OR REPLACE INTO board_config");
    expect(sql).toContain("'boardName'");
    expect(sql).toContain("'Revenue Jobs'");
    expect(sql).toContain("'contactEmail'");
    expect(sql).toContain("'team@example.com'");
    expect(sql).toContain("'starter-workingnomads'");
    expect(sql).toContain("RemoteOK GTM");
  });
});
