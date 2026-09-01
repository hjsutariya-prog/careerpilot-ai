import { describe, expect, it } from 'vitest'
import { isReusableProfile, normaliseResumeLines, parseResumeProfile, planProfileGeneration, PROFILE_SCHEMA_VERSION, resumeProfileResponseSchema } from './resumeProfiles'

describe('resume profile helpers', () => {
  it('reuses only the same hash and schema version', () => {
    expect(isReusableProfile({ sourceHash: 'same', schemaVersion: PROFILE_SCHEMA_VERSION }, 'same')).toBe(true)
    expect(isReusableProfile({ sourceHash: 'old', schemaVersion: PROFILE_SCHEMA_VERSION }, 'new')).toBe(false)
    expect(planProfileGeneration({ existing: 'ready', sameHash: true, sameVersion: true })).toEqual({ action: 'reuse' })
  })

  it('keeps only profile facts with real resume line evidence', () => {
    const profile = parseResumeProfile({
      skills: [{ name: 'React', evidenceLineNumbers: [2] }, { name: 'Invented', evidenceLineNumbers: [99] }],
      roles: [{ title: 'Frontend Engineer', years: 3, evidenceLineNumbers: [1] }],
      achievements: [{ text: 'Improved performance', evidenceLineNumbers: [3] }],
      education: [], totalYears: 3,
    }, 3)
    expect(profile).toMatchObject({ skills: [{ name: 'React' }], roles: [{ title: 'Frontend Engineer', years: 3 }] })
  })

  it('normalises evidence line input', () => {
    expect(normaliseResumeLines(' First role \n\nSecond   role ')).toEqual(['First role', 'Second role'])
  })

  it('asks Gemini for the factual profile JSON shape rather than free-form text', () => {
    expect(resumeProfileResponseSchema.required).toEqual(['skills', 'roles', 'achievements', 'education', 'totalYears'])
    expect(resumeProfileResponseSchema.properties.skills).toBeDefined()
  })
})
