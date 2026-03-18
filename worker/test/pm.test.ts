import { describe, expect, it } from "vitest";
import { inferRemoteStatus, isTargetRole, shouldKeepForRemoteBoard } from "../src/lib/classify";

describe("role detection (config-driven)", () => {
  it("keeps true PM leadership and IC titles", () => {
    expect(isTargetRole("Senior Product Manager")).toBe(true);
    expect(isTargetRole("Director of Product")).toBe(true);
    expect(isTargetRole("Product Owner")).toBe(true);
  });

  it("rejects adjacent non-PM roles", () => {
    expect(isTargetRole("Software Engineer, Consumer Apps", "Work closely with product managers")).toBe(false);
    expect(isTargetRole("Product Marketing Manager")).toBe(false);
    expect(isTargetRole("Project Manager")).toBe(false);
  });

  it("supports PM abbreviation fallback with product context", () => {
    expect(isTargetRole("PM, Growth", "Lead product strategy and roadmap")).toBe(true);
    expect(isTargetRole("PM", "Own project timelines and stakeholder updates")).toBe(false);
  });
});

describe("remote board filtering", () => {
  it("keeps only remote-friendly statuses", () => {
    expect(shouldKeepForRemoteBoard("remote")).toBe(true);
    expect(shouldKeepForRemoteBoard("hybrid")).toBe(true);
    expect(shouldKeepForRemoteBoard("unknown")).toBe(false);
    expect(shouldKeepForRemoteBoard("onsite")).toBe(false);
  });

  it("infers remote status from common wording", () => {
    expect(inferRemoteStatus("Worldwide")).toBe("remote");
    expect(inferRemoteStatus("Remote - US")).toBe("remote");
    expect(inferRemoteStatus("NYC", "Hybrid 2 days/week")).toBe("hybrid");
  });
});
