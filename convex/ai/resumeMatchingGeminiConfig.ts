/** Shared configuration for factual resume intelligence, separate from tailoring. */
export const resumeProfileGeminiConfig = {
  model: 'gemini-3.7-flash',
  thinkingLevel: 'medium' as const,
  maxOutputTokens: 2800,
  timeoutMs: 120_000,
}

export const resumeMatchingGeminiConfig = {
  model: resumeProfileGeminiConfig.model,
  thinkingLevel: 'medium' as const,
  maxOutputTokens: 4500,
  timeoutMs: 120_000,
}
