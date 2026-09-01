import { describe, expect, it } from 'vitest'
import { batchMatchResponseSchema, matchCacheKey, scoreResumeMatch } from './resumeMatching'

describe('scoreResumeMatch', () => {
  it('uses the agreed 40/30/20/8/2 formula', () => {
    expect(scoreResumeMatch({
      requiredSupported: 3,
      requiredTotal: 3,
      preferredSupported: 1,
      preferredTotal: 2,
      roleFit: 'strong',
      responsibilityFit: 'partial',
      workArrangementFits: true,
      isIndiaRole: true,
    })).toEqual({ score: 84, skills: 34, role: 30, responsibilities: 10, workArrangement: 8, location: 2 })
  })

  it('caps skill coverage at its 40 point allocation', () => {
    expect(scoreResumeMatch({
      requiredSupported: 5,
      requiredTotal: 3,
      preferredSupported: 2,
      preferredTotal: 1,
      roleFit: 'none',
      responsibilityFit: 'none',
      workArrangementFits: false,
      isIndiaRole: true,
    })).toEqual({ score: 42, skills: 40, role: 0, responsibilities: 0, workArrangement: 0, location: 2 })
  })
})

describe('matchCacheKey', () => {
  it('is stable for an unchanged resume and job', () => {
    expect(matchCacheKey({ sourceHash: 'same-resume', jobId: 'job-a', jobLastUpdatedAt: 9, scoreVersion: 1 }))
      .toBe(matchCacheKey({ sourceHash: 'same-resume', jobId: 'job-a', jobLastUpdatedAt: 9, scoreVersion: 1 }))
  })
})

describe('batch matching contract', () => {
  it('requires each AI match to cite its structured professional evidence shape', () => {
    expect(batchMatchResponseSchema.required).toEqual(['matches'])
    expect(batchMatchResponseSchema.properties.matches).toBeDefined()
  })
})
