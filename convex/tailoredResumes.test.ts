import { describe, expect, it } from 'vitest'
import { estimateTailoringMatchPreview, isSafeExperienceRewrite, isSafeSkillReorder, preservesActionTense, reorderResumeForJob, reorderTemplateSlots, tailoredFileName, tailoringResponseFailureCode, tailoringValidationDiagnostic, templateMerges, templateReplacementDiagnostics, templateReorders, templateReplacements, templateSlotsForGemini } from './tailoredResumes'
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

  it('estimates an improvement only for supported requirements surfaced by accepted edits', () => {
    expect(estimateTailoringMatchPreview({
      baselineScore: 72,
      analysis: {
        matched: [],
        understated: [
          { requirement: 'Product discovery', evidenceBlockIds: ['paragraph_1'] },
          { requirement: 'SQL analysis', evidenceBlockIds: ['paragraph_2'] },
        ],
        missing: [{ requirement: 'Kubernetes' }],
      },
      acceptedEditBlockIds: ['paragraph_1'],
      acceptedReorders: 1,
    })).toEqual({
      baselineScore: 72,
      projectedScore: 76,
      improvement: 4,
      surfacedRequirements: ['Product discovery'],
      stillMissingRequirements: ['Kubernetes'],
    })
  })

  it('provides experience grouping metadata to Gemini for safe reorder plans', () => {
    const slots = blocks([
      { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Prioritized product backlog', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
    ])

    expect(templateSlotsForGemini(slots)).toEqual([
      { blockId: 'paragraph_0', index: 0, text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { blockId: 'paragraph_1', index: 1, text: 'Prioritized product backlog', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
    ])
  })

  it('accepts a text edit and bullet reorder independently', () => {
    const slots = blocks([
      { text: 'EXPERIENCE', editable: false, kind: 'heading' },
      { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: '• Coordinated stakeholders', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: '• Managed releases', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
    ])
    const response = '{"analysis":{"matched":[],"understated":[{"requirement":"Release management","evidenceBlockIds":["paragraph_3"]}],"missing":[]},"edits":[{"blockId":"paragraph_3","text":"• Led releases"}],"reorders":[{"experienceId":"experience_0","blockIds":["paragraph_3","paragraph_2"]}]}'

    expect(templateReplacements(response, slots)).toEqual([
      'EXPERIENCE',
      'Product Owner | Company A | 2022–Present',
      '• Coordinated stakeholders',
      '• Led releases',
    ])
    expect(templateReorders(response, slots)).toEqual([{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] }])
  })

  it('keeps responses without reorders fully compatible', () => {
    const slots = blocks([{ text: 'Built React dashboards', editable: true }])
    expect(templateReorders('{"edits":[{"blockId":"paragraph_0","text":"Built React tools"}]}', slots)).toEqual([])
    expect(templateMerges('{"edits":[{"blockId":"paragraph_0","text":"Built React tools"}]}', slots)).toEqual([])
  })

  it('applies an evidence-backed merge before validating a reorder of surviving bullets', () => {
    const slots = blocks([
      { text: 'EXPERIENCE', editable: false, kind: 'heading' },
      { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Prioritized product backlog and facilitated sprint planning.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Managed releases across two enterprise platforms.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
      { text: 'Coordinated stakeholders for UAT.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 2 },
    ])
    const response = '{"analysis":{"matched":[],"understated":[],"missing":[]},"edits":[],"merges":[{"experienceId":"experience_0","sourceBlockIds":["paragraph_2","paragraph_3"],"targetBlockId":"paragraph_2","text":"Managed delivery across two enterprise platforms: backlog prioritization, sprint planning, and releases."}],"reorders":[{"experienceId":"experience_0","blockIds":["paragraph_4","paragraph_2"]}]}'

    expect(templateMerges(response, slots)).toEqual([{ experienceId: 'experience_0', sourceBlockIds: ['paragraph_2', 'paragraph_3'], targetBlockId: 'paragraph_2', text: 'Managed delivery across two enterprise platforms: backlog prioritization, sprint planning, and releases.' }])
    expect(templateReplacements(response, slots)).toEqual([
      'EXPERIENCE',
      'Product Owner | Company A | 2022–Present',
      'Managed delivery across two enterprise platforms: backlog prioritization, sprint planning, and releases.',
      'Managed releases across two enterprise platforms.',
      'Coordinated stakeholders for UAT.',
    ])
    expect(templateReorders(response, slots)).toEqual([{ experienceId: 'experience_0', blockIds: ['paragraph_4', 'paragraph_2'] }])
  })

  it('rejects merge conflicts and a reorder that still references a removed bullet', () => {
    const slots = blocks([
      { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Prioritized product backlog and facilitated sprint planning.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Managed releases across two enterprise platforms.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
    ])
    const merge = '{"experienceId":"experience_0","sourceBlockIds":["paragraph_1","paragraph_2"],"targetBlockId":"paragraph_1","text":"Managed delivery across two enterprise platforms: backlog prioritization, sprint planning, and releases."}'
    const editConflict = `{"analysis":{"matched":[],"understated":[{"requirement":"Release management","evidenceBlockIds":["paragraph_1"]}],"missing":[]},"edits":[{"blockId":"paragraph_1","text":"Prioritized product backlog and facilitated sprint planning."}],"merges":[${merge}]}`
    const reorderConflict = `{"analysis":{"matched":[],"understated":[],"missing":[]},"edits":[],"merges":[${merge}],"reorders":[{"experienceId":"experience_0","blockIds":["paragraph_1","paragraph_2"]}]}`

    expect(templateMerges(editConflict, slots)).toEqual([])
    expect(templateReorders(reorderConflict, slots)).toEqual([])
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

  it('distinguishes malformed model JSON from valid JSON with the wrong response schema', () => {
    expect(tailoringResponseFailureCode('{"analysis":')).toBe('GEMINI_INVALID_JSON')
    expect(tailoringResponseFailureCode('{"unexpected":true}')).toBe('GEMINI_SCHEMA_INVALID')
  })

  it('reports redacted validation diagnostics when all proposed edits are rejected', () => {
    const slots = blocks([{ text: 'Built React dashboards for jane@example.com at +91 9876543210', editable: true }])
    const diagnostic = tailoringValidationDiagnostic('{"analysis":{"matched":[],"understated":[{"requirement":"React dashboards","evidenceBlockIds":["paragraph_0"]}],"missing":[]},"edits":[{"blockId":"paragraph_0","text":"Built React dashboards for jane@example.com"}]}', slots)

    expect(diagnostic.tailoring_result).toBe('all_proposed_edits_rejected')
    expect(diagnostic.proposed_edits[0]).toEqual({
      blockId: 'paragraph_0',
      originalText: 'Built React dashboards for [redacted-email] at [redacted-phone]',
      replacementText: 'Built React dashboards for [redacted-email]',
    })
    expect(diagnostic.validation.rejected_edits[0]?.reason).toBe('changed_number')
  })

  it('reports when the model proposes no edits', () => {
    const diagnostic = tailoringValidationDiagnostic('{"analysis":{"matched":[],"understated":[],"missing":[]},"edits":[]}', blocks([{ text: 'Built React dashboards', editable: true }]))
    expect(diagnostic.tailoring_result).toBe('model_proposed_no_edits')
    expect(diagnostic.validation).toMatchObject({ accepted_edit_count: 0, rejected_edit_count: 0 })
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
