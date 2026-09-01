import { classifyGeminiHttpFailure, geminiResponse, type GeminiFailureCode, type GeminiRequest } from '../convex/gemini'

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const PREVIEW_LENGTH = 500

export type GeminiEvalResponseDiagnostics = {
  httpStatus: number
  contentType: string | null
  responseBodyEmpty: boolean
  rawModelTextLength: number
  rawModelTextStart: string
  rawModelTextEnd: string
  hasMarkdownCodeFence: boolean
  hasExplanatoryTextAroundJson: boolean
  appearsTruncated: boolean
  interactionStatus?: string
  finishReason?: string
  responseMimeType: 'application/json'
  schemaRequested: boolean
  apiBodyWasJson: boolean
}

export type GeminiEvalResponse = {
  text: string
  diagnostics: GeminiEvalResponseDiagnostics
  failure?: {
    code: GeminiFailureCode
    message: string
    httpStatus?: number
    retryAfterSeconds?: number
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringField(value: unknown, field: string) {
  const item = record(value)?.[field]
  return typeof item === 'string' ? item : undefined
}

function outputBounds(text: string) {
  const trimmed = text.trim()
  const fence = /^```(?:json)?\s*/i.test(trimmed) || /\s*```$/i.test(trimmed)
  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const firstBrace = withoutFences.indexOf('{')
  const lastBrace = withoutFences.lastIndexOf('}')
  const hasJsonObject = firstBrace >= 0 && lastBrace >= firstBrace
  const explanatoryText = hasJsonObject && (withoutFences.slice(0, firstBrace).trim().length > 0 || withoutFences.slice(lastBrace + 1).trim().length > 0)
  const unbalancedBraces = (withoutFences.match(/\{/g)?.length ?? 0) !== (withoutFences.match(/\}/g)?.length ?? 0)
  return { fence, explanatoryText, appearsIncomplete: Boolean(withoutFences) && (!withoutFences.endsWith('}') || unbalancedBraces) }
}

function responseFinishReason(body: unknown) {
  const direct = stringField(body, 'finish_reason') ?? stringField(body, 'finishReason')
  if (direct) return direct
  const steps = record(body)?.steps
  if (!Array.isArray(steps)) return undefined
  for (const step of [...steps].reverse()) {
    const reason = stringField(step, 'finish_reason') ?? stringField(step, 'finishReason')
    if (reason) return reason
  }
  return undefined
}

function providerErrorMessage(body: unknown) {
  const error = record(body)?.error
  const message = stringField(error, 'message') ?? stringField(body, 'message')
  return message?.slice(0, 500)
}

export function evalGeminiRequestBody(input: GeminiRequest) {
  return {
    model: input.model,
    input: input.prompt,
    generation_config: { thinking_level: input.thinkingLevel, max_output_tokens: input.maxOutputTokens },
    ...(input.schema ? { response_format: { type: 'text', mime_type: 'application/json', schema: input.schema } } : {}),
  }
}

export function buildGeminiEvalDiagnostics(input: {
  httpStatus: number
  contentType: string | null
  responseBody: string
  body: unknown
  modelText: string
  schemaRequested: boolean
}) : GeminiEvalResponseDiagnostics {
  const bounds = outputBounds(input.modelText)
  const interactionStatus = stringField(input.body, 'status')
  const finishReason = responseFinishReason(input.body)
  return {
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    responseBodyEmpty: input.responseBody.trim().length === 0,
    rawModelTextLength: input.modelText.length,
    rawModelTextStart: input.modelText.slice(0, PREVIEW_LENGTH),
    rawModelTextEnd: input.modelText.length > PREVIEW_LENGTH ? input.modelText.slice(-PREVIEW_LENGTH) : '',
    hasMarkdownCodeFence: bounds.fence,
    hasExplanatoryTextAroundJson: bounds.explanatoryText,
    appearsTruncated: bounds.appearsIncomplete || interactionStatus === 'incomplete',
    ...(interactionStatus ? { interactionStatus } : {}),
    ...(finishReason ? { finishReason } : {}),
    responseMimeType: 'application/json',
    schemaRequested: input.schemaRequested,
    apiBodyWasJson: input.body !== null,
  }
}

/** Eval-only transport: same Gemini payload and text extraction as production, with safe diagnostics. */
export async function requestGeminiForEval(input: GeminiRequest): Promise<GeminiEvalResponse> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is required. Set it locally before running npm run eval:tailoring.')

  let response: Response
  try {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(evalGeminiRequestBody(input)),
      signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
    })
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    const diagnostics = buildGeminiEvalDiagnostics({ httpStatus: 0, contentType: null, responseBody: '', body: null, modelText: '', schemaRequested: Boolean(input.schema) })
    return { text: '', diagnostics, failure: { code: timeout ? 'GEMINI_TIMEOUT' : 'GEMINI_SERVER_ERROR', message: timeout ? 'Gemini request timed out' : 'Gemini request failed' } }
  }
  const responseBody = await response.text()
  let body: unknown = null
  try {
    body = responseBody ? JSON.parse(responseBody) : null
  } catch {
    body = null
  }
  const text = body === null ? '' : geminiResponse(body).text
  const diagnostics = buildGeminiEvalDiagnostics({
    httpStatus: response.status,
    contentType: response.headers.get('content-type'),
    responseBody,
    body,
    modelText: text,
    schemaRequested: Boolean(input.schema),
  })
  // HTTP error payloads are provider metadata, never tailoring JSON for the parser to inspect.
  if (!response.ok) {
    const failure = classifyGeminiHttpFailure({ status: response.status, providerMessage: providerErrorMessage(body), retryAfter: response.headers.get('retry-after') })
    return { text: '', diagnostics, failure: { code: failure.code, message: failure.message, ...(failure.options.httpStatus !== undefined ? { httpStatus: failure.options.httpStatus } : {}), ...(failure.options.retryAfterSeconds !== undefined ? { retryAfterSeconds: failure.options.retryAfterSeconds } : {}) } }
  }
  if (body === null && responseBody.trim()) return { text, diagnostics, failure: { code: 'GEMINI_SERVER_ERROR', message: 'Gemini returned an unreadable API response', httpStatus: response.status } }
  if (!text) return { text, diagnostics, failure: { code: 'GEMINI_EMPTY_RESPONSE', message: 'Gemini returned an empty response', httpStatus: response.status } }
  if (diagnostics.interactionStatus === 'failed' || diagnostics.interactionStatus === 'cancelled') return { text, diagnostics, failure: { code: 'GEMINI_SERVER_ERROR', message: `Gemini request ${diagnostics.interactionStatus}`, httpStatus: response.status } }
  return { text, diagnostics }
}
