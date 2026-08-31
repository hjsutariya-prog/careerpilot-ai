import { describe, expect, it } from 'vitest'
import { buildTailoringJsonRepairPrompt, requiresTailoringJsonRepair } from './tailoringRepair'

describe('tailoring JSON repair', () => {
  it('repairs only malformed JSON', () => {
    expect(requiresTailoringJsonRepair('{"edits":')).toBe(true)
    expect(requiresTailoringJsonRepair('{"edits":[]}')).toBe(false)
    expect(requiresTailoringJsonRepair('```json\n{"edits":[]}\n```')).toBe(false)
  })

  it('does not send a resume or JD in the repair prompt', () => {
    const prompt = buildTailoringJsonRepairPrompt('{"edits":')
    expect(prompt).toContain('MODEL OUTPUT:')
    expect(prompt).toContain('{"edits":')
    expect(prompt).not.toContain('SOURCE RESUME')
    expect(prompt).not.toContain('JOB DESCRIPTION')
  })
})
