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
})
