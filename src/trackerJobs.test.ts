import { describe, expect, it } from 'vitest'
import type { SampleJob } from './data/sampleJobs'
import { getUndecidedJobs, groupTrackedJobs } from './trackerJobs'

function job(id: string): SampleJob {
  return {
    id,
    title: `Role ${id}`,
    companyName: `Company ${id}`,
    cityLabel: 'Bengaluru',
    cities: ['Bengaluru'],
    workPreference: 'Hybrid',
    jobType: 'Full-time',
    experienceRequired: '3+ years',
    skills: ['TypeScript'],
    applyUrl: `https://jobs.example.com/${id}`,
    source: 'Company Careers',
    postedDate: '2026-08-28',
    isActive: true,
    description: 'A role description.',
    salaryMinLakh: null,
    salaryMaxLakh: null,
    employerJobId: null,
    greenhouseJobId: null,
    lastCheckedDate: '2026-08-30',
  }
}

const jobs = [job('open'), job('applied'), job('shortlisted'), job('interview'), job('hold'), job('rejected')]
const actions = [
  { jobId: 'applied', status: 'Apply' as const, updatedAt: 100 },
  { jobId: 'shortlisted', status: 'Resume shortlisted' as const, updatedAt: 150 },
  { jobId: 'interview', status: 'Interview' as const, updatedAt: 175 },
  { jobId: 'hold', status: 'On Hold' as const, updatedAt: 200 },
  { jobId: 'rejected', status: 'Reject' as const, updatedAt: 300 },
  { jobId: 'missing', status: 'Apply' as const, updatedAt: 400 },
]

describe('tracker job helpers', () => {
  it('keeps only undecided jobs in the daily brief', () => {
    expect(getUndecidedJobs(jobs, actions).map((item) => item.id)).toEqual(['open'])
  })

  it('groups matching snapshot jobs by their saved decision', () => {
    const groups = groupTrackedJobs(jobs, actions)

    expect(groups.applied.map(({ job: item }) => item.id)).toEqual(['applied'])
    expect(groups.shortlisted.map(({ job: item }) => item.id)).toEqual(['shortlisted'])
    expect(groups.interview.map(({ job: item }) => item.id)).toEqual(['interview'])
    expect(groups.onHold.map(({ job: item }) => item.id)).toEqual(['hold'])
    expect(groups.rejected.map(({ job: item }) => item.id)).toEqual(['rejected'])
    expect(groups.rejected[0].action.updatedAt).toBe(300)
  })
})
