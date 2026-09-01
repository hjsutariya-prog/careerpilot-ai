import { describe, expect, it } from 'vitest'
import { tailoringOutcomeMessage } from './tailoringMessages'

describe('tailoring outcome messages', () => {
  it('keeps provider limits distinct from malformed output and safety rejections', () => {
    expect(tailoringOutcomeMessage('provider_unavailable', 'GEMINI_RATE_LIMIT').text).toContain('AI service limit was reached')
    expect(tailoringOutcomeMessage('ai_response_invalid', 'GEMINI_INVALID_JSON').text).toBe('Resume tailoring is temporarily unavailable. No credits were used. Please try again.')
    expect(tailoringOutcomeMessage('no_safe_changes').text).toBe("We couldn't make safe changes to this resume. No credits were used.")
  })

  it('has a separate outcome for already-aligned resumes', () => {
    expect(tailoringOutcomeMessage('no_meaningful_changes')).toEqual({ tone: 'status', text: 'No meaningful safe changes were needed for this job.' })
  })
})
