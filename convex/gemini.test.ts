import { describe, expect, it } from 'vitest'
import { geminiText } from './gemini'

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
})
