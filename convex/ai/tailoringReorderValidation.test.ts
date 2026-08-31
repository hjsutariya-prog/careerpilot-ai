import { describe, expect, it } from 'vitest'
import { createResumeBlocks } from './resumeBlocks'
import { validateTailoringReorders } from './tailoringReorderValidation'

const resumeBlocks = createResumeBlocks([
  { text: 'EXPERIENCE', editable: false, kind: 'heading' },
  { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
  { text: '• Coordinated stakeholders', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
  { text: '• Managed releases', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
  { text: 'Business Analyst | Company B | 2019–2022', editable: false, kind: 'experience_header', experienceId: 'experience_1' },
  { text: '• Supported UAT', editable: true, kind: 'experience_bullet', experienceId: 'experience_1', bulletIndex: 0 },
])

describe('experience bullet reorder validation', () => {
  it('accepts a changed pure permutation inside one experience', () => {
    const result = validateTailoringReorders({
      resumeBlocks,
      reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] }],
    })

    expect(result.acceptedReorders).toEqual([{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] }])
    expect(result.rejectedReorders).toEqual([])
  })

  it('rejects a reorder that omits an existing bullet', () => {
    const result = validateTailoringReorders({ resumeBlocks, reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_3'] }] })
    expect(result.rejectedReorders[0]?.reason).toBe('reorder_missing_block')
  })

  it('rejects an additional bullet from another experience', () => {
    const result = validateTailoringReorders({ resumeBlocks, reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2', 'paragraph_5'] }] })
    expect(result.rejectedReorders[0]?.reason).toBe('reorder_crosses_experiences')
  })

  it('rejects an unknown or duplicate bullet ID', () => {
    expect(validateTailoringReorders({ resumeBlocks, reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_99'] }] }).rejectedReorders[0]?.reason).toBe('unknown_reorder_block')
    expect(validateTailoringReorders({ resumeBlocks, reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_3'] }] }).rejectedReorders[0]?.reason).toBe('reorder_duplicate_block')
  })

  it('rejects headers, unchanged orders, unknown experiences, and duplicate experience plans', () => {
    expect(validateTailoringReorders({ resumeBlocks, reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_1', 'paragraph_2'] }] }).rejectedReorders[0]?.reason).toBe('reorder_contains_non_bullet')
    expect(validateTailoringReorders({ resumeBlocks, reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_2', 'paragraph_3'] }] }).rejectedReorders[0]?.reason).toBe('reorder_is_noop')
    expect(validateTailoringReorders({ resumeBlocks, reorders: [{ experienceId: 'experience_9', blockIds: [] }] }).rejectedReorders[0]?.reason).toBe('unknown_experience')
    expect(validateTailoringReorders({ resumeBlocks, reorders: [
      { experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] },
      { experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] },
    ] }).rejectedReorders[0]?.reason).toBe('duplicate_experience_reorder')
  })
})
