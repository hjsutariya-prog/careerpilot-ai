import { describe, expect, it } from 'vitest'
import { buildProfessionalFitSummary, isProfessionalRequirement, preferenceCautions, professionalRequirements } from './professionalFit'

describe('professional fit copy', () => {
  it('keeps location, salary, notice period, and work style out of professional requirements', () => {
    expect(professionalRequirements(['SQL', 'Bengaluru, India', 'Hybrid work', 'Salary expectation', '30 day notice period', 'Stakeholder management'])).toEqual(['SQL', 'Stakeholder management'])
    expect(isProfessionalRequirement('Remote')).toBe(false)
  })

  it('builds Why it fits from the strongest cited professional evidence only', () => {
    expect(buildProfessionalFitSummary([
      { requirement: 'backlog prioritization', resumeLine: 4, source: 'primary' },
      { requirement: 'Hybrid work', resumeLine: 8, source: 'primary' },
    ])).toBe('Your resume shows direct experience with backlog prioritization, a core requirement for this role.')
  })

  it('keeps preference mismatches separate as cautions', () => {
    expect(preferenceCautions({ location: 'mismatch', workStyle: 'mismatch', salary: 'unknown' }, 'Mumbai, India')).toEqual([
      'This role is based in Mumbai, India, outside your saved city preferences.',
      'This role’s work arrangement differs from your saved work preference.',
    ])
  })
})
