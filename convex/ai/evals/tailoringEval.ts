import { parseTailoringResponse, type ParsedTailoringResponse, type TailoringResponse } from '../tailoringSchema'
import { isSafeSkillReorder, validateTailoringResponse, type TailoringValidationResult } from '../tailoringValidation'
import type { TailoringEvalCase, TailoringEvalCategory, TailoringEvalRequirementExpectation } from './tailoringEvalCases'

type RequirementCategory = 'matched' | 'understated' | 'missing'
type ExpectedRequirementCategory = RequirementCategory | 'matched_or_understated'

export type RequirementRecognition = {
  category: RequirementCategory
  concept: string
  matchedGeminiRequirement: string
}

export type RequirementRecognitionFailure = {
  category: ExpectedRequirementCategory
  concept: string
}

export type TailoringEvalSummary = {
  caseId: string
  category: TailoringEvalCategory
  proposedEditCount: number
  acceptedEditCount: number
  rejectedEditCount: number
  unsupportedKeywordIntroductions: string[]
  missingRequirementLeakage: boolean
  changedNumbers: string[]
  leadershipUpgradeViolations: string[]
  editsWithoutUnderstatedEvidence: string[]
  untouchedWhenAlreadyAligned: boolean
  alreadyAlignedOverEdit: boolean
  unrecognizedExpectedRequirements: string[]
  analysisRecognitionMatches: RequirementRecognition[]
  analysisRecognitionFailures: RequirementRecognitionFailure[]
  invalidEditableTargets: string[]
  protectedBlockModifications: string[]
  unknownAcceptedBlockIds: string[]
  acceptedEditsWithoutRequiredEvidence: string[]
  unsupportedNamedTechnologySurvivals: string[]
  rejectedEditReasons: string[]
  safetyFailures: string[]
  editQualityFailures: string[]
  analysisPass: boolean
  editQualityPass: boolean
  safetyPass: boolean
  overallPass: boolean
  passed: boolean
  parseError?: boolean
}

export type TailoringEvalSuiteSummary = {
  totalCases: number
  passedCases: number
  passRate: number
  totalProposedEdits: number
  totalAcceptedEdits: number
  totalRejectedEdits: number
  missingRequirementLeakageCount: number
  unsupportedTermIntroductionCount: number
  numberChangeCount: number
  leadershipUpgradeViolations: number
  alreadyAlignedOverEditCount: number
  protectedBlockModificationCount: number
  unknownAcceptedBlockCount: number
  evidenceBypassCount: number
  unsupportedNamedTechnologySurvivalCount: number
  analysisPassedCases: number
  analysisPassRate: number
  editQualityPassedCases: number
  editQualityPassRate: number
  safetyPassedCases: number
  safetyPassRate: number
  overallPassedCases: number
  overallPassRate: number
  productionSafetyGate: boolean
  editPrecisionProxy: { value: number | null; label: string }
  categories: Record<TailoringEvalCategory, { passed: number; total: number }>
}

export type TailoringEvalCaseStability = {
  caseId: string
  category: TailoringEvalCategory
  runs: number
  overallPasses: number
  analysisPasses: number
  editQualityPasses: number
  safetyPasses: number
  stablePass: boolean
  flaky: boolean
  stableFailure: boolean
}

export type TailoringEvalMultiRunSummary = TailoringEvalSuiteSummary & {
  runs: number
  totalModelCalls: number
  cases: TailoringEvalCaseStability[]
}

const evalCategories: TailoringEvalCategory[] = ['Backend', 'Frontend', 'Data', 'AI/ML', 'Product', 'DevOps', 'Safety/edge cases']
const namedTechnologyAliases = [
  ['typescript'], ['javascript'], ['react'], ['next js', 'nextjs'], ['node js', 'nodejs'], ['python'], ['django'], ['java'], ['sql'], ['postgresql'], ['mysql'], ['mongodb'],
  ['aws', 'amazon web services'], ['azure'], ['gcp', 'google cloud platform'], ['docker'], ['kubernetes'], ['terraform'], ['pytorch'], ['tensorflow'], ['tableau'], ['snowflake'], ['bigquery'], ['datadog'],
  ['aws certified solutions architect'], ['aws certified'], ['azure certification'], ['google cloud certification'],
] as const

const numbersIn = (value: string) => value.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []

