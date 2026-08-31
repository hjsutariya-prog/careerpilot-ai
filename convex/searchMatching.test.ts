import { describe, expect, it } from "vitest";
import { getLiveSuggestions } from "./searchMatching";

const preferences = {
  roles: ["Backend Developer"],
  skills: "TypeScript, APIs, AWS",
  cities: ["Bengaluru"],
  workPreferences: ["Hybrid", "On-site"],
  companiesToAvoid: "",
};

const jobs = [
  { id: "job-a", title: "Backend Developer", companyName: "Company A", cities: ["Bengaluru"], locationLabel: "Bengaluru, India", skills: ["TypeScript", "AWS"], description: "Build APIs", lastUpdatedAt: 2 },
  { id: "job-b", title: "Frontend Developer", companyName: "Company B", cities: ["Bengaluru"], locationLabel: "Bengaluru, India", skills: ["React"], description: "Build UI", lastUpdatedAt: 3 },
];

describe("getLiveSuggestions", () => {
  it("puts direct role matches ahead of related roles", () => {
    expect(getLiveSuggestions(preferences, jobs).map((job) => job.id)).toEqual(["job-a", "job-b"]);
    expect(getLiveSuggestions(preferences, jobs)[1]?.isRelatedMatch).toBe(true);
  });

  it("keeps an India job in another city for resume-based scoring", () => {
    const anotherIndiaCity = { ...jobs[0], id: "job-c", cities: ["Pune"], locationLabel: "Pune, India" };
    expect(getLiveSuggestions(preferences, [anotherIndiaCity])).toHaveLength(1);
  });
});
