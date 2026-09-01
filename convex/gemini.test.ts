import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyGeminiHttpFailure, geminiResponse, geminiText, isGeminiProviderFailure, requestGeminiResponse } from './gemini'

const originalKey = process.env.GEMINI_API_KEY

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalKey
})

describe('Gemini interaction output', () => {
  it('returns text from the final model-output step', () => {
    expect(geminiText({
      steps: [
        { type: 'model_output', content: [{ type: 'text', text: '{"old":true}' }] },
        { type: 'model_output', content: [{ type: 'text', text: '{"ready":true}' }] },
      ],
    })).toBe('{"ready":true}')
  })

  it('returns an empty string when no model text exists', () => {
    expect(geminiText({ steps: [{ type: 'user_input', content: [{ type: 'text', text: 'hello' }] }] })).toBe('')
  })

  it('keeps the provider completion status with the output text', () => {
    expect(geminiResponse({ status: 'incomplete', steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"edits":' }] }] })).toEqual({
      status: 'incomplete',
      text: '{"edits":',
    })
  })
})

describe('Gemini transport error classification', () => {
  it('classifies rate, quota, auth, and server failures without treating them as model output', () => {
    expect(classifyGeminiHttpFailure({ status: 429 }).code).toBe('GEMINI_RATE_LIMIT')
    expect(classifyGeminiHttpFailure({ status: 429, providerMessage: 'Resource has been exhausted: quota exceeded' }).code).toBe('GEMINI_QUOTA_EXHAUSTED')
    expect(classifyGeminiHttpFailure({ status: 401 }).code).toBe('GEMINI_AUTH_ERROR')
    expect(classifyGeminiHttpFailure({ status: 403 }).code).toBe('GEMINI_AUTH_ERROR')
    expect(classifyGeminiHttpFailure({ status: 500 }).code).toBe('GEMINI_SERVER_ERROR')
    expect(isGeminiProviderFailure('GEMINI_RATE_LIMIT')).toBe(true)
    expect(isGeminiProviderFailure('GEMINI_EMPTY_RESPONSE')).toBe(false)
  })

  it('does not reach the JSON parser for HTTP 429', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const json = vi.fn()
    const text = vi.fn().mockResolvedValue(JSON.stringify({ error: { message: 'quota exceeded' } }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text,
      json,
      headers: new Headers({ 'retry-after': '30' }),
    }))

    await expect(requestGeminiResponse({ model: 'gemini-test', prompt: 'synthetic', thinkingLevel: 'high', maxOutputTokens: 10 }))
      .rejects.toMatchObject({ code: 'GEMINI_QUOTA_EXHAUSTED', options: { httpStatus: 429, retryAfterSeconds: 30 } })
    expect(json).not.toHaveBeenCalled()
    expect(text).toHaveBeenCalledOnce()
  })

  it('classifies a successful empty model response separately', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: 'completed', steps: [] }),
      headers: new Headers(),
    }))

    await expect(requestGeminiResponse({ model: 'gemini-test', prompt: 'synthetic', thinkingLevel: 'high', maxOutputTokens: 10 }))
      .rejects.toMatchObject({ code: 'GEMINI_EMPTY_RESPONSE' })
  })
})
