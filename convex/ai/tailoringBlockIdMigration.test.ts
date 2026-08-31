import { describe, expect, it } from 'vitest'
import { createResumeBlocks } from './resumeBlocks'
import { emptyTailoringAnalysis, parseTailoringResponse } from './tailoringSchema'
import { validateTailoringResponse } from './tailoringValidation'
import { templateReplacements } from '../tailoredResumes'

describe('tailoring block ID migration', () => {
  const blocks = createResumeBlocks([
    { text: 'PRIYA SHAH', editable: false },
    { text: 'Built React dashboards', editable: true },
  ])
  const response = (edits: Array<{ blockId: string; text: string }>) => ({ analysis: emptyTailoringAnalysis(), edits })

  it('parses a legacy blockId edit with empty analysis', () => {
    expect(parseTailoringResponse('{"edits":[{"blockId":"paragraph_1","text":"Built React tools"}]}')).toEqual({
      analysis: { matched: [], understated: [], missing: [] },
      edits: [{ blockId: 'paragraph_1', text: 'Built React tools' }],
      analysisProvided: false,
    })
  })

  it('accepts a valid editable blockId and resolves it to the existing replacement position', () => {
    expect(templateReplacements('{"edits":[{"blockId":"paragraph_1","text":"Built React tools"}]}', blocks)).toEqual([
      'PRIYA SHAH',
      'Built React tools',
    ])
  })

  it('rejects unknown or invented block IDs', () => {
    const result = validateTailoringResponse({ response: response([{ blockId: 'paragraph_99', text: 'Built React tools' }]), editableSlots: blocks })
    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('unknown_block_id')
  })

  it('rejects a duplicate edit for the same block ID', () => {
    const result = validateTailoringResponse({ response: response([{ blockId: 'paragraph_1', text: 'Built React tools' }, { blockId: 'paragraph_1', text: 'Built React apps' }]), editableSlots: blocks })
    expect(result.acceptedEdits).toEqual([{ blockId: 'paragraph_1', text: 'Built React tools' }])
    expect(result.rejectedEdits[0]?.reason).toBe('duplicate_block_id')
  })

  it('rejects a protected block ID', () => {
    const result = validateTailoringResponse({ response: response([{ blockId: 'paragraph_0', text: 'PRIYA S.' }]), editableSlots: blocks })
    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('protected_slot')
  })

  it('keeps the legacy numeric-index response working temporarily', () => {
    expect(templateReplacements('{"edits":[{"index":1,"text":"Built React tools"}]}', blocks)).toEqual([
      'PRIYA SHAH',
      'Built React tools',
    ])
  })
})
