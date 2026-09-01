import { describe, expect, it } from 'vitest'
import { summarizeRoleDescription, toLiveJobCard } from './liveJobs'

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

  it('does not reuse old preference-based explanation copy as professional fit evidence', () => {
    const card = toLiveJobCard({
      rank: 1,
      matchScore: 86,
      matchExplanation: 'Based in Bengaluru · Remote role',
      isRelatedMatch: false,
      matchSource: 'preferences',
      job: { _id: 'job-1', title: 'Backend Engineer', companyName: 'GitLab', locationLabel: 'Bengaluru, India', description: 'Build APIs', skills: ['TypeScript'], applyUrl: 'https://example.test/job', lastUpdatedAt: Date.now(), lastSeenAt: Date.now() },
    })
    expect(card?.fitSummary).toBe('Professional resume evidence is limited for this role, so its key requirements need closer review.')
  })

  it('puts a saved-city mismatch in cautions rather than Why it fits', () => {
    const card = toLiveJobCard({
      rank: 1,
      matchScore: 86,
      matchExplanation: 'Resume evidence: SQL',
      fitSummary: 'Your resume shows direct experience with SQL, a core requirement for this role.',
      matchSource: 'resume',
      isRelatedMatch: false,
      preferenceAlignment: { location: 'mismatch', workStyle: 'aligned', salary: 'unknown' },
      job: { _id: 'job-1', title: 'Data Analyst', companyName: 'GitLab', locationLabel: 'Mumbai, India', description: 'Use SQL', skills: ['SQL'], applyUrl: 'https://example.test/job', lastUpdatedAt: Date.now(), lastSeenAt: Date.now() },
    })
    expect(card?.fitSummary).not.toContain('Mumbai')
    expect(card?.cautions).toContain('This role is based in Mumbai, India, outside your saved city preferences.')
  })
})

describe('summarizeRoleDescription', () => {
  it('keeps a readable short preview instead of rendering a full job description', () => {
    const description = 'Build reliable payment systems for millions of customers. Work with product, data and platform teams to ship improvements. This final sentence should not appear in the quick read.'

    const preview = summarizeRoleDescription(description, 110)

    expect(preview.startsWith('Build reliable payment systems for millions of customers.')).toBe(true)
    expect(preview).toHaveLength(111)
    expect(preview.endsWith('…')).toBe(true)
  })
})
