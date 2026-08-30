import { describe, expect, it } from 'vitest'
import { getSuggestedJobs, type JobPreferences } from './jobMatching'
import type { SampleJob } from './data/sampleJobs'

const preferences: JobPreferences = {
  roles: ['Product Manager'],
  skills: 'SQL, Jira, user research',
  experience: 5,
  cities: ['Bengaluru'],
  workPreferences: ['Hybrid', 'Remote'],
  jobType: 'Full-time',
  companiesToAvoid: '',
}

function job(overrides: Partial<SampleJob> = {}): SampleJob {
  return {
    id: 'job-1',
    title: 'Product Manager',
    companyName: 'NovaCart',
    cityLabel: 'Bengaluru, Karnataka, India',
    cities: ['Bengaluru'],
    workPreference: 'Hybrid',
    jobType: 'Full-time',
    experienceRequired: '3+ years',
    skills: ['SQL', 'Jira'],
    applyUrl: 'https://jobs.example.com/1',
    source: 'Company Careers',
    postedDate: '2026-08-20',
    isActive: true,
    description: 'Own product discovery and delivery.',
    salaryMinLakh: null,
    salaryMaxLakh: null,
    employerJobId: null,
    greenhouseJobId: null,
    lastCheckedDate: '2026-08-30',
    ...overrides,
  }
}

describe('getSuggestedJobs', () => {
  const now = new Date('2026-08-30T12:00:00.000Z')

  it('ranks a role and skill match higher than a city-only related job', () => {
    const strong = job({ id: 'strong' })
    const related = job({ id: 'related', title: 'Business Operations Lead', skills: ['Excel'], experienceRequired: '2+ years' })

    const results = getSuggestedJobs(preferences, [related, strong], now)

    expect(results.map((result) => result.id)).toEqual(['strong', 'related'])
    expect(results[0].matchScore).toBeGreaterThan(results[1].matchScore)
    expect(results[1].isRelatedMatch).toBe(true)
  })

  it('removes inactive, old, and non-HTTPS job links', () => {
    const eligible = job({ id: 'eligible' })
    const inactive = job({ id: 'inactive', isActive: false })
    const old = job({ id: 'old', postedDate: '2026-06-29' })
    const unsafeUrl = job({ id: 'unsafe', applyUrl: 'http://jobs.example.com/unsafe' })

    expect(getSuggestedJobs(preferences, [eligible, inactive, old, unsafeUrl], now).map((result) => result.id)).toEqual(['eligible'])
  })

  it('matches normalised Bengaluru city data', () => {
    const result = getSuggestedJobs(preferences, [job({ cityLabel: 'Bengaluru, Karnataka, India', cities: ['Bengaluru'] })], now)[0]

    expect(result.matchReason).toContain('Bengaluru')
  })

  it('accepts Remote roles without a city preference', () => {
    const remotePreferences = { ...preferences, cities: [], workPreferences: ['Remote'] }
    const remoteJob = job({ workPreference: 'Remote', cities: ['Remote'], cityLabel: 'Remote (India)' })

    expect(getSuggestedJobs(remotePreferences, [remoteJob], now)).toHaveLength(1)
  })

  it('removes companies in the avoid list', () => {
    const avoided = job({ companyName: 'NovaCart' })
    const safe = job({ id: 'safe', companyName: 'Blue River' })
    const avoidedPreferences = { ...preferences, companiesToAvoid: 'NovaCart, Other Co' }

    expect(getSuggestedJobs(avoidedPreferences, [avoided, safe], now).map((result) => result.id)).toEqual(['safe'])
  })
})
