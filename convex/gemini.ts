const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'

export type GeminiFailureCode =
  | 'GEMINI_RATE_LIMIT'
  | 'GEMINI_QUOTA_EXHAUSTED'
  | 'GEMINI_AUTH_ERROR'
  | 'GEMINI_SERVER_ERROR'
  | 'GEMINI_TIMEOUT'
  | 'GEMINI_EMPTY_RESPONSE'
  | 'GEMINI_INVALID_JSON'
  | 'GEMINI_SCHEMA_INVALID'

export class GeminiRequestError extends Error {
  readonly name = 'GeminiRequestError'
  readonly code: GeminiFailureCode
  readonly options: { httpStatus?: number; retryAfterSeconds?: number; providerMessage?: string }

  constructor(
    code: GeminiFailureCode,
    message: string,
    options: { httpStatus?: number; retryAfterSeconds?: number; providerMessage?: string } = {},
  ) {
    super(message)
    this.code = code
    this.options = options
  }
}

export function isGeminiRequestError(error: unknown): error is GeminiRequestError {
  return error instanceof GeminiRequestError
}

function retryAfterSeconds(value: string | null) {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds
  const retryAt = Date.parse(value)
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000)) : undefined
}

/** Maps provider transport responses before any model-output parsing happens. */
export function classifyGeminiHttpFailure(input: { status: number; providerMessage?: string; retryAfter?: string | null }) {
  const providerMessage = input.providerMessage?.trim()
  const base = { httpStatus: input.status, ...(providerMessage ? { providerMessage } : {}), ...(input.status === 429 ? { retryAfterSeconds: retryAfterSeconds(input.retryAfter ?? null) } : {}) }
  if (input.status === 429) {
    const quotaExhausted = /quota|resource[ _-]?exhausted|billing/i.test(providerMessage ?? '')
    return new GeminiRequestError(
      quotaExhausted ? 'GEMINI_QUOTA_EXHAUSTED' : 'GEMINI_RATE_LIMIT',
      quotaExhausted ? 'Gemini quota is exhausted' : 'Gemini rate limit reached',
      base,
    )
  }
  if (input.status === 401 || input.status === 403) return new GeminiRequestError('GEMINI_AUTH_ERROR', 'Gemini authentication failed', base)
  return new GeminiRequestError('GEMINI_SERVER_ERROR', `Gemini HTTP ${input.status}`, base)
}

export function isGeminiProviderFailure(code: GeminiFailureCode) {
  return code === 'GEMINI_RATE_LIMIT'
    || code === 'GEMINI_QUOTA_EXHAUSTED'
    || code === 'GEMINI_AUTH_ERROR'
    || code === 'GEMINI_SERVER_ERROR'
    || code === 'GEMINI_TIMEOUT'
}

type GeminiInteraction = {
  status?: unknown
  steps?: Array<{ type?: unknown; content?: Array<{ type?: unknown; text?: unknown }> }>
}

export type GeminiTextResponse = {
  text: string
  status?: string
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

export function geminiResponse(body: unknown): GeminiTextResponse {
  const interaction = body as GeminiInteraction | null
  return {
    text: geminiText(body),
    status: typeof interaction?.status === 'string' ? interaction.status : undefined,
  }
}

function providerMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown }
    const message = parsed.error?.message ?? parsed.message
    return typeof message === 'string' ? message.slice(0, 500) : undefined
  } catch {
    return undefined
  }
}

export async function requestGeminiResponse(input: GeminiRequest): Promise<GeminiTextResponse> {
  const environment = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  const key = environment.process?.env?.GEMINI_API_KEY
  if (!key) throw new GeminiRequestError('GEMINI_AUTH_ERROR', 'Gemini is not configured')

  let response: Response
  try {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
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
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    throw new GeminiRequestError(timeout ? 'GEMINI_TIMEOUT' : 'GEMINI_SERVER_ERROR', timeout ? 'Gemini request timed out' : 'Gemini request failed')
  }

  // Never treat an HTTP error body as model output. It is provider metadata, not tailoring JSON.
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw classifyGeminiHttpFailure({ status: response.status, providerMessage: providerMessage(body), retryAfter: response.headers.get('retry-after') })
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new GeminiRequestError('GEMINI_SERVER_ERROR', 'Gemini returned an unreadable API response')
  }
  const result = geminiResponse(body)
  if (!result.text) throw new GeminiRequestError('GEMINI_EMPTY_RESPONSE', 'Gemini returned an empty response')
  if (result.status === 'failed' || result.status === 'cancelled') throw new GeminiRequestError('GEMINI_SERVER_ERROR', `Gemini request ${result.status}`)
  return result
}

export async function requestGeminiText(input: GeminiRequest) {
  return (await requestGeminiResponse(input)).text
}
