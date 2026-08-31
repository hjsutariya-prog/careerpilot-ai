import { describe, expect, it } from 'vitest'
import { createResumeBlocks } from './resumeBlocks'
import { masterEvidenceForTemplateSlots, masterBackedRewriteReason, resolveMasterSources } from './tailoringMasterProvenance'
import { validateTailoringResponse } from './tailoringValidation'
import { validateTailoringMerges } from './tailoringMergeValidation'

const templateSlots = createResumeBlocks([
  { text: 'EXPERIENCE', editable: false, kind: 'heading' },
  { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
  { text: 'Built applications for enterprise delivery teams, coordinating stakeholders, requirements, releases, and customer operations.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
  { text: 'Business Analyst | Company B | 2019–2022', editable: false, kind: 'experience_header', experienceId: 'experience_1' },
  { text: 'Gathered business requirements for operations teams.', editable: true, kind: 'experience_bullet', experienceId: 'experience_1', bulletIndex: 0 },
])

const masterStructure = {
  resumeId: 'master-resume' as never,
  experiences: [
    {
      experienceId: 'master_experience_0', order: 0, headerText: 'Product Owner | Company A Pvt Ltd | 2022–Present', title: 'Product Owner', company: 'Company A Pvt Ltd', dateText: '2022–Present',
      blocks: [
        { blockId: 'master_experience_0_block_0', text: 'Built TypeScript applications for enterprise delivery.', kind: 'experience_bullet' as const },
        { blockId: 'master_experience_0_block_1', text: 'Managed releases across two enterprise platforms.', kind: 'experience_bullet' as const },
      ],
    },
    {
      experienceId: 'master_experience_1', order: 1, headerText: 'Business Analyst | Company B | 2019–2022', title: 'Business Analyst', company: 'Company B', dateText: '2019–2022',
      blocks: [{ blockId: 'master_experience_1_block_0', text: 'Led the UAT team of 5 analysts.', kind: 'experience_bullet' as const }],
    },
  ],
  ungroupedBlocks: [],
}

describe('Master Resume tailoring provenance', () => {
  const evidence = masterEvidenceForTemplateSlots(templateSlots, masterStructure)

  it('maps only the matching Master experience to each Template experience', () => {
    expect(evidence.byTemplateExperience.experience_0?.blocks.map((block) => block.blockId)).toEqual([
      'master_experience_0_block_0',
      'master_experience_0_block_1',
    ])
    expect(evidence.byTemplateExperience.experience_1?.blocks.map((block) => block.blockId)).toEqual(['master_experience_1_block_0'])
  })

  it('keeps no-Master and unmatched Template experiences self-sourced', () => {
    expect(masterEvidenceForTemplateSlots(templateSlots, null)).toEqual({ byTemplateExperience: {}, masterBlockExperienceIds: {} })
    const unmatchedSlots = createResumeBlocks([
      { text: 'Business Analyst | Company C | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Gathered requirements.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
    ])
    expect(masterEvidenceForTemplateSlots(unmatchedSlots, masterStructure).byTemplateExperience).toEqual({})
    const response = { analysis: { matched: [], understated: [{ requirement: 'Requirements', evidenceBlockIds: ['paragraph_1'] }], missing: [] }, edits: [{ blockId: 'paragraph_1', text: 'Gathered requirements.' }] }
    expect(validateTailoringResponse({ response, editableSlots: unmatchedSlots, enforceUnderstatedEditLinks: true }).acceptedEdits).toEqual([
      { blockId: 'paragraph_1', text: 'Gathered requirements.' },
    ])
  })

  it('accepts a cited technology that exists in the matched Master experience', () => {
    const response = {
      analysis: { matched: [], understated: [{ requirement: 'TypeScript applications', evidenceBlockIds: ['paragraph_2'], masterBlockIds: ['master_experience_0_block_0'] }], missing: [] },
      edits: [{ blockId: 'paragraph_2', text: 'Built TypeScript applications for enterprise delivery teams, coordinating stakeholders, requirements, releases, and customer operations.', sourceMasterBlockIds: ['master_experience_0_block_0'] }],
    }
    expect(validateTailoringResponse({ response, editableSlots: templateSlots, enforceUnderstatedEditLinks: true, masterEvidence: evidence }).acceptedEdits).toEqual([
      expect.objectContaining({ blockId: 'paragraph_2', sourceMasterBlockIds: ['master_experience_0_block_0'] }),
    ])
  })

  it('rejects unknown, cross-experience, and unmatched Master provenance', () => {
    const target = templateSlots[2]
    expect(resolveMasterSources({ templateBlock: target, sourceMasterBlockIds: ['missing-master-block'], masterEvidence: evidence })).toEqual({ ok: false, reason: 'unknown_master_source_block' })
    expect(resolveMasterSources({ templateBlock: target, sourceMasterBlockIds: ['master_experience_1_block_0'], masterEvidence: evidence })).toEqual({ ok: false, reason: 'master_source_cross_experience' })
    expect(resolveMasterSources({ templateBlock: target, sourceMasterBlockIds: ['master_experience_0_block_0'] })).toEqual({ ok: false, reason: 'master_source_without_match' })
  })

  it('requires a citation when an edit visibly uses a matched Master fact', () => {
    const response = {
      analysis: { matched: [], understated: [{ requirement: 'TypeScript applications', evidenceBlockIds: ['paragraph_2'] }], missing: [] },
      edits: [{ blockId: 'paragraph_2', text: 'Built TypeScript applications for enterprise delivery teams, coordinating stakeholders, requirements, releases, and customer operations.' }],
    }
    expect(validateTailoringResponse({ response, editableSlots: templateSlots, enforceUnderstatedEditLinks: true, masterEvidence: evidence }).rejectedEdits).toEqual([
      expect.objectContaining({ reason: 'master_provenance_required' }),
    ])
  })

  it('does not allow a JD-only technology when neither Template nor cited Master block supports it', () => {
    const response = {
      analysis: { matched: [], understated: [{ requirement: 'Kubernetes', evidenceBlockIds: ['paragraph_2'] }], missing: [] },
      edits: [{ blockId: 'paragraph_2', text: 'Built Kubernetes applications for enterprise delivery teams, coordinating stakeholders, requirements, releases, and customer operations.', sourceMasterBlockIds: ['master_experience_0_block_0'] }],
    }
    expect(validateTailoringResponse({ response, editableSlots: templateSlots, enforceUnderstatedEditLinks: true, masterEvidence: evidence }).rejectedEdits).toEqual([
      expect.objectContaining({ reason: 'missing_named_requirement_introduced' }),
    ])
  })

  it('rejects a new domain or stakeholder fact that is absent from both Template and cited Master evidence', () => {
    const source = templateSlots[2].text
    const replacement = source.replace('customer operations', 'banking operations')
    expect(masterBackedRewriteReason(source, replacement, [{ blockId: 'master_experience_0_block_1', text: 'Managed releases across two enterprise platforms.', kind: 'experience_bullet' }])).toBe('unsupported_master_fact')
  })

  it('allows Master leadership and metrics only when exact matched blocks support them, while retaining Template material', () => {
    const leadershipBlocks = [{ blockId: 'master_experience_0_block_9', text: 'Led 5 analysts.', kind: 'experience_bullet' as const }]
    const template = 'Built applications for enterprise delivery teams, coordinating stakeholders, requirements, releases, customer operations, quality controls, workflows, documentation, support processes, regional business units, and delivery governance.'
    expect(masterBackedRewriteReason(template, template.replace('.', '; led 5 analysts.'), leadershipBlocks)).toBeNull()

    const metricBlocks = [{ blockId: 'master_experience_0_block_10', text: 'Improved latency by 25%.', kind: 'experience_bullet' as const }]
    const metricTemplate = `${template.slice(0, -1)}, across regional product, operations, technology, risk, compliance, service, reporting, quality, platform, and customer delivery domains.`
    const metricReplacement = metricTemplate.replace('.', '; improved latency by 25%.')
    expect(masterBackedRewriteReason(metricTemplate, metricReplacement, metricBlocks)).toBeNull()
    expect(masterBackedRewriteReason(metricTemplate, metricReplacement.replace('25%', '30%'), metricBlocks)).toBe('unsupported_master_number')
  })

  it('allows a merge with valid matched Master provenance but keeps Template material preservation active', () => {
    const slots = createResumeBlocks([
      { text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { text: 'Prioritized product backlog and facilitated sprint planning.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
      { text: 'Managed releases across two enterprise platforms.', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 1 },
    ])
    const mergeEvidence = masterEvidenceForTemplateSlots(slots, masterStructure)
    const valid = validateTailoringMerges({
      resumeBlocks: slots,
      masterEvidence: mergeEvidence,
      merges: [{ experienceId: 'experience_0', sourceBlockIds: ['paragraph_1', 'paragraph_2'], targetBlockId: 'paragraph_1', text: 'Managed releases across two enterprise platforms: backlog prioritization and sprint planning.', sourceMasterBlockIds: ['master_experience_0_block_1'] }],
    })
    expect(valid.acceptedMerges).toHaveLength(1)
    const destructive = validateTailoringMerges({
      resumeBlocks: slots,
      masterEvidence: mergeEvidence,
      merges: [{ experienceId: 'experience_0', sourceBlockIds: ['paragraph_1', 'paragraph_2'], targetBlockId: 'paragraph_1', text: 'Managed product delivery.', sourceMasterBlockIds: ['master_experience_0_block_1'] }],
    })
    expect(destructive.rejectedMerges).toEqual([expect.objectContaining({ reason: 'merge_material_content_removed' })])
  })
})
