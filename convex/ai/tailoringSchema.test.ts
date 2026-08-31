import { describe, expect, it } from 'vitest'
import { parseLegacyIndexedTailoringResponse, parseTailoringResponse } from './tailoringSchema'

describe('tailoring response schema', () => {
  it('parses the canonical analysis and edits response format', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[{"requirement":"React","evidenceBlockIds":["paragraph_1"]}],"understated":[{"requirement":"TypeScript","evidenceBlockIds":["paragraph_2"]}],"missing":[{"requirement":"Kubernetes"}]},"edits":[{"blockId":"paragraph_2","text":"Built TypeScript tools"}]}')).toEqual({
      analysis: {
        matched: [{ requirement: 'React', evidenceBlockIds: ['paragraph_1'] }],
        understated: [{ requirement: 'TypeScript', evidenceBlockIds: ['paragraph_2'] }],
        missing: [{ requirement: 'Kubernetes' }],
      },
      edits: [{ blockId: 'paragraph_2', text: 'Built TypeScript tools' }],
      analysisProvided: true,
    })
  })

  it('preserves optional Master block provenance without changing Template-only responses', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[{"requirement":"Agile delivery","evidenceBlockIds":["paragraph_1"],"masterBlockIds":["master_experience_0_block_0"]}],"understated":[],"missing":[]},"edits":[{"blockId":"paragraph_1","text":"Worked on agile delivery.","sourceMasterBlockIds":["master_experience_0_block_0"]}],"merges":[{"experienceId":"experience_0","sourceBlockIds":["paragraph_1","paragraph_2"],"targetBlockId":"paragraph_1","text":"Merged delivery work.","sourceMasterBlockIds":["master_experience_0_block_0"]}]}')).toMatchObject({
      analysis: { matched: [{ requirement: 'Agile delivery', evidenceBlockIds: ['paragraph_1'], masterBlockIds: ['master_experience_0_block_0'] }] },
      edits: [{ blockId: 'paragraph_1', sourceMasterBlockIds: ['master_experience_0_block_0'] }],
      merges: [{ sourceMasterBlockIds: ['master_experience_0_block_0'] }],
    })
  })

  it('uses an empty analysis for the previous edits-only response format', () => {
    expect(parseTailoringResponse('{"edits":[{"blockId":"paragraph_1","text":"Built React tools"}]}')).toEqual({
      analysis: { matched: [], understated: [], missing: [] },
      edits: [{ blockId: 'paragraph_1', text: 'Built React tools' }],
      analysisProvided: false,
    })
  })

  it('parses an optional pure experience-bullet reorder plan', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[],"understated":[],"missing":[]},"edits":[],"reorders":[{"experienceId":"experience_0","blockIds":["paragraph_3","paragraph_2"]}]}')).toMatchObject({
      analysis: { matched: [], understated: [], missing: [] },
      edits: [],
      reorders: [{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] }],
      analysisProvided: true,
    })
  })

  it('rejects a malformed reorder plan', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[],"understated":[],"missing":[]},"edits":[],"reorders":[{"experienceId":"experience_0","blockIds":[3]}]}')).toBeNull()
  })

  it('parses an optional two-source evidence-backed merge plan', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[],"understated":[],"missing":[]},"edits":[],"merges":[{"experienceId":"experience_0","sourceBlockIds":["paragraph_2","paragraph_3"],"targetBlockId":"paragraph_2","text":"Managed product delivery."}]}')).toMatchObject({
      merges: [{
        experienceId: 'experience_0',
        sourceBlockIds: ['paragraph_2', 'paragraph_3'],
        targetBlockId: 'paragraph_2',
        text: 'Managed product delivery.',
      }],
    })
  })

  it('rejects a merge that does not contain exactly two source IDs', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[],"understated":[],"missing":[]},"edits":[],"merges":[{"experienceId":"experience_0","sourceBlockIds":["paragraph_2"],"targetBlockId":"paragraph_2","text":"Merged text"}]}')).toBeNull()
  })

  it('rejects malformed JSON', () => {
    expect(parseTailoringResponse('{"edits":')).toBeNull()
  })

  it('repairs a missing comma before validating the response shape', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[],"understated":[],"missing":[]} "edits":[]}')).toEqual({
      analysis: { matched: [], understated: [], missing: [] },
      edits: [],
      analysisProvided: true,
    })
  })

  it('rejects a response without its required edits field', () => {
    expect(parseTailoringResponse('{"replacements":[]}')).toBeNull()
  })

  it('rejects a partial analysis object', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[],"understated":[]},"edits":[]}')).toBeNull()
  })

  it('rejects evidence on a missing requirement', () => {
    expect(parseTailoringResponse('{"analysis":{"matched":[],"understated":[],"missing":[{"requirement":"Kubernetes","evidenceBlockIds":["paragraph_1"]}]},"edits":[]}')).toBeNull()
  })

  it('rejects an edit without a numeric index and string text', () => {
    expect(parseTailoringResponse('{"edits":[{"blockId":1,"text":42}]}')).toBeNull()
  })

  it('parses the prior index response only through the legacy parser', () => {
    expect(parseTailoringResponse('{"edits":[{"index":1,"text":"Built React tools"}]}')).toBeNull()
    expect(parseLegacyIndexedTailoringResponse('{"edits":[{"index":1,"text":"Built React tools"}]}')).toEqual({
      edits: [{ index: 1, text: 'Built React tools' }],
    })
  })
})
