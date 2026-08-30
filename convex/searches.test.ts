import { describe, expect, it } from "vitest";
import { dedupeSuggestionInputs } from "./searches";

describe("dedupeSuggestionInputs", () => {
  it("keeps one suggestion per job and uses the strongest rank", () => {
    expect(dedupeSuggestionInputs([
      { jobId: "job-a", rank: 2, matchScore: 70, matchExplanation: "Related skills", isRelatedMatch: false },
      { jobId: "job-a", rank: 1, matchScore: 80, matchExplanation: "Matches role", isRelatedMatch: false },
      { jobId: "job-b", rank: 3, matchScore: 61, matchExplanation: "Matches city", isRelatedMatch: true },
    ])).toEqual([
      { jobId: "job-a", rank: 1, matchScore: 80, matchExplanation: "Matches role", isRelatedMatch: false },
      { jobId: "job-b", rank: 3, matchScore: 61, matchExplanation: "Matches city", isRelatedMatch: true },
    ]);
  });
});
