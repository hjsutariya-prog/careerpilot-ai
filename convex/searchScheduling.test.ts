import { describe, expect, it } from "vitest";
import { nextRunAtForIst, planFirstSearch } from "./searchScheduling";

describe("job search scheduling", () => {
  it("queues the first search immediately after setup", () => {
    expect(planFirstSearch({ hasResume: true, hasPreferences: true, hasPreviousSearch: false })).toEqual({ kind: "first", delayMs: 0 });
    expect(planFirstSearch({ hasResume: false, hasPreferences: true, hasPreviousSearch: false })).toBeNull();
    expect(planFirstSearch({ hasResume: true, hasPreferences: true, hasPreviousSearch: true })).toBeNull();
  });

  it("converts a daily India time to the next UTC timestamp", () => {
    expect(nextRunAtForIst("10:00", Date.parse("2026-08-30T04:00:00.000Z"))).toBe(Date.parse("2026-08-30T04:30:00.000Z"));
    expect(nextRunAtForIst("10:00", Date.parse("2026-08-30T05:00:00.000Z"))).toBe(Date.parse("2026-08-31T04:30:00.000Z"));
  });
});
