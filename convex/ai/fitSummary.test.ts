import { describe, expect, it } from 'vitest'
import { fallbackFitSummary, parseFitSummaries, type FitSummaryInput } from './fitSummary'

const input: FitSummaryInput = { jobId: 'job-1', evidence: [{ requirement: 'API delivery', source: 'primary', resumeLine: 4 }], gaps: ['Kubernetes experience'] }

describe('fit summary contract', () => {
  it('keeps fallback copy to one evidence-backed sentence', () => {
    expect(fallbackFitSummary(input.evidence)).toBe('Your resume shows API delivery experience, directly supporting a core professional requirement for this role.')
  })

  it('accepts a cited professional sentence and optional professional gap', () => {
    const summary = parseFitSummaries(JSON.stringify({ summaries: [{ jobId: 'job-1', sentence: 'Your API delivery experience supports the core platform responsibilities, though Kubernetes experience needs deeper review.', evidenceIds: ['primary:4'], gap: 'Kubernetes experience' }] }), [input])?.[0]
    expect(summary?.sentence).toContain('API delivery')
    expect(summary?.evidenceIds).toEqual(['primary:4'])
  })

  it('rejects preference factors and uncited claims', () => {
    expect(parseFitSummaries(JSON.stringify({ summaries: [{ jobId: 'job-1', sentence: 'Your API delivery experience and Hybrid preference make this a strong match for this role today.', evidenceIds: ['primary:4'] }] }), [input])).toBeNull()
    expect(parseFitSummaries(JSON.stringify({ summaries: [{ jobId: 'job-1', sentence: 'Your platform ownership experience supports the core responsibilities this role requires for delivery success.', evidenceIds: ['primary:9'] }] }), [input])).toBeNull()
  })
})
