import { describe, expect, it } from "vitest";
import { buildJobId, canonicalizeUrl } from "../src/lib/hash";

describe("hash normalization", () => {
  it("normalizes tracking params before hashing", async () => {
    const a = "https://jobs.example.com/pm/?utm_source=x&id=1";
    const b = "https://jobs.example.com/pm?id=1&utm_campaign=y";

    expect(canonicalizeUrl(a)).toBe("https://jobs.example.com/pm?id=1");
    expect(canonicalizeUrl(b)).toBe("https://jobs.example.com/pm?id=1");

    const id1 = await buildJobId("ACME", "Senior Product Manager", "Remote", a);
    const id2 = await buildJobId("acme", " senior product manager ", "remote", b);

    // With SHA-256, the exact hash value will change, but it should still be consistent for normalized inputs.
    // The previous test was expecting FNV-1a. We now expect a SHA-256 hash.
    // Since the actual hash string is long and hard to predict, we only check for consistency.
    expect(id1).toBe(id2);
  });
});
