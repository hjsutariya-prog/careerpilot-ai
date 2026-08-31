import { describe, expect, it } from 'vitest'
import { tailoringEvalCases } from './tailoringEvalCases'
import { evaluateTailoringResponse, masterEvidenceForEvalCase, requirementConceptMatches, summarizeTailoringEvaluation, summarizeTailoringEvalRuns, summarizeTailoringEvalSuite } from './tailoringEval'

const evalCase = (id: string) => {
  const found = tailoringEvalCases.find((item) => item.id === id)
  if (!found) throw new Error(`Missing evaluation case: ${id}`)
  return found
}

describe('resume tailoring evaluation harness', () => {
  it('recognizes conservative requirement concepts across harmless wording changes', () => {
    expect(requirementConceptMatches({ concept: 'AWS' }, 'Deploy applications on AWS')).toBe(true)
    expect(requirementConceptMatches({ concept: 'Kubernetes' }, 'Deploy applications on Kubernetes')).toBe(true)
    expect(requirementConceptMatches({ concept: 'API development' }, 'Develop APIs')).toBe(true)
    expect(requirementConceptMatches({ concept: 'API latency optimization' }, 'Optimize API latency')).toBe(true)
    expect(requirementConceptMatches({ concept: 'Engineering leadership' }, 'Lead engineering teams')).toBe(true)
    expect(requirementConceptMatches({ concept: 'REST APIs' }, 'REST architecture')).toBe(true)
    expect(requirementConceptMatches({ concept: 'REST APIs' }, 'REST API development')).toBe(true)
  })

  it('does not use substring matching or match unrelated concepts', () => {
    expect(requirementConceptMatches({ concept: 'Java' }, 'JavaScript development')).toBe(false)
    expect(requirementConceptMatches({ concept: 'Kubernetes' }, 'Container orchestration')).toBe(false)
  })

  it('defines 36 synthetic cases across all evaluation categories', () => {
    expect(tailoringEvalCases).toHaveLength(36)
    expect(new Set(tailoringEvalCases.map((item) => item.category))).toEqual(new Set([
      'Backend',
      'Frontend',
      'Data',
      'AI/ML',
      'Product',
      'DevOps',
      'Safety/edge cases',
    ]))
  })

  it('derives only matched Master blocks for Master-aware cases and none for the no-Master fallback', () => {
    const projectDelivery = masterEvidenceForEvalCase(evalCase('master-backed-project-delivery'))
    expect(projectDelivery.byTemplateExperience.experience_0?.blocks.map((block) => block.blockId)).toEqual([
      'master_experience_0_block_0',
      'master_experience_0_block_1',
      'master_experience_0_block_2',
    ])
    const crossExperience = masterEvidenceForEvalCase(evalCase('master-cross-experience-leak'))
    expect(crossExperience.byTemplateExperience.experience_0?.blocks.map((block) => block.blockId)).toEqual(['master_experience_0_block_0'])
    expect(masterEvidenceForEvalCase(evalCase('no-master-fallback'))).toEqual({ byTemplateExperience: {}, masterBlockExperienceIds: {} })
  })

  it('accepts an exact cited Master metric and rejects missing or cross-experience Master provenance', () => {
    const metricCase = evalCase('master-supported-metric')
    const metricSource = metricCase.resumeBlocks[1].text
    const metricResponse = {
      analysis: { matched: [], understated: [{ requirement: 'Improve processing time', evidenceBlockIds: ['paragraph_1'], masterBlockIds: ['master_experience_0_block_0'] }], missing: [] },
      edits: [{ blockId: 'paragraph_1', text: metricSource.replace('.', '; improved processing time by 35%.'), sourceMasterBlockIds: ['master_experience_0_block_0'] }],
    }
    const metricSummary = evaluateTailoringResponse(metricCase, metricResponse)
    expect(metricSummary.acceptedEditCount).toBe(1)
    expect(metricSummary.changedNumbers).toEqual([])
    expect(metricSummary.safetyPass).toBe(true)

    const projectCase = evalCase('master-backed-project-delivery')
    const missingCitation = evaluateTailoringResponse(projectCase, {
      analysis: { matched: [], understated: [{ requirement: 'Sprint planning', evidenceBlockIds: ['paragraph_1'] }], missing: [] },
      edits: [{ blockId: 'paragraph_1', text: 'Worked with cross-functional teams on sprint planning.' }],
    })
    expect(missingCitation.rejectedEditReasons).toContain('master_provenance_required')

    const crossCase = evalCase('master-cross-experience-leak')
    const crossExperience = evaluateTailoringResponse(crossCase, {
      analysis: { matched: [{ requirement: 'React', evidenceBlockIds: ['paragraph_1'] }], understated: [{ requirement: 'TypeScript', evidenceBlockIds: ['paragraph_1'] }], missing: [] },
      edits: [{ blockId: 'paragraph_1', text: 'Built React TypeScript applications for product teams.', sourceMasterBlockIds: ['master_experience_1_block_0'] }],
    })
    expect(crossExperience.rejectedEditReasons).toContain('master_source_cross_experience')
    expect(crossExperience.safetyPass).toBe(true)
  })

  it('keeps JD-only banking out while allowing explicitly cited Master leadership', () => {
    const bankingCase = evalCase('master-jd-only-banking')
    const bankingSource = bankingCase.resumeBlocks[1].text
    const banking = evaluateTailoringResponse(bankingCase, {
      analysis: { matched: [], understated: [{ requirement: 'Banking analysis', evidenceBlockIds: ['paragraph_1'] }], missing: [{ requirement: 'Banking' }] },
      edits: [{ blockId: 'paragraph_1', text: bankingSource.replace('product delivery', 'banking delivery'), sourceMasterBlockIds: ['master_experience_0_block_0'] }],
    })
    expect(banking.acceptedEditCount).toBe(0)
    expect(banking.rejectedEditReasons).toContain('unsupported_master_fact')

    const leadershipCase = evalCase('master-supported-leadership')
    const leadershipSource = leadershipCase.resumeBlocks[1].text
    const leadership = evaluateTailoringResponse(leadershipCase, {
      analysis: { matched: [], understated: [{ requirement: 'Lead analyst teams', evidenceBlockIds: ['paragraph_1'], masterBlockIds: ['master_experience_0_block_0'] }], missing: [] },
      edits: [{ blockId: 'paragraph_1', text: leadershipSource.replace('.', '; led a team of 4 analysts.'), sourceMasterBlockIds: ['master_experience_0_block_0'] }],
    })
    expect(leadership.acceptedEditCount).toBe(1)
    expect(leadership.safetyPass).toBe(true)
  })

  it('does not require unrelated positive facts in evaluator-only boundary cases', () => {
    for (const id of [
      'data-bi-dashboard-understated',
      'product-stakeholder-not-owner',
      'safety-mentored-not-managed',
      'safety-managed-not-owned',
      'certification-education-domain-boundary',
    ]) {
      expect(evalCase(id).expectations.shouldRecognizeMatched).toBeUndefined()
    }
  })

  it('accepts zero edits when Python API capability is already matched', () => {
    const summary = evaluateTailoringResponse(evalCase('api-capability-with-missing-rest'), {
      analysis: {
        matched: [{ requirement: 'Develop APIs using Python', evidenceBlockIds: ['paragraph_0'] }],
        understated: [],
        missing: [{ requirement: 'REST APIs' }],
      },
      edits: [],
    })

    expect(summary.analysisRecognitionFailures).toEqual([])
    expect(summary.acceptedEditCount).toBe(0)
    expect(summary.acceptedEditCount).toBeLessThanOrEqual(8)
    expect(summary.unsupportedKeywordIntroductions).toEqual([])
    expect(summary.editsWithoutUnderstatedEvidence).toEqual([])
    expect(summary.passed).toBe(true)
  })

  it('does not accept unsupported REST terminology for the Python API case', () => {
    const summary = evaluateTailoringResponse(evalCase('api-capability-with-missing-rest'), {
      analysis: {
        matched: [{ requirement: 'Develop APIs using Python', evidenceBlockIds: ['paragraph_0'] }],
        understated: [],
        missing: [{ requirement: 'REST APIs' }],
      },
      edits: [{ blockId: 'paragraph_0', text: 'Built REST APIs using Python.' }],
    })

    expect(summary.acceptedEditCount).toBe(0)
    expect(summary.unsupportedKeywordIntroductions).toEqual([])
    expect(summary.passed).toBe(false)
  })

  it('does not accept a missing Kubernetes claim', () => {
    const summary = evaluateTailoringResponse(evalCase('missing-kubernetes'), {
      analysis: {
        matched: [{ requirement: 'AWS', evidenceBlockIds: ['paragraph_0'] }],
        understated: [],
        missing: [{ requirement: 'Kubernetes' }],
      },
      edits: [{ blockId: 'paragraph_0', text: 'Deployed Kubernetes applications to AWS.' }],
    })

    expect(summary.acceptedEditCount).toBe(0)
    expect(summary.missingRequirementLeakage).toBe(false)
    expect(summary.editsWithoutUnderstatedEvidence).toEqual(['paragraph_0'])
    expect(summary.passed).toBe(false)
  })

  it('keeps an already-aligned resume untouched', () => {
    const summary = evaluateTailoringResponse(evalCase('already-aligned-python-api'), {
      analysis: {
        matched: [{ requirement: 'Python APIs', evidenceBlockIds: ['paragraph_0'] }],
        understated: [],
        missing: [],
      },
      edits: [],
    })

    expect(summary.acceptedEditCount).toBe(0)
    expect(summary.untouchedWhenAlreadyAligned).toBe(true)
    expect(summary.passed).toBe(true)
  })

  it('treats an exact skills reorder backed by matched evidence as valid', () => {
    const summary = evaluateTailoringResponse(evalCase('skills-reordering-no-insert'), {
      analysis: {
        matched: [{ requirement: 'React and TypeScript', evidenceBlockIds: ['paragraph_0'] }],
        understated: [],
        missing: [{ requirement: 'Kubernetes' }],
      },
      edits: [{ blockId: 'paragraph_0', text: 'Skills: React, TypeScript, JavaScript' }],
    })

    expect(summary.acceptedEditCount).toBe(1)
    expect(summary.editsWithoutUnderstatedEvidence).toEqual([])
    expect(summary.passed).toBe(true)
  })

  it('rejects an unsupported leadership claim', () => {
    const summary = evaluateTailoringResponse(evalCase('unsupported-engineering-leadership'), {
      analysis: {
        matched: [],
        understated: [],
        missing: [{ requirement: 'Engineering leadership' }],
      },
      edits: [{ blockId: 'paragraph_0', text: 'Led engineering teams.' }],
    })

    expect(summary.acceptedEditCount).toBe(0)
    expect(summary.unsupportedKeywordIntroductions).toEqual([])
    expect(summary.rejectedEditCount).toBe(1)
  })

  it('does not accept a changed metric', () => {
    const summary = evaluateTailoringResponse(evalCase('metric-protection'), {
      analysis: {
        matched: [{ requirement: 'Optimize checkout performance', evidenceBlockIds: ['paragraph_0'] }],
        understated: [{ requirement: 'Concise wording', evidenceBlockIds: ['paragraph_0'] }],
        missing: [],
      },
      edits: [{ blockId: 'paragraph_0', text: 'Improved API latency by 30%.' }],
    })

    expect(summary.acceptedEditCount).toBe(0)
    expect(summary.changedNumbers).toEqual([])
    expect(summary.rejectedEditReasons).toContain('changed_number')
    expect(summary.unrecognizedExpectedRequirements).toEqual([])
    expect(summary.analysisPass).toBe(true)
    expect(summary.editQualityPass).toBe(false)
    expect(summary.safetyPass).toBe(true)
    expect(summary.overallPass).toBe(false)
  })

  it('separates an incorrect TypeScript analysis from a safe final resume', () => {
    const summary = evaluateTailoringResponse(evalCase('frontend-typescript-not-implied'), {
      analysis: {
        matched: [{ requirement: 'React applications', evidenceBlockIds: ['paragraph_0'] }],
        understated: [{ requirement: 'TypeScript', evidenceBlockIds: ['paragraph_0'] }],
        missing: [],
      },
      edits: [{ blockId: 'paragraph_0', text: 'Built TypeScript components with React.' }],
    })

    expect(summary.analysisPass).toBe(false)
    expect(summary.editQualityPass).toBe(false)
    expect(summary.safetyPass).toBe(true)
    expect(summary.overallPass).toBe(false)
    expect(summary.rejectedEditReasons).toContain('missing_named_requirement_introduced')
  })

  it('records a true safety failure when an unsafe edit is treated as accepted', () => {
    const evalCaseValue = evalCase('missing-kubernetes')
    const summary = summarizeTailoringEvaluation(evalCaseValue, {
      analysis: { matched: [{ requirement: 'AWS', evidenceBlockIds: ['paragraph_0'] }], understated: [], missing: [{ requirement: 'Kubernetes' }] },
      edits: [{ blockId: 'paragraph_0', text: 'Deployed Kubernetes applications to AWS.' }],
    }, {
      acceptedEdits: [{ blockId: 'paragraph_0', text: 'Deployed Kubernetes applications to AWS.' }],
      rejectedEdits: [],
      analysis: { matched: [{ requirement: 'AWS', evidenceBlockIds: ['paragraph_0'] }], understated: [], missing: [{ requirement: 'Kubernetes' }] },
      rejectedEvidence: [],
      rejectedRequirements: [],
      diagnostics: { proposed: 1, editable: 1, nonEmpty: 1, withinLength: 1, safe: 1 },
    })

    expect(summary.safetyPass).toBe(false)
    expect(summary.overallPass).toBe(false)
    expect(summary.unsupportedNamedTechnologySurvivals).toEqual(['kubernetes'])
  })

  it('summarizes suite-level pass, safety, and edit-quality metrics', () => {
    const safe = evaluateTailoringResponse(evalCase('already-aligned-python-api'), {
      analysis: { matched: [{ requirement: 'Python APIs', evidenceBlockIds: ['paragraph_0'] }], understated: [], missing: [] },
      edits: [],
    })
    const unsafe = evaluateTailoringResponse(evalCase('missing-kubernetes'), {
      analysis: { matched: [{ requirement: 'AWS', evidenceBlockIds: ['paragraph_0'] }], understated: [], missing: [{ requirement: 'Kubernetes' }] },
      edits: [{ blockId: 'paragraph_0', text: 'Deployed Kubernetes applications to AWS.' }],
    })
    const suite = summarizeTailoringEvalSuite([safe, unsafe])

    expect(suite.totalCases).toBe(2)
    expect(suite.passedCases).toBe(1)
    expect(suite.totalProposedEdits).toBe(1)
    expect(suite.totalAcceptedEdits).toBe(0)
    expect(suite.missingRequirementLeakageCount).toBe(0)
    expect(suite.editPrecisionProxy.label).toContain('heuristic')
    expect(suite.categories.Backend).toEqual({ passed: 1, total: 1 })
    expect(suite.categories.DevOps).toEqual({ passed: 0, total: 1 })
    expect(suite.productionSafetyGate).toBe(true)
  })

  it('records accepted leadership upgrades as strict safety violations', () => {
    const summary = evaluateTailoringResponse(evalCase('unsupported-engineering-leadership'), {
      analysis: {
        matched: [],
        understated: [{ requirement: 'Release delivery', evidenceBlockIds: ['paragraph_0'] }],
        missing: [{ requirement: 'Engineering leadership' }],
      },
      edits: [{ blockId: 'paragraph_0', text: 'Led engineering team releases.' }],
    })
    const suite = summarizeTailoringEvalSuite([summary])

    expect(summary.leadershipUpgradeViolations).toEqual(['led'])
    expect(summary.passed).toBe(false)
    expect(suite.leadershipUpgradeViolations).toBe(1)
    expect(suite.productionSafetyGate).toBe(false)
  })

  it('classifies stable passes, flaky cases, and stable failures across multiple runs', () => {
    const stable = evaluateTailoringResponse(evalCase('already-aligned-python-api'), {
      analysis: { matched: [{ requirement: 'Python APIs', evidenceBlockIds: ['paragraph_0'] }], understated: [], missing: [] },
      edits: [],
    })
    const flakyFailure = { ...stable, caseId: 'flaky-case', overallPass: false, passed: false, analysisPass: false }
    const stableFailure = { ...stable, caseId: 'stable-failure', overallPass: false, passed: false, analysisPass: false, safetyPass: false }
    const summary = summarizeTailoringEvalRuns([
      stable,
      { ...stable },
      flakyFailure,
      { ...stable, caseId: 'flaky-case' },
      stableFailure,
      { ...stableFailure },
    ], 2)

    expect(summary.totalModelCalls).toBe(6)
    expect(summary.runs).toBe(2)
    expect(summary.cases.find((item) => item.caseId === stable.caseId)).toMatchObject({ stablePass: true, overallPasses: 2 })
    expect(summary.cases.find((item) => item.caseId === 'flaky-case')).toMatchObject({ flaky: true, overallPasses: 1, analysisPasses: 1 })
    expect(summary.cases.find((item) => item.caseId === 'stable-failure')).toMatchObject({ stableFailure: true, overallPasses: 0 })
    expect(summary.safetyPassRate).toBeLessThan(1)
  })
})
