import { describe, expect, it } from "vitest";
import { greenhouseSources } from "./greenhouseSources";

describe("approved Greenhouse sources", () => {
  it("contains the original sources plus the 17 confirmed India-focused boards", () => {
    const tokens = greenhouseSources.map((source) => source.token);

    expect(greenhouseSources).toHaveLength(27);
    expect(tokens).toEqual(expect.arrayContaining([
      "sigmoid",
      "arcesiumllc",
      "razorpaysoftwareprivatelimited",
      "bluevineindia",
      "tide",
      "openfx",
      "eltropyinc",
    ]));
    expect(tokens).not.toContain("phonepe");
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});
