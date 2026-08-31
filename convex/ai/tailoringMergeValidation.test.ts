import { describe, expect, it } from 'vitest'
import { createResumeBlocks } from './resumeBlocks'
import { validateTailoringMerges } from './tailoringMergeValidation'

const resumeBlocks = createResumeBlocks([
  { text: 'EXPERIENCE', editable: false, kind: 'heading' },
  { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
  { text: 'Prioritized product backlog and facilitated sprint planning.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
  { text: 'Managed releases across two enterprise platforms.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
  { text: 'Coordinated stakeholders for UAT.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 2 },
  { text: 'Business Analyst | Company B | 2019–2022', editable: false, kind: 'experience_header', experienceId: 'experience_1' },
  { text: 'Supported UAT delivery.', editable: true, kind: 'experience_bullet', experienceId: 'experience_1', bulletIndex: 0 },
])

const safeMerge = {
  experienceId: 'experience_0',
  sourceBlockIds: ['paragraph_2', 'paragraph_3'] as [string, string],
  targetBlockId: 'paragraph_2',
  text: 'Managed delivery across two enterprise platforms: backlog prioritization, sprint planning, and releases.',
}

describe('evidence-backed experience bullet merge validation', () => {
  it('accepts a bounded merge that preserves the two source bullets', () => {
    const result = validateTailoringMerges({ merges: [safeMerge], resumeBlocks })
    expect(result.acceptedMerges).toEqual([safeMerge])
    expect(result.rejectedMerges).toEqual([])
  })

  it('rejects cross-experience and non-bullet sources', () => {
    expect(validateTailoringMerges({ merges: [{ ...safeMerge, sourceBlockIds: ['paragraph_2', 'paragraph_6'] }], resumeBlocks }).rejectedMerges[0]?.reason).toBe('merge_cross_experience')
    expect(validateTailoringMerges({ merges: [{ ...safeMerge, sourceBlockIds: ['paragraph_1', 'paragraph_2'], targetBlockId: 'paragraph_2' }], resumeBlocks }).rejectedMerges[0]?.reason).toBe('merge_non_bullet')
  })

  it('rejects invalid targets, duplicate sources, and conflicting operations', () => {
    expect(validateTailoringMerges({ merges: [{ ...safeMerge, targetBlockId: 'paragraph_4' }], resumeBlocks }).rejectedMerges[0]?.reason).toBe('merge_invalid_target')
    expect(validateTailoringMerges({ merges: [{ ...safeMerge, sourceBlockIds: ['paragraph_2', 'paragraph_2'] }], resumeBlocks }).rejectedMerges[0]?.reason).toBe('merge_duplicate_source')
    expect(validateTailoringMerges({ merges: [safeMerge], resumeBlocks, acceptedEditBlockIds: ['paragraph_2'] }).rejectedMerges[0]?.reason).toBe('merge_conflict')
  })

  it('rejects an unsupported named technology, changed number, and leadership upgrade', () => {
    expect(validateTailoringMerges({ merges: [{ ...safeMerge, text: 'Led delivery across two enterprise platforms: backlog prioritization, sprint planning, and releases.' }], resumeBlocks }).rejectedMerges[0]?.reason).toBe('merge_leadership_upgraded')

    const technologyBlocks = createResumeBlocks([
      { text: 'Engineer | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Built React dashboards for delivery teams.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Delivered React dashboards for releases.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
    ])
    const technology = validateTailoringMerges({ merges: [{ experienceId: 'experience_0', sourceBlockIds: ['paragraph_1', 'paragraph_2'], targetBlockId: 'paragraph_1', text: 'Built TypeScript React dashboards for delivery releases.' }], resumeBlocks: technologyBlocks })
    expect(technology.rejectedMerges[0]?.reason).toBe('merge_named_requirement_introduced')

    const metricBlocks = createResumeBlocks([
      { text: 'Engineer | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Reduced API latency by 25%.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Improved API latency for releases.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
    ])
    const metric = validateTailoringMerges({ merges: [{ experienceId: 'experience_0', sourceBlockIds: ['paragraph_1', 'paragraph_2'], targetBlockId: 'paragraph_1', text: 'Reduced API latency by 20% for releases.' }], resumeBlocks: metricBlocks })
    expect(metric.rejectedMerges[0]?.reason).toBe('merge_number_changed')

    const leadershipBlocks = createResumeBlocks([
      { text: 'Engineer | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Coordinated release planning.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Supported sprint planning.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
    ])
    const leadership = validateTailoringMerges({ merges: [{ experienceId: 'experience_0', sourceBlockIds: ['paragraph_1', 'paragraph_2'], targetBlockId: 'paragraph_1', text: 'Led release and sprint planning.' }], resumeBlocks: leadershipBlocks })
    expect(leadership.rejectedMerges[0]?.reason).toBe('merge_leadership_upgraded')
  })

  it('rejects a merge that loses material sprint-planning evidence', () => {
    const result = validateTailoringMerges({
      merges: [{ ...safeMerge, text: 'Managed delivery across two enterprise platforms: backlog prioritization and releases.' }],
      resumeBlocks,
    })
    expect(result.rejectedMerges[0]?.reason).toBe('merge_material_content_removed')
  })
})
