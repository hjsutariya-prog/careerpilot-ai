import { describe, expect, it } from 'vitest'
import { isSafeExperienceRewrite, isSafeSkillReorder, preservesActionTense, reorderResumeForJob, reorderTemplateSlots, tailoredFileName, templateReplacementDiagnostics, templateReplacements } from './tailoredResumes'
import { createResumeBlocks } from './ai/resumeBlocks'

const blocks = createResumeBlocks

describe('tailored resume fallback', () => {
  it('keeps the source text while moving job-relevant lines earlier', () => {
    const resume = 'Priya Shah\nCustomer support\nBuilt React TypeScript dashboards\nEducation'
    const result = reorderResumeForJob(resume, 'React and TypeScript engineer building dashboards')
    expect(result.split('\n')).toEqual(['Priya Shah', 'Built React TypeScript dashboards', 'Customer support', 'Education'])
  })

  it('creates a safe DOCX file name', () => {
    expect(tailoredFileName('Priya Shah.pdf', 'React Engineer', 'Northstar')).toBe('priya-shah-react-engineer-northstar-tailored.docx')
  })

  it('keeps only an oversized slot unchanged while accepting safe rewrites', () => {
    const slots = blocks([{ text: 'PRIYA SHAH', editable: false }, { text: 'Built React dashboards', editable: true }, { text: 'Led a product team', editable: true }])
    const response = '```json\n{"replacements":["PRIYA SHAH","Built React tools","Led a product team across several complex international teams"]}\n```'
    expect(templateReplacements(response, slots)).toEqual(['PRIYA SHAH', 'Built React tools', 'Led a product team'])
  })

  it('merges compact, valid edits into the locked template slots', () => {
    const slots = blocks([{ text: 'PRIYA SHAH', editable: false }, { text: 'Built React dashboards', editable: true }, { text: 'Led a product team', editable: true }])
    expect(templateReplacements('{"edits":[{"index":1,"text":"Built React tools"}]}', slots)).toEqual(['PRIYA SHAH', 'Built React tools', 'Led a product team'])
  })

  it('reports rejection counts without exposing resume text', () => {
    const result = templateReplacementDiagnostics('{"edits":[{"index":1,"text":"Built React tools"}]}', blocks([{ text: 'PRIYA SHAH', editable: false }, { text: 'Built React dashboards', editable: true }]))
    expect(result).toEqual({ shape: 'edits', proposed: 1, editable: 1, nonEmpty: 1, withinLength: 1, safe: 1 })
  })

  it('reports only parser metadata for malformed model output', () => {
    const result = templateReplacementDiagnostics('{"edits":', [])
    expect(result.shape).toBe('invalid-json')
    expect('textLength' in result && result.textLength).toBe(9)
    expect('parserError' in result && result.parserError).toMatch(/JSON|Unexpected|end/i)
  })

  it('reorders matching skills without changing the original DOCX slot length', () => {
    const slots = blocks([{ text: 'Skills: Java, React, TypeScript', editable: true }])
    expect(reorderTemplateSlots(slots, 'React and TypeScript engineer')).toEqual(['Skills: React, TypeScript, Java'])
  })

  it('accepts only an exact reordering of the existing skills', () => {
    expect(isSafeSkillReorder('Skills: Java, React, TypeScript', 'Skills: React, TypeScript, Java')).toBe(true)
    expect(isSafeSkillReorder('Skills: Java, React', 'Skills: React, GraphQL')).toBe(false)
    expect(templateReplacements('{"edits":[{"index":0,"text":"Skills: React, TypeScript, Java"}]}', blocks([{ text: 'Skills: Java, React, TypeScript', editable: true }]))).toEqual(['Skills: React, TypeScript, Java'])
  })

  it('never reorders experience bullets that happen to contain commas', () => {
    const slots = blocks([{ text: 'Owned INCER reporting, generating COREP outputs; cut delivery time.', editable: true }])
    expect(reorderTemplateSlots(slots, 'COREP regulatory reporting')).toEqual([slots[0].text])
  })

  it('allows stronger action verbs only when their tense stays the same', () => {
    expect(preservesActionTense('Built React dashboards', 'Developed React tools')).toBe(true)
    expect(preservesActionTense('Built React dashboards', 'Develop React tools')).toBe(false)
    expect(preservesActionTense('Leads sprint planning', 'Drives sprint planning')).toBe(true)
  })

  it('allows a shorter experience rewrite only when key facts remain intact', () => {
    const source = 'Directed the migration from Centor to INCER in October 2025 with 100% continuity.'
    expect(isSafeExperienceRewrite(source, 'Led Centor-to-INCER migration in October 2025 with 100% continuity.')).toBe(true)
    expect(isSafeExperienceRewrite(source, 'Led Centor-to-INCER migration in 2026 with 100% continuity.')).toBe(false)
    expect(isSafeExperienceRewrite(source, 'Lead Centor-to-INCER migration in October 2025 with 100% continuity.')).toBe(false)
  })
})
