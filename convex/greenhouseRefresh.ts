import { normalizeGreenhouseJob, type GreenhouseApiJob, type NormalizedGreenhouseJob } from "./greenhouseNormalization";
import type { GreenhouseSource } from "./greenhouseSources";

const MAX_JOB_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export type PreparedSourceRefresh = {
  recordsFetched: number;
  activeRetained: number;
  jobs: NormalizedGreenhouseJob[];
};

export function buildGreenhouseJobsUrl(source: GreenhouseSource) {
  return `https://boards-api.greenhouse.io/v1/boards/${source.token}/jobs?content=true`;
}

export function prepareSuccessfulSourceRefresh(source: GreenhouseSource, rawJobs: readonly GreenhouseApiJob[], observedAt: number, now: number): PreparedSourceRefresh {
  const jobsByExternalId = new Map<string, NormalizedGreenhouseJob>();

  for (const rawJob of rawJobs) {
    const job = normalizeGreenhouseJob(source, rawJob, observedAt);
    if (!job || job.lastUpdatedAt > now || now - job.lastUpdatedAt > MAX_JOB_AGE_MS) continue;
    jobsByExternalId.set(job.externalJobId, job);
  }

  const jobs = [...jobsByExternalId.values()];
  return { recordsFetched: rawJobs.length, activeRetained: jobs.length, jobs };
}