const wordForms: Record<string, string> = {
  api: 'api',
  apis: 'api',
  develop: 'develop',
  developed: 'develop',
  developing: 'develop',
  development: 'develop',
  optimize: 'optimize',
  optimized: 'optimize',
  optimizing: 'optimize',
  optimization: 'optimize',
  lead: 'lead',
  led: 'lead',
  leading: 'lead',
  leadership: 'lead',
  mentor: 'mentor',
  mentored: 'mentor',
  mentoring: 'mentor',
  manage: 'manage',
  managed: 'manage',
  management: 'manage',
  own: 'own',
  owned: 'own',
  ownership: 'own',
  analyze: 'analyze',
  analyzed: 'analyze',
  analysis: 'analyze',
  analytics: 'analyze',
  design: 'design',
  designed: 'design',
  designing: 'design',
  dashboard: 'dashboard',
  dashboards: 'dashboard',
  monitor: 'monitor',
  monitored: 'monitor',
  monitoring: 'monitor',
}

function conceptTokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map((token) => wordForms[token] ?? token)
}

function exactTokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
}

function containsExactTerm(text: string, term: string) {
  const textTokens = new Set(exactTokens(text))
  return exactTokens(term).every((token) => textTokens.has(token))
}

function normalizedNamedTechnologyText(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

function namedTechnologiesIn(text: string) {
  const normalized = normalizedNamedTechnologyText(text)
  return namedTechnologyAliases.flatMap((aliases, index) => aliases.some((alias) => normalized.includes(` ${alias} `)) ? [index] : [])
}

export function requirementConceptMatches(expected: TailoringEvalRequirementExpectation, geminiRequirement: string) {
  const candidateTokens = new Set(conceptTokens(geminiRequirement))
  return [expected.concept, ...(expected.anyOf ?? [])].some((phrase) => {
    const expectedTokens = conceptTokens(phrase)
    const isRestApiConcept = expectedTokens.includes('rest') && expectedTokens.includes('api')
    if (isRestApiConcept) return candidateTokens.has('rest') && (candidateTokens.has('api') || candidateTokens.has('architecture'))
    return expectedTokens.length > 0 && expectedTokens.every((token) => candidateTokens.has(token))
  })
}

function validationFor(evalCase: TailoringEvalCase, response: TailoringResponse, enforceUnderstatedEditLinks: boolean) {
  return validateTailoringResponse({
    response,
    editableSlots: evalCase.resumeBlocks,
    maxEdits: 8,
    enforceUnderstatedEditLinks,
  })
}

function expectedRequirements(validation: TailoringValidationResult, category: ExpectedRequirementCategory, expected: TailoringEvalRequirementExpectation[] | undefined) {
  const requirements: Array<{ category: RequirementCategory; requirement: string }> = category === 'matched_or_understated'
    ? [
        ...validation.analysis.matched.map((item) => ({ category: 'matched' as const, requirement: item.requirement })),
        ...validation.analysis.understated.map((item) => ({ category: 'understated' as const, requirement: item.requirement })),
      ]
    : validation.analysis[category].map((item) => ({ category, requirement: item.requirement }))
  const matches: RequirementRecognition[] = []
  const failures: RequirementRecognitionFailure[] = []
  for (const expectation of expected ?? []) {
    const match = requirements.find((item) => requirementConceptMatches(expectation, item.requirement))
    if (match) matches.push({ category: match.category, concept: expectation.concept, matchedGeminiRequirement: match.requirement })
    else failures.push({ category, concept: expectation.concept })
  }
  return { matches, failures }
}

export function summarizeTailoringEvaluation(evalCase: TailoringEvalCase, response: TailoringResponse, validation: TailoringValidationResult): TailoringEvalSummary {
  const blocksById = new Map(evalCase.resumeBlocks.map((block) => [block.blockId, block]))
  const understatedEvidence = new Set(validation.analysis.understated.flatMap((item) => item.evidenceBlockIds))
  const matchedEvidence = new Set(validation.analysis.matched.flatMap((item) => item.evidenceBlockIds))
  const accepted = validation.acceptedEdits
  const missingRequirements = [
    ...validation.analysis.missing.map((item) => item.requirement),
    ...(evalCase.expectations.shouldRecognizeMissing ?? []).flatMap((item) => [item.concept, ...(item.anyOf ?? [])]),
  ]
  const resumeEvidence = evalCase.resumeBlocks.map((block) => block.text).join('\n')
  const missingNamedTechnologies = new Set(namedTechnologiesIn(missingRequirements.join('\n')))
  const forbiddenTerms = evalCase.expectations.forbiddenTermsInEdits ?? []
  const unsupportedKeywordIntroductions = [...new Set(accepted.flatMap((edit) => {
    const source = blocksById.get(edit.blockId)?.text ?? ''
    return forbiddenTerms.filter((term) => containsExactTerm(edit.text, term) && !containsExactTerm(source, term))
  }))]
  const missingRequirementLeakage = accepted.some((edit) => {
    const source = blocksById.get(edit.blockId)?.text ?? ''
    return missingRequirements.some((requirement) => containsExactTerm(edit.text, requirement) && !containsExactTerm(source, requirement))
  })
  const changedNumbers = accepted.flatMap((edit) => {
    const source = blocksById.get(edit.blockId)?.text ?? ''
    return numbersIn(source).join('\u0000') === numbersIn(edit.text).join('\u0000') ? [] : [edit.blockId]
  })
  const leadershipUpgradeViolations = [...new Set(accepted.flatMap((edit) => {
    const source = blocksById.get(edit.blockId)?.text ?? ''
    return (evalCase.expectations.forbiddenLeadershipTermsInEdits ?? []).filter((term) => containsExactTerm(edit.text, term) && !containsExactTerm(source, term))
  }))]
  const unknownAcceptedBlockIds = accepted.flatMap((edit) => blocksById.has(edit.blockId) ? [] : [edit.blockId])
  const protectedBlockModifications = accepted.flatMap((edit) => blocksById.get(edit.blockId)?.editable === false ? [edit.blockId] : [])
  const editsWithoutUnderstatedEvidence = response.edits.slice(0, 8).flatMap((edit) => {
    const source = blocksById.get(edit.blockId)?.text ?? ''
    return understatedEvidence.has(edit.blockId) || (matchedEvidence.has(edit.blockId) && isSafeSkillReorder(source, edit.text)) ? [] : [edit.blockId]
  })
  const acceptedEditsWithoutRequiredEvidence = accepted.flatMap((edit) => {
    const source = blocksById.get(edit.blockId)?.text ?? ''
    return understatedEvidence.has(edit.blockId) || (matchedEvidence.has(edit.blockId) && isSafeSkillReorder(source, edit.text)) ? [] : [edit.blockId]
  })
  const unsupportedNamedTechnologySurvivals = [...new Set(accepted.flatMap((edit) => {
    const sourceTechnologies = new Set(namedTechnologiesIn(resumeEvidence))
    return namedTechnologiesIn(edit.text)
      .filter((technology) => !sourceTechnologies.has(technology) && missingNamedTechnologies.has(technology))
      .map((technology) => namedTechnologyAliases[technology][0])
  }))]
  const allowedEditableTargets = evalCase.expectations.editableBlockIds
  const invalidEditableTargets = allowedEditableTargets
    ? accepted.flatMap((edit) => allowedEditableTargets.includes(edit.blockId) ? [] : [edit.blockId])
    : []
  const recognition = [
    expectedRequirements(validation, 'matched', evalCase.expectations.shouldRecognizeMatched),
    expectedRequirements(validation, 'understated', evalCase.expectations.shouldRecognizeUnderstated),
    expectedRequirements(validation, 'missing', evalCase.expectations.shouldRecognizeMissing),
    expectedRequirements(validation, 'matched_or_understated', evalCase.expectations.shouldRecognizeMatchedOrUnderstated),
  ]
  const analysisRecognitionMatches = recognition.flatMap((result) => result.matches)
  const analysisRecognitionFailures = recognition.flatMap((result) => result.failures)
  const unrecognizedExpectedRequirements = analysisRecognitionFailures.map((failure) => failure.concept)
  const untouchedWhenAlreadyAligned = evalCase.expectations.maxAcceptedEdits !== 0 || accepted.length === 0
  const alreadyAlignedOverEdit = evalCase.expectations.maxAcceptedEdits === 0 && accepted.length > 0
  const maxAcceptedEdits = evalCase.expectations.maxAcceptedEdits ?? 8
  const safetyFailures = [
    ...unsupportedKeywordIntroductions.map((term) => `unsupported term introduced: ${term}`),
    ...(missingRequirementLeakage ? ['missing requirement appeared in an accepted edit'] : []),
    ...changedNumbers.map((blockId) => `number changed in ${blockId}`),
    ...leadershipUpgradeViolations.map((term) => `unsupported leadership upgrade: ${term}`),
    ...invalidEditableTargets.map((blockId) => `edit targets unexpected block: ${blockId}`),
    ...protectedBlockModifications.map((blockId) => `protected block modified: ${blockId}`),
    ...unknownAcceptedBlockIds.map((blockId) => `unknown block accepted: ${blockId}`),
    ...acceptedEditsWithoutRequiredEvidence.map((blockId) => `accepted edit bypassed required evidence: ${blockId}`),
    ...unsupportedNamedTechnologySurvivals.map((technology) => `unsupported named technology survived validation: ${technology}`),
    ...(accepted.length > 8 ? ['more than 8 accepted edits'] : []),
  ]
  const editQualityFailures = [
    ...editsWithoutUnderstatedEvidence.map((blockId) => `edit has no understated evidence: ${blockId}`),
    ...(accepted.length > maxAcceptedEdits ? [`accepted edit count exceeds case limit of ${maxAcceptedEdits}`] : []),
    ...(!untouchedWhenAlreadyAligned ? ['already-aligned resume received an accepted edit'] : []),
    ...validation.rejectedEdits.map((edit) => `proposed edit rejected: ${edit.reason} in ${edit.blockId}`),
  ]
  const analysisPass = !analysisRecognitionFailures.length
  const editQualityPass = !editQualityFailures.length
  const safetyPass = !safetyFailures.length
  const overallPass = analysisPass && editQualityPass && safetyPass

  return {
    caseId: evalCase.id,
    category: evalCase.category,
    proposedEditCount: response.edits.length,
    acceptedEditCount: accepted.length,
    rejectedEditCount: validation.rejectedEdits.length,
    unsupportedKeywordIntroductions,
    missingRequirementLeakage,
    changedNumbers,
    leadershipUpgradeViolations,
    editsWithoutUnderstatedEvidence,
    untouchedWhenAlreadyAligned,
    alreadyAlignedOverEdit,
    unrecognizedExpectedRequirements,
    analysisRecognitionMatches,
    analysisRecognitionFailures,
    invalidEditableTargets,
    protectedBlockModifications,
    unknownAcceptedBlockIds,
    acceptedEditsWithoutRequiredEvidence,
    unsupportedNamedTechnologySurvivals,
    rejectedEditReasons: validation.rejectedEdits.map((edit) => edit.reason),
    safetyFailures,
    editQualityFailures,
    analysisPass,
    editQualityPass,
    safetyPass,
    overallPass,
    passed: overallPass,
  }
}

export function evaluateTailoringResponse(evalCase: TailoringEvalCase, response: TailoringResponse) {
  const validation = validationFor(evalCase, response, true)
  return summarizeTailoringEvaluation(evalCase, response, validation)
}

export function summarizeTailoringEvalSuite(results: TailoringEvalSummary[]): TailoringEvalSuiteSummary {
  const categories = Object.fromEntries(evalCategories.map((category) => [category, { passed: 0, total: 0 }])) as TailoringEvalSuiteSummary['categories']
  for (const result of results) {
    categories[result.category].total += 1
    if (result.passed) categories[result.category].passed += 1
  }
  const totalProposedEdits = results.reduce((total, result) => total + result.proposedEditCount, 0)
  const totalAcceptedEdits = results.reduce((total, result) => total + result.acceptedEditCount, 0)
  const analysisPassedCases = results.filter((result) => result.analysisPass).length
  const editQualityPassedCases = results.filter((result) => result.editQualityPass).length
  const safetyPassedCases = results.filter((result) => result.safetyPass).length
  const overallPassedCases = results.filter((result) => result.overallPass).length
  const protectedBlockModificationCount = results.reduce((total, result) => total + result.protectedBlockModifications.length, 0)
  const unknownAcceptedBlockCount = results.reduce((total, result) => total + result.unknownAcceptedBlockIds.length, 0)
  const evidenceBypassCount = results.reduce((total, result) => total + result.acceptedEditsWithoutRequiredEvidence.length, 0)
  const unsupportedNamedTechnologySurvivalCount = results.reduce((total, result) => total + result.unsupportedNamedTechnologySurvivals.length, 0)
  const missingRequirementLeakageCount = results.filter((result) => result.missingRequirementLeakage).length
  const unsupportedTermIntroductionCount = results.reduce((total, result) => total + result.unsupportedKeywordIntroductions.length, 0)
  const numberChangeCount = results.reduce((total, result) => total + result.changedNumbers.length, 0)
  const leadershipUpgradeViolations = results.reduce((total, result) => total + result.leadershipUpgradeViolations.length, 0)
  return {
    totalCases: results.length,
    passedCases: overallPassedCases,
    passRate: results.length ? overallPassedCases / results.length : 0,
    totalProposedEdits,
    totalAcceptedEdits,
    totalRejectedEdits: results.reduce((total, result) => total + result.rejectedEditCount, 0),
    missingRequirementLeakageCount,
    unsupportedTermIntroductionCount,
    numberChangeCount,
    leadershipUpgradeViolations,
    alreadyAlignedOverEditCount: results.filter((result) => result.alreadyAlignedOverEdit).length,
    protectedBlockModificationCount,
    unknownAcceptedBlockCount,
    evidenceBypassCount,
    unsupportedNamedTechnologySurvivalCount,
    analysisPassedCases,
    analysisPassRate: results.length ? analysisPassedCases / results.length : 0,
    editQualityPassedCases,
    editQualityPassRate: results.length ? editQualityPassedCases / results.length : 0,
    safetyPassedCases,
    safetyPassRate: results.length ? safetyPassedCases / results.length : 0,
    overallPassedCases,
    overallPassRate: results.length ? overallPassedCases / results.length : 0,
    productionSafetyGate: missingRequirementLeakageCount === 0
      && unsupportedTermIntroductionCount === 0
      && numberChangeCount === 0
      && leadershipUpgradeViolations === 0
      && protectedBlockModificationCount === 0
      && unknownAcceptedBlockCount === 0
      && evidenceBypassCount === 0
      && unsupportedNamedTechnologySurvivalCount === 0,
    editPrecisionProxy: {
      value: totalProposedEdits ? totalAcceptedEdits / totalProposedEdits : null,
      label: 'Eval heuristic: accepted edits divided by proposed edits; not a validated quality metric.',
    },
    categories,
  }
}

export function summarizeTailoringEvalRuns(results: TailoringEvalSummary[], runs: number): TailoringEvalMultiRunSummary {
  if (!Number.isInteger(runs) || runs < 1) throw new Error('runs must be a positive integer')
  const casesById = new Map<string, TailoringEvalSummary[]>()
  for (const result of results) {
    const caseResults = casesById.get(result.caseId) ?? []
    caseResults.push(result)
    casesById.set(result.caseId, caseResults)
  }
  const cases = [...casesById.values()].map((caseResults) => {
    const first = caseResults[0]
    const overallPasses = caseResults.filter((result) => result.overallPass).length
    return {
      caseId: first.caseId,
      category: first.category,
      runs: caseResults.length,
      overallPasses,
      analysisPasses: caseResults.filter((result) => result.analysisPass).length,
      editQualityPasses: caseResults.filter((result) => result.editQualityPass).length,
      safetyPasses: caseResults.filter((result) => result.safetyPass).length,
      stablePass: overallPasses === caseResults.length,
      flaky: overallPasses > 0 && overallPasses < caseResults.length,
      stableFailure: overallPasses === 0,
    }
  })
  return {
    ...summarizeTailoringEvalSuite(results),
    runs,
    totalModelCalls: results.length,
    cases,
  }
}

export function evaluateRawTailoringResponse(evalCase: TailoringEvalCase, raw: string): TailoringEvalSummary {
  const parsed = parseTailoringResponse(raw)
  if (!parsed) {
    return {
      caseId: evalCase.id,
      category: evalCase.category,
      proposedEditCount: 0,
      acceptedEditCount: 0,
      rejectedEditCount: 0,
      unsupportedKeywordIntroductions: [],
      missingRequirementLeakage: false,
      changedNumbers: [],
      leadershipUpgradeViolations: [],
      editsWithoutUnderstatedEvidence: [],
      untouchedWhenAlreadyAligned: false,
      alreadyAlignedOverEdit: false,
      unrecognizedExpectedRequirements: [],
      analysisRecognitionMatches: [],
      analysisRecognitionFailures: [],
      invalidEditableTargets: [],
      protectedBlockModifications: [],
      unknownAcceptedBlockIds: [],
      acceptedEditsWithoutRequiredEvidence: [],
      unsupportedNamedTechnologySurvivals: [],
      rejectedEditReasons: [],
      safetyFailures: [],
      editQualityFailures: ['invalid JSON response'],
      analysisPass: false,
      editQualityPass: false,
      safetyPass: true,
      overallPass: false,
      passed: false,
      parseError: true,
    }
  }
  return evaluateParsedTailoringResponse(evalCase, parsed)
}

function evaluateParsedTailoringResponse(evalCase: TailoringEvalCase, response: ParsedTailoringResponse) {
  const validation = validationFor(evalCase, response, response.analysisProvided)
  return summarizeTailoringEvaluation(evalCase, response, validation)
}
