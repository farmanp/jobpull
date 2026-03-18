import { describe, expect, it } from "vitest";
import { normalizeDescriptionText } from "../src/lib/text";

describe("normalizeDescriptionText", () => {
  it("strips markup and decodes entities", () => {
    expect(normalizeDescriptionText("<p>Hello &amp; welcome</p><ul><li>Ship it</li></ul>")).toBe(
      "Hello & welcome\n- Ship it"
    );
  });
});
