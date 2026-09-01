import { describe, expect, it } from 'vitest'
import { resumeMatchingGeminiConfig, resumeProfileGeminiConfig } from './resumeMatchingGeminiConfig'

describe('resume intelligence Gemini configuration', () => {
  it('uses the same Gemini 3.7 Flash model as the current tailoring provider', () => {
    expect(resumeProfileGeminiConfig.model).toBe('gemini-3.7-flash')
    expect(resumeMatchingGeminiConfig.model).toBe('gemini-3.7-flash')
    expect(resumeProfileGeminiConfig.timeoutMs).toBe(120_000)
    expect(resumeMatchingGeminiConfig.timeoutMs).toBe(120_000)
  })
})
