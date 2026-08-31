export const tailoringGeminiConfig = {
  model: 'gemini-3.1-pro-preview',
  thinkingLevel: 'high' as const,
  maxOutputTokens: 6000,
  timeoutMs: 300_000,
}

// This is used only to recover a malformed first response. It receives the
// model's output alone, never the resume or job description.
export const tailoringJsonRepairGeminiConfig = {
  model: tailoringGeminiConfig.model,
  thinkingLevel: 'low' as const,
  maxOutputTokens: 1800,
  timeoutMs: 60_000,
}
