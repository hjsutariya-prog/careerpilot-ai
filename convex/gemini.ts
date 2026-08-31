const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'

type GeminiInteraction = {
  steps?: Array<{ type?: unknown; content?: Array<{ type?: unknown; text?: unknown }> }>
}

export type GeminiRequest = {
  model: string
  prompt: string
  thinkingLevel: 'low' | 'medium' | 'high'
  maxOutputTokens: number
  schema?: Record<string, unknown>
  timeoutMs?: number
}

export function geminiText(body: unknown) {
  const steps = (body as GeminiInteraction | null)?.steps
  const output = Array.isArray(steps) ? [...steps].reverse().find((step) => step?.type === 'model_output') : undefined
  return output?.content
    ?.filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('') ?? ''
}

export async function requestGeminiText(input: GeminiRequest) {
  const environment = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  const key = environment.process?.env?.GEMINI_API_KEY
  if (!key) throw new Error('Gemini is not configured')

  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model: input.model,
      input: input.prompt,
      generation_config: { thinking_level: input.thinkingLevel, max_output_tokens: input.maxOutputTokens },
      ...(input.schema ? { response_format: { type: 'text', mime_type: 'application/json', schema: input.schema } } : {}),
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
  })
  if (!response.ok) throw new Error('Gemini is unavailable')
  const text = geminiText(await response.json())
  if (!text) throw new Error('Gemini returned an empty response')
  return text
}
