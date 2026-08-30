import { describe, expect, it } from 'vitest'
import { toLiveJobCard } from './liveJobs'

describe('toLiveJobCard', () => {
  it('uses Last updated rather than a made-up posting date', () => {
    expect(toLiveJobCard({
      rank: 1,
      matchScore: 86,
      matchExplanation: 'Matches Backend Developer',
      isRelatedMatch: false,
      job: {
        _id: 'job-1',
        title: 'Backend Engineer',
        companyName: 'GitLab',
        locationLabel: 'Bengaluru, India',
        description: 'Build APIs',
        skills: ['TypeScript'],
        applyUrl: 'https://example.test/job',
        lastUpdatedAt: Date.parse('2026-08-29T12:00:00Z'),
        lastSeenAt: Date.parse('2026-08-30T12:00:00Z'),
      },
    })).toMatchObject({ freshnessLabel: 'Last updated 29 Aug', checkedLabel: 'Checked 30 Aug' })
  })
})
