import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildGeminiEvalDiagnostics, evalGeminiRequestBody, requestGeminiForEval } from './tailoringEvalGemini'

const originalKey = process.env.GEMINI_API_KEY

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalKey
})

describe('eval-only Gemini diagnostics', () => {
  it('uses the same structured JSON request fields as production', () => {
    expect(evalGeminiRequestBody({ model: 'gemini-test', prompt: 'synthetic', thinkingLevel: 'high', maxOutputTokens: 6000, schema: { type: 'object' } })).toEqual({
      model: 'gemini-test',
      input: 'synthetic',
      generation_config: { thinking_level: 'high', max_output_tokens: 6000 },
      response_format: { type: 'text', mime_type: 'application/json', schema: { type: 'object' } },
    })
  })

  it('records fenced JSON and explanatory text without exposing request credentials', () => {
    const fenced = buildGeminiEvalDiagnostics({
      httpStatus: 200,
      contentType: 'application/json',
      responseBody: '{"status":"completed"}',
      body: { status: 'completed' },
      modelText: '```json\n{"edits":[]}\n```',
      schemaRequested: true,
    })
    const explanatory = buildGeminiEvalDiagnostics({
      httpStatus: 200,
      contentType: 'application/json',
      responseBody: '{"status":"completed"}',
      body: { status: 'completed' },
      modelText: 'Here is the JSON: {"edits":[]} Thanks.',
      schemaRequested: true,
    })

    expect(fenced.hasMarkdownCodeFence).toBe(true)
    expect(fenced.hasExplanatoryTextAroundJson).toBe(false)
    expect(explanatory.hasMarkdownCodeFence).toBe(false)
    expect(explanatory.hasExplanatoryTextAroundJson).toBe(true)
    expect(JSON.stringify(fenced)).not.toContain('x-goog-api-key')
  })

  it('detects empty and incomplete model output', () => {
    const empty = buildGeminiEvalDiagnostics({ httpStatus: 200, contentType: 'application/json', responseBody: '{}', body: {}, modelText: '', schemaRequested: true })
    const incomplete = buildGeminiEvalDiagnostics({ httpStatus: 200, contentType: 'application/json', responseBody: '{"status":"incomplete"}', body: { status: 'incomplete', finish_reason: 'max_tokens' }, modelText: '{"analysis":', schemaRequested: true })

    expect(empty.rawModelTextLength).toBe(0)
    expect(incomplete.appearsTruncated).toBe(true)
    expect(incomplete.interactionStatus).toBe('incomplete')
    expect(incomplete.finishReason).toBe('max_tokens')
  })

  it('returns a typed provider failure for HTTP 429 without model-output parsing', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: { message: 'quota exceeded' } })),
      headers: new Headers({ 'content-type': 'application/json', 'retry-after': '60' }),
    }))

    const result = await requestGeminiForEval({ model: 'gemini-test', prompt: 'synthetic', thinkingLevel: 'high', maxOutputTokens: 10, schema: { type: 'object' } })
    expect(result).toMatchObject({ text: '', failure: { code: 'GEMINI_QUOTA_EXHAUSTED', httpStatus: 429, retryAfterSeconds: 60 } })
    expect(result.diagnostics.rawModelTextLength).toBe(0)
  })
})
