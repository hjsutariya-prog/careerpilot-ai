import type { SampleJob } from './data/sampleJobs'

export type JobActionStatus = 'Apply' | 'Reject' | 'On Hold' | 'Resume shortlisted' | 'Interview'

export type StoredJobAction = {
  jobId: string
  status: JobActionStatus
  updatedAt: number
}

export type TrackedJob = {
  job: SampleJob
  action: StoredJobAction
}

export type TrackedJobGroups = {
  applied: TrackedJob[]
  shortlisted: TrackedJob[]
  interview: TrackedJob[]
  onHold: TrackedJob[]
  rejected: TrackedJob[]
}

export function getUndecidedJobs<T extends { id: string }>(jobs: T[], actions: ReadonlyArray<Pick<StoredJobAction, 'jobId'>>) {
  const decidedJobIds = new Set(actions.map((action) => action.jobId))
  return jobs.filter((job) => !decidedJobIds.has(job.id))
}

export function groupTrackedJobs(jobs: SampleJob[], actions: StoredJobAction[]): TrackedJobGroups {
  const jobsById = new Map(jobs.map((job) => [job.id, job]))
  const groups: TrackedJobGroups = { applied: [], shortlisted: [], interview: [], onHold: [], rejected: [] }

  for (const action of actions) {
    const job = jobsById.get(action.jobId)
    if (!job) continue

    const trackedJob = { job, action }
    if (action.status === 'Apply') groups.applied.push(trackedJob)
    if (action.status === 'Resume shortlisted') groups.shortlisted.push(trackedJob)
    if (action.status === 'Interview') groups.interview.push(trackedJob)
    if (action.status === 'On Hold') groups.onHold.push(trackedJob)
    if (action.status === 'Reject') groups.rejected.push(trackedJob)
  }

  return groups
}
