import { describe, expect, it } from 'vitest'
import { areResumeBlocksConsistent, createResumeBlocks } from './resumeBlocks'

describe('resume blocks', () => {
  const slots = [
    { text: 'PRIYA SHAH', editable: false },
    { text: 'Built React dashboards', editable: true },
    { text: 'EXPERIENCE', editable: false },
  ]

  it('creates deterministic, unique IDs without using resume text', () => {
    const first = createResumeBlocks(slots)
    const second = createResumeBlocks(slots)

    expect(first).toEqual(second)
    expect(first.map((block) => block.blockId)).toEqual(['paragraph_0', 'paragraph_1', 'paragraph_2'])
    expect(new Set(first.map((block) => block.blockId)).size).toBe(first.length)
  })

  it('keeps the legacy dense index and protected-block status', () => {
    expect(createResumeBlocks(slots)).toEqual([
      { blockId: 'paragraph_0', index: 0, text: 'PRIYA SHAH', editable: false },
      { blockId: 'paragraph_1', index: 1, text: 'Built React dashboards', editable: true },
      { blockId: 'paragraph_2', index: 2, text: 'EXPERIENCE', editable: false },
    ])
  })

  it('rejects duplicate IDs and block IDs that do not match their index', () => {
    const blocks = createResumeBlocks(slots)
    expect(areResumeBlocksConsistent(blocks)).toBe(true)
    expect(areResumeBlocksConsistent([{ ...blocks[0] }, { ...blocks[1], blockId: 'paragraph_0' }])).toBe(false)
    expect(areResumeBlocksConsistent([{ ...blocks[0], blockId: 'paragraph_4' }])).toBe(false)
  })

  it('keeps deterministic IDs while retaining deterministic experience bullet order', () => {
    const blocks = createResumeBlocks([
      { text: 'EXPERIENCE', editable: false, kind: 'heading' },
      { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Prioritized product backlog', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Facilitated sprint planning', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
      { text: 'Business Analyst | Company B | 2019–2022', editable: false, kind: 'experience_header', experienceId: 'experience_1' },
      { text: 'Gathered business requirements', editable: true, kind: 'experience_bullet', experienceId: 'experience_1', bulletIndex: 0 },
    ])

    expect(blocks.map((block) => block.blockId)).toEqual(['paragraph_0', 'paragraph_1', 'paragraph_2', 'paragraph_3', 'paragraph_4', 'paragraph_5'])
    expect(blocks.filter((block) => block.kind === 'experience_bullet')).toMatchObject([
      { experienceId: 'experience_0', bulletIndex: 0 },
      { experienceId: 'experience_0', bulletIndex: 1 },
      { experienceId: 'experience_1', bulletIndex: 0 },
    ])
    expect(areResumeBlocksConsistent(blocks)).toBe(true)
  })

  it('rejects malformed or conflicting experience metadata', () => {
    const valid = createResumeBlocks([
      { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Prioritized product backlog', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Facilitated sprint planning', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
    ])

    expect(areResumeBlocksConsistent([{ ...valid[0], experienceId: 'experience_x' }, ...valid.slice(1)])).toBe(false)
    expect(areResumeBlocksConsistent([{ ...valid[0] }, { ...valid[1], bulletIndex: 1 }, { ...valid[2], bulletIndex: 1 }])).toBe(false)
    expect(areResumeBlocksConsistent([{ ...valid[0] }, { ...valid[1], bulletIndex: -1 }, valid[2]])).toBe(false)
    expect(areResumeBlocksConsistent([{ ...valid[0], editable: true }, ...valid.slice(1)])).toBe(false)
    expect(areResumeBlocksConsistent([{ ...valid[0] }, { ...valid[1], kind: 'other' }, valid[2]])).toBe(false)
  })

  it('does not require ungrouped blocks to carry experience metadata', () => {
    const blocks = createResumeBlocks([{ text: 'A paragraph with an uncertain structure', editable: true, kind: 'other' }])
    expect(blocks).toEqual([{ blockId: 'paragraph_0', index: 0, text: 'A paragraph with an uncertain structure', editable: true, kind: 'other' }])
    expect(areResumeBlocksConsistent(blocks)).toBe(true)
  })

  it('rejects an experience bullet placed after the next experience header', () => {
    const blocks = createResumeBlocks([
      { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Prioritized product backlog', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Business Analyst | Company B | 2019–2022', editable: false, kind: 'experience_header', experienceId: 'experience_1' },
      { text: 'Facilitated sprint planning', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
      { text: 'Supported UAT', editable: true, kind: 'experience_bullet', experienceId: 'experience_1', bulletIndex: 0 },
    ])

    expect(areResumeBlocksConsistent(blocks)).toBe(false)
  })
})
