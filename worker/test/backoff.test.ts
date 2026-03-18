import { describe, expect, it } from "vitest";
import { calculateBackoffMs } from "../src/lib/backoff";

describe("backoff", () => {
  it("grows exponentially and caps", () => {
    const zeroJitter = () => 0;
    expect(calculateBackoffMs(0, { randomFn: zeroJitter })).toBe(1000);
    expect(calculateBackoffMs(1, { randomFn: zeroJitter })).toBe(2000);
    expect(calculateBackoffMs(2, { randomFn: zeroJitter })).toBe(4000);
    expect(calculateBackoffMs(10, { randomFn: zeroJitter })).toBe(30000);
  });
});
