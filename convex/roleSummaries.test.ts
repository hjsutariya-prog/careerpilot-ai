import { describe, expect, it } from "vitest";
import { createListingRoleSummary, interactionOutputText, parseGeminiRoleSummary } from "./roleSummaries";

describe("parseGeminiRoleSummary", () => {
  it("creates a structured fallback from facts in a listing without calling an AI provider", () => {
    expect(createListingRoleSummary({
      title: "Backend Engineer",
      companyName: "Example Co",
      locationLabel: "India",
      skills: ["Go", "PostgreSQL"],
      description: "About the role. You will build reliable backend services. You will work with product and design partners. Requirements include experience with Go and PostgreSQL.",
    })).toEqual({
      summary: "Backend Engineer at Example Co is a role based in India. The listing focuses on Go, PostgreSQL.",
      responsibilities: [
        "You will build reliable backend services.",
        "You will work with product and design partners.",
        "Requirements include experience with Go and PostgreSQL.",
      ],
      skills: ["Go", "PostgreSQL"],
      suitableFor: "It suits candidates whose experience matches the stated role requirements, including Go, PostgreSQL.",
    });
  });

  it("keeps a short, safe role summary structure", () => {
    expect(parseGeminiRoleSummary(JSON.stringify({
      summary: "Build product analytics features for a growing platform.",
      responsibilities: ["Own dashboard improvements", "Work with product managers"],
      skills: ["SQL", "React"],
      suitableFor: "Someone with practical product analytics experience.",
    }))).toEqual({
      summary: "Build product analytics features for a growing platform.",
      responsibilities: ["Own dashboard improvements", "Work with product managers"],
      skills: ["SQL", "React"],
      suitableFor: "Someone with practical product analytics experience.",
    });
  });

  it("rejects incomplete or invalid AI output", () => {
    expect(parseGeminiRoleSummary("not json")).toBeNull();
    expect(parseGeminiRoleSummary(JSON.stringify({ summary: "Only this" }))).toBeNull();
  });

  it("reads text from Gemini's REST interaction steps", () => {
    expect(interactionOutputText({ steps: [
      { type: "user_input", content: [{ type: "text", text: "Summarize this" }] },
      { type: "model_output", content: [{ type: "text", text: '{"summary":"A role"}' }] },
    ] })).toBe('{"summary":"A role"}');
  });
});
