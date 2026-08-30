import { describe, expect, it } from "vitest";
import { planRoleSummaryRefresh, takeRoleSummaryRefreshBatch } from "./roleSummaryRefresh";

describe("planRoleSummaryRefresh", () => {
  it("keeps manual summaries and queues missing, Gemini, default, and unlabelled summaries", () => {
    const plan = planRoleSummaryRefresh([
      { id: "manual", lastUpdatedAt: 1, isActive: true },
      { id: "gemini", lastUpdatedAt: 1, isActive: true },
      { id: "default", lastUpdatedAt: 1, isActive: true },
      { id: "unlabelled", lastUpdatedAt: 1, isActive: true },
      { id: "missing", lastUpdatedAt: 1, isActive: true },
      { id: "closed", lastUpdatedAt: 1, isActive: false },
    ], [
      { jobId: "manual", jobLastUpdatedAt: 1, status: "ready", origin: "manual" },
      { jobId: "gemini", jobLastUpdatedAt: 1, status: "ready", origin: "gemini" },
      { jobId: "default", jobLastUpdatedAt: 1, status: "ready", origin: "default" },
      { jobId: "unlabelled", jobLastUpdatedAt: 1, status: "ready" },
    ]);

    expect(plan).toEqual({ jobIds: ["gemini", "default", "unlabelled", "missing"], skippedManual: 1, skippedInProgress: 0 });
  });

  it("does not schedule a summary that is already queued or generating", () => {
    const plan = planRoleSummaryRefresh([
      { id: "queued", lastUpdatedAt: 1, isActive: true },
      { id: "generating", lastUpdatedAt: 1, isActive: true },
    ], [
      { jobId: "queued", jobLastUpdatedAt: 1, status: "queued" },
      { jobId: "generating", jobLastUpdatedAt: 1, status: "generating" },
    ]);

    expect(plan).toEqual({ jobIds: [], skippedManual: 0, skippedInProgress: 2 });
  });

  it("limits each refresh batch to 20 roles", () => {
    expect(takeRoleSummaryRefreshBatch(["one", "two", "three"])).toEqual(["one", "two", "three"]);
    expect(takeRoleSummaryRefreshBatch(Array.from({ length: 21 }, (_, index) => String(index)))).toHaveLength(20);
    expect(takeRoleSummaryRefreshBatch(Array.from({ length: 21 }, (_, index) => String(index)), 99)).toHaveLength(20);
  });
});
