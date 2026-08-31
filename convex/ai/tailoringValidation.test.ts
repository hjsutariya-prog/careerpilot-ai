import { describe, expect, it } from 'vitest'
import { validateTailoringResponse } from './tailoringValidation'
import { createResumeBlocks } from './resumeBlocks'
import { emptyTailoringAnalysis } from './tailoringSchema'

describe('tailoring semantic validation', () => {
  const editableSlots = createResumeBlocks([{ text: 'Built React dashboards', editable: true }])
  const response = (edits: Array<{ blockId: string; text: string }>) => ({ analysis: emptyTailoringAnalysis(), edits })

  it('accepts a shorter, factually equivalent edit', () => {
    const result = validateTailoringResponse({
      response: response([{ blockId: 'paragraph_0', text: 'Built React tools' }]),
      editableSlots,
    })

    expect(result.acceptedEdits).toEqual([{ blockId: 'paragraph_0', text: 'Built React tools' }])
    expect(result.rejectedEdits).toEqual([])
  })

  it('rejects a changed number', () => {
    const result = validateTailoringResponse({
      response: response([{ blockId: 'paragraph_0', text: 'Built 5 React tools' }]),
      editableSlots: createResumeBlocks([{ text: 'Built 4 React dashboards', editable: true }]),
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('changed_number')
  })

  it('rejects a changed acronym', () => {
    const result = validateTailoringResponse({
      response: response([{ blockId: 'paragraph_0', text: 'Built GCP tools' }]),
      editableSlots: createResumeBlocks([{ text: 'Built AWS dashboards', editable: true }]),
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('changed_acronym')
  })

  it('rejects an unknown block ID', () => {
    const result = validateTailoringResponse({
      response: response([{ blockId: 'paragraph_1', text: 'Built React tools' }]),
      editableSlots,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('unknown_block_id')
  })

  it('rejects an overly long non-skill replacement', () => {
    const result = validateTailoringResponse({
      response: response([{ blockId: 'paragraph_0', text: 'Built React dashboard applications' }]),
      editableSlots,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('replacement_too_long')
  })

  it('rejects an action-verb tense change', () => {
    const result = validateTailoringResponse({
      response: response([{ blockId: 'paragraph_0', text: 'Build React tools' }]),
      editableSlots,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('changed_action_tense')
  })

  it('keeps matched requirements with valid evidence', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React', evidenceBlockIds: ['paragraph_0'] }],
          understated: [],
          missing: [],
        },
        edits: [],
      },
      editableSlots,
    })

    expect(result.analysis.matched).toEqual([{ requirement: 'React', evidenceBlockIds: ['paragraph_0'] }])
    expect(result.rejectedEvidence).toEqual([])
  })

  it('accepts an edit tied to understated evidence', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [],
          understated: [{ requirement: 'React development', evidenceBlockIds: ['paragraph_0'] }],
          missing: [],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Built React tools' }],
      },
      editableSlots,
      enforceUnderstatedEditLinks: true,
    })

    expect(result.analysis.understated).toEqual([{ requirement: 'React development', evidenceBlockIds: ['paragraph_0'] }])
    expect(result.acceptedEdits).toEqual([{ blockId: 'paragraph_0', text: 'Built React tools' }])
  })

  it('keeps missing requirements as gaps and does not let them drive an edit', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [],
          understated: [],
          missing: [{ requirement: 'Kubernetes' }],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Built React tools' }],
      },
      editableSlots,
      enforceUnderstatedEditLinks: true,
    })

    expect(result.analysis.missing).toEqual([{ requirement: 'Kubernetes' }])
    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('edit_has_no_understated_evidence')
  })

  it('rejects an analysis evidence block ID that does not exist', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [],
          understated: [{ requirement: 'React development', evidenceBlockIds: ['paragraph_99'] }],
          missing: [],
        },
        edits: [],
      },
      editableSlots,
    })

    expect(result.analysis.understated).toEqual([])
    expect(result.rejectedEvidence).toEqual([{
      classification: 'understated',
      requirement: 'React development',
      blockId: 'paragraph_99',
      reason: 'unknown_evidence_block',
    }])
    expect(result.rejectedRequirements[0]?.reason).toBe('empty_evidence_block_ids')
  })

  it('invalidates a requirement that appears in matched and missing', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React', evidenceBlockIds: ['paragraph_0'] }],
          understated: [],
          missing: [{ requirement: ' react ' }],
        },
        edits: [],
      },
      editableSlots,
    })

    expect(result.analysis).toEqual({ matched: [], understated: [], missing: [] })
    expect(result.rejectedRequirements.map((item) => item.reason)).toEqual([
      'requirement_in_multiple_categories',
      'requirement_in_multiple_categories',
    ])
  })

  it('invalidates a blank requirement after trimming', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: '   ', evidenceBlockIds: ['paragraph_0'] }],
          understated: [],
          missing: [],
        },
        edits: [],
      },
      editableSlots,
    })

    expect(result.analysis.matched).toEqual([])
    expect(result.rejectedRequirements[0]?.reason).toBe('empty_requirement')
  })

  it('invalidates a requirement that appears in matched and understated', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: ' React ', evidenceBlockIds: ['paragraph_0'] }],
          understated: [{ requirement: 'react', evidenceBlockIds: ['paragraph_0'] }],
          missing: [],
        },
        edits: [],
      },
      editableSlots,
    })

    expect(result.analysis).toEqual({ matched: [], understated: [], missing: [] })
    expect(result.rejectedRequirements).toHaveLength(2)
    expect(result.rejectedRequirements.every((item) => item.reason === 'requirement_in_multiple_categories')).toBe(true)
  })

  it('removes duplicate evidence block IDs from a requirement', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React', evidenceBlockIds: ['paragraph_0', 'paragraph_0'] }],
          understated: [],
          missing: [],
        },
        edits: [],
      },
      editableSlots,
    })

    expect(result.analysis.matched).toEqual([{ requirement: 'React', evidenceBlockIds: ['paragraph_0'] }])
    expect(result.rejectedEvidence[0]?.reason).toBe('duplicate_evidence_block')
  })

  it('invalidates matched and understated requirements with no evidence', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React', evidenceBlockIds: [] }],
          understated: [{ requirement: 'TypeScript', evidenceBlockIds: [] }],
          missing: [],
        },
        edits: [],
      },
      editableSlots,
    })

    expect(result.analysis).toEqual({ matched: [], understated: [], missing: [] })
    expect(result.rejectedRequirements.map((item) => item.reason)).toEqual([
      'empty_evidence_block_ids',
      'empty_evidence_block_ids',
    ])
  })

  it('rejects an edit backed only by matched evidence', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React', evidenceBlockIds: ['paragraph_0'] }],
          understated: [],
          missing: [],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Built React tools' }],
      },
      editableSlots,
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('edit_has_no_understated_evidence')
  })

  it.each([
    ['React', 'TypeScript', 'Built React interface components.', 'Built TypeScript components.'],
    ['Docker', 'Kubernetes', 'Containerized applications with Docker.', 'Deployed Kubernetes apps.'],
    ['AWS', 'Terraform', 'Deployed AWS applications securely.', 'Deployed Terraform apps.'],
    ['SQL', 'PostgreSQL', 'Wrote SQL reporting queries.', 'Wrote PostgreSQL queries.'],
  ])('rejects %s as evidence for newly introduced %s', (_sourceTechnology, missingTechnology, source, replacement) => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [],
          understated: [{ requirement: 'Relevant delivery work', evidenceBlockIds: ['paragraph_0'] }],
          missing: [{ requirement: missingTechnology }],
        },
        edits: [{ blockId: 'paragraph_0', text: replacement }],
      },
      editableSlots: createResumeBlocks([{ text: source, editable: true }]),
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('missing_named_requirement_introduced')
  })

  it('rejects a newly introduced TypeScript claim even when Gemini labels it understated', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React', evidenceBlockIds: ['paragraph_0'] }],
          understated: [{ requirement: 'TypeScript', evidenceBlockIds: ['paragraph_0'] }],
          missing: [],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Built TypeScript components.' }],
      },
      editableSlots: createResumeBlocks([{ text: 'Built React interface components.', editable: true }]),
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('missing_named_requirement_introduced')
  })

  it('allows an explicitly present named technology to be safely rephrased', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [],
          understated: [{ requirement: 'TypeScript dashboards', evidenceBlockIds: ['paragraph_0'] }],
          missing: [],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Built TypeScript dashboards.' }],
      },
      editableSlots: createResumeBlocks([{ text: 'Built TypeScript dashboard applications.', editable: true }]),
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([{ blockId: 'paragraph_0', text: 'Built TypeScript dashboards.' }])
  })

  it('accepts an exact skills reorder backed by matched evidence', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React and TypeScript', evidenceBlockIds: ['paragraph_0'] }],
          understated: [{ requirement: 'Skills-line relevance', evidenceBlockIds: ['paragraph_0'] }],
          missing: [{ requirement: 'Kubernetes' }],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Skills: React, TypeScript, JavaScript' }],
      },
      editableSlots: createResumeBlocks([{ text: 'Skills: JavaScript, React, TypeScript', editable: true }]),
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([{ blockId: 'paragraph_0', text: 'Skills: React, TypeScript, JavaScript' }])
  })

  it('accepts an exact skills reorder backed by understated evidence', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [],
          understated: [{ requirement: 'React and TypeScript relevance', evidenceBlockIds: ['paragraph_0'] }],
          missing: [],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Skills: React, TypeScript, JavaScript' }],
      },
      editableSlots: createResumeBlocks([{ text: 'Skills: JavaScript, React, TypeScript', editable: true }]),
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([{ blockId: 'paragraph_0', text: 'Skills: React, TypeScript, JavaScript' }])
  })

  it('rejects an exact skills reorder when matched evidence does not name a skill from the line', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'Web application delivery', evidenceBlockIds: ['paragraph_0'] }],
          understated: [],
          missing: [],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Skills: React, TypeScript, JavaScript' }],
      },
      editableSlots: createResumeBlocks([{ text: 'Skills: JavaScript, React, TypeScript', editable: true }]),
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('edit_has_no_understated_evidence')
  })

  it('rejects a skills reorder that adds a missing technology', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React and TypeScript', evidenceBlockIds: ['paragraph_0'] }],
          understated: [{ requirement: 'Skills-line relevance', evidenceBlockIds: ['paragraph_0'] }],
          missing: [{ requirement: 'Kubernetes' }],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Skills: React, TypeScript, Kubernetes' }],
      },
      editableSlots: createResumeBlocks([{ text: 'Skills: React, TypeScript', editable: true }]),
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('missing_named_requirement_introduced')
  })

  it('rejects a skills reorder that removes an existing skill', () => {
    const result = validateTailoringResponse({
      response: {
        analysis: {
          matched: [{ requirement: 'React', evidenceBlockIds: ['paragraph_0'] }],
          understated: [{ requirement: 'Skills-line relevance', evidenceBlockIds: ['paragraph_0'] }],
          missing: [],
        },
        edits: [{ blockId: 'paragraph_0', text: 'Skills: React' }],
      },
      editableSlots: createResumeBlocks([{ text: 'Skills: React, TypeScript', editable: true }]),
      enforceUnderstatedEditLinks: true,
    })

    expect(result.acceptedEdits).toEqual([])
    expect(result.rejectedEdits[0]?.reason).toBe('unsafe_skill_reorder')
  })
})
