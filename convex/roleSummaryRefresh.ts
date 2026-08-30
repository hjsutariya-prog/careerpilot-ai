export type RefreshableJob = { id: string; lastUpdatedAt: number; isActive: boolean };
export type StoredRoleSummary = { jobId: string; jobLastUpdatedAt: number; status: "queued" | "generating" | "ready" | "failed"; origin?: "manual" | "gemini" | "default" };

export function takeRoleSummaryRefreshBatch(jobIds: readonly string[], batchSize = 20) {
  return jobIds.slice(0, Math.min(Math.max(batchSize, 1), 20));
}

export function planRoleSummaryRefresh(jobs: readonly RefreshableJob[], summaries: readonly StoredRoleSummary[]) {
  const summaryByJob = new Map(summaries.map((summary) => [summary.jobId, summary]));
  const jobIds: string[] = [];
  let skippedManual = 0;
  let skippedInProgress = 0;

  for (const job of jobs) {
    if (!job.isActive) continue;
    const summary = summaryByJob.get(job.id);
    if (summary?.origin === "manual") {
      skippedManual += 1;
      continue;
    }
    if (summary?.status === "queued" || summary?.status === "generating") {
      skippedInProgress += 1;
      continue;
    }
    jobIds.push(job.id);
  }

  return { jobIds, skippedManual, skippedInProgress };
}
