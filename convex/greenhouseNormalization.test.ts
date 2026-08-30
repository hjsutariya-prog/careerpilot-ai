import { describe, expect, it } from "vitest";
import { normalizeGreenhouseJob } from "./greenhouseNormalization";

const source = { token: "gitlab", companyName: "GitLab" };
const greenhouseJob = {
  id: 123,
  title: "Backend Engineer, Geo Team",
  updated_at: "2026-08-29T12:00:00Z",
  absolute_url: "https://job-boards.greenhouse.io/gitlab/jobs/123",
  location: { name: "Bangalore, India" },
  content: "<p>Build secure distributed software with TypeScript, APIs, and cloud services.</p>",
};

describe("normalizeGreenhouseJob", () => {
  it("keeps a public India software role with a secure application URL", () => {
    expect(normalizeGreenhouseJob(source, greenhouseJob, 1)).toMatchObject({
      externalJobId: "123",
      companyName: "GitLab",
      sourceToken: "gitlab",
      isIndiaItRole: true,
      cities: ["Bengaluru"],
    });
  });

  it("rejects a non-India role and an insecure application URL", () => {
    expect(normalizeGreenhouseJob(source, { ...greenhouseJob, location: { name: "New York, United States" } }, 1)).toBeNull();
    expect(normalizeGreenhouseJob(source, { ...greenhouseJob, absolute_url: "http://example.test/job" }, 1)).toBeNull();
  });
});
