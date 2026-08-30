import { describe, expect, it } from "vitest";
import { buildGreenhouseJobsUrl, prepareSuccessfulSourceRefresh } from "./greenhouseRefresh";

const source = { token: "gitlab", companyName: "GitLab" };
const now = Date.parse("2026-08-30T12:00:00Z");

const liveIndiaJob = {
  id: 123,
  title: "Backend Engineer",
  updated_at: "2026-08-29T12:00:00Z",
  absolute_url: "https://job-boards.greenhouse.io/gitlab/jobs/123",
  location: { name: "Bangalore, India" },
  content: "<p>Build cloud APIs with TypeScript.</p>",
};

describe("Greenhouse refresh preparation", () => {
  it("builds the public read-only board URL", () => {
    expect(buildGreenhouseJobsUrl(source)).toBe("https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true");
  });

  it("keeps a fresh India IT job and excludes jobs older than 60 days", () => {
    const prepared = prepareSuccessfulSourceRefresh(source, [
      liveIndiaJob,
      { ...liveIndiaJob, id: 124, updated_at: "2026-06-01T12:00:00Z" },
    ], now, now);

    expect(prepared.recordsFetched).toBe(2);
    expect(prepared.jobs.map((job) => job.externalJobId)).toEqual(["123"]);
    expect(prepared.activeRetained).toBe(1);
  });
});
