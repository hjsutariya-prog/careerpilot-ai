import { describe, expect, it } from "vitest";
import { interactionOutputText, parseGeminiRoleSummary } from "./roleSummaries";

describe("parseGeminiRoleSummary", () => {
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
