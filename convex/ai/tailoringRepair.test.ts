import { describe, expect, it } from 'vitest'
import { buildTailoringJsonRepairPrompt, requiresTailoringJsonRepair } from './tailoringRepair'

describe('tailoring JSON repair', () => {
  it('repairs only malformed JSON', () => {
    expect(requiresTailoringJsonRepair('{"edits":')).toBe(true)
    expect(requiresTailoringJsonRepair('{"edits":[]}')).toBe(false)
    expect(requiresTailoringJsonRepair('```json\n{"edits":[]}\n```')).toBe(false)
  })

  it('uses local punctuation repair before asking Gemini again', () => {
    expect(requiresTailoringJsonRepair('{"analysis":{"matched":[],"understated":[],"missing":[]} "edits":[]}')).toBe(false)
  })

  it('reuses the original task so the low-cost retry can produce safe edits', () => {
    const originalPrompt = 'JOB DESCRIPTION:\nBuild React tools\n\nSOURCE RESUME:\nBuilt React dashboards'
    const prompt = buildTailoringJsonRepairPrompt(originalPrompt)
    expect(prompt).toContain('previous response could not be parsed')
    expect(prompt).toContain(originalPrompt)
    expect(prompt).not.toContain('MODEL OUTPUT:')
  })
})
