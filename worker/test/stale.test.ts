import { describe, expect, it } from "vitest";
import { getStaleCutoffIso, getStaleThresholdDays, shouldMarkJobStale } from "../src/lib/stale";

describe("stale lifecycle helpers", () => {
  it("falls back to the default threshold when env is missing or invalid", () => {
    expect(getStaleThresholdDays(undefined)).toBe(14);
    expect(getStaleThresholdDays("0")).toBe(14);
    expect(getStaleThresholdDays("abc")).toBe(14);
    expect(getStaleThresholdDays("21")).toBe(21);
  });

  it("marks jobs stale when they are older than the cutoff", () => {
    const nowIso = "2026-03-20T00:00:00.000Z";
    expect(getStaleCutoffIso(nowIso, 14)).toBe("2026-03-06T00:00:00.000Z");
    expect(shouldMarkJobStale("2026-03-05T23:59:59.000Z", nowIso, 14)).toBe(true);
    expect(shouldMarkJobStale("2026-03-06T00:00:00.000Z", nowIso, 14)).toBe(false);
  });
});
