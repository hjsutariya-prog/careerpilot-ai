export const tailoringGeminiConfig = {
  model: 'gemini-3.1-pro-preview',
  thinkingLevel: 'high' as const,
  maxOutputTokens: 6000,
  timeoutMs: 300_000,
}

// This is used only after a malformed first response. It repeats the original
// task at a smaller output budget and lower thinking level; it never retries.
export const tailoringJsonRepairGeminiConfig = {
  model: tailoringGeminiConfig.model,
  thinkingLevel: 'low' as const,
  maxOutputTokens: 1800,
  timeoutMs: 60_000,
}
