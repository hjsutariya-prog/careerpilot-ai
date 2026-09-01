import { describe, expect, it } from 'vitest'
import { formatTailoringEvalCase, parseTailoringEvalOptions, parseTailoringEvalRuns, summarizeLiveTailoringEval, tailoringParseDiagnostic } from './tailoringEvalRunner'

const evaluator = (overrides = {}) => ({
  caseId: 'missing-kubernetes',
  category: 'DevOps' as const,
  proposedEditCount: 0,
  acceptedEditCount: 0,
  rejectedEditCount: 0,
  unsupportedKeywordIntroductions: [],
  missingRequirementLeakage: false,
  changedNumbers: [],
  leadershipUpgradeViolations: [],
  editsWithoutUnderstatedEvidence: [],
  untouchedWhenAlreadyAligned: true,
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
  editQualityFailures: [],
  analysisPass: true,
  editQualityPass: true,
  safetyPass: true,
  overallPass: true,
  passed: true,
  ...overrides,
})

describe('live tailoring evaluation output', () => {
  it('prints a readable case summary without raw API data', () => {
    const output = formatTailoringEvalCase({
      run: 1,
      caseId: 'missing-kubernetes',
      executionStatus: 'evaluated',
      parsedAnalysis: {
        matched: [{ requirement: 'AWS', evidenceBlockIds: ['paragraph_0'] }],
        understated: [],
        missing: [{ requirement: 'Kubernetes' }],
      },
      proposedEdits: [],
      acceptedEdits: [],
      rejectedEdits: [],
      evaluator: {
        caseId: 'missing-kubernetes',
        category: 'DevOps',
        proposedEditCount: 0,
        acceptedEditCount: 0,
        rejectedEditCount: 0,
        unsupportedKeywordIntroductions: [],
        missingRequirementLeakage: false,
        changedNumbers: [],
        leadershipUpgradeViolations: [],
        editsWithoutUnderstatedEvidence: [],
        untouchedWhenAlreadyAligned: true,
        alreadyAlignedOverEdit: false,
        unrecognizedExpectedRequirements: [],
        analysisRecognitionMatches: [{ category: 'matched', concept: 'AWS', matchedGeminiRequirement: 'Deploy applications on AWS' }],
        analysisRecognitionFailures: [],
        invalidEditableTargets: [],
        protectedBlockModifications: [],
        unknownAcceptedBlockIds: [],
        acceptedEditsWithoutRequiredEvidence: [],
        unsupportedNamedTechnologySurvivals: [],
        rejectedEditReasons: [],
        safetyFailures: [],
        editQualityFailures: [],
        analysisPass: true,
        editQualityPass: true,
        safetyPass: true,
        overallPass: true,
        passed: true,
      },
      passed: true,
    })

    expect(output).toContain('CASE: missing-kubernetes')
    expect(output).toContain('OVERALL PASS: true')
    expect(output).toContain('ANALYSIS PASS: true')
    expect(output).toContain('EDIT-QUALITY PASS: true')
    expect(output).toContain('SAFETY PASS: true')
    expect(output).toContain('matched: AWS')
    expect(output).toContain('missing: Kubernetes')
    expect(output).toContain('expected concept: AWS -> Gemini: Deploy applications on AWS')
    expect(output).toContain('Failures:\n  none')
    expect(output).not.toContain('x-goog-api-key')
  })

  it('defaults to one run and parses a positive --runs value', () => {
    expect(parseTailoringEvalRuns([])).toBe(1)
    expect(parseTailoringEvalRuns(['--runs=3'])).toBe(3)
  })

  it('rejects invalid --runs values', () => {
    expect(() => parseTailoringEvalRuns(['--runs=0'])).toThrow('positive integer')
    expect(() => parseTailoringEvalRuns(['--runs=two'])).toThrow('positive integer')
  })

  it('parses an optional exact case filter without changing the default run count', () => {
    expect(parseTailoringEvalOptions(['--case=master-backed-project-delivery'])).toEqual({ runs: 1, caseId: 'master-backed-project-delivery' })
    expect(parseTailoringEvalOptions(['--runs=3', '--case=master-backed-project-delivery'])).toEqual({ runs: 3, caseId: 'master-backed-project-delivery' })
    expect(() => parseTailoringEvalOptions(['--case='])).toThrow('must name an evaluation case')
  })

  it('distinguishes malformed, incomplete, and valid-but-wrong JSON responses', () => {
    const base = { httpStatus: 200, contentType: 'application/json', responseBodyEmpty: false, rawModelTextLength: 0, rawModelTextStart: '', rawModelTextEnd: '', hasMarkdownCodeFence: false, hasExplanatoryTextAroundJson: false, appearsTruncated: false, responseMimeType: 'application/json' as const, schemaRequested: true, apiBodyWasJson: true }

    expect(tailoringParseDiagnostic('', base).parseFailure).toBe('empty_model_text')
    expect(tailoringParseDiagnostic('{"analysis":', { ...base, appearsTruncated: true }).parseFailure).toBe('truncated_or_incomplete_json')
    expect(tailoringParseDiagnostic('{not JSON}', base).parseFailure).toBe('malformed_json')
    expect(tailoringParseDiagnostic('{"edits":[]}', base).parseFailure).toBe('valid_json_rejected_by_tailoring_schema')
  })

  it('keeps provider errors out of the model-quality denominator', () => {
    const result = summarizeLiveTailoringEval([
      {
        run: 1,
        caseId: 'missing-kubernetes',
        executionStatus: 'provider_error',
        parsedAnalysis: null,
        proposedEdits: [],
        acceptedEdits: [],
        rejectedEdits: [],
        evaluator: evaluator({ analysisPass: false, editQualityPass: false, safetyPass: false, overallPass: false, passed: false }),
        passed: false,
        error: 'Gemini HTTP 429: Gemini rate limit reached',
        failureCode: 'GEMINI_RATE_LIMIT',
      },
    ], 1)

    expect(result).toMatchObject({ attemptedCalls: 1, successfullyEvaluatedCalls: 0, providerErrorCalls: 1, modelOutputErrorCalls: 0, totalCases: 0 })
    expect(result.analysisPassRate).toBe(0)
    expect(result.productionSafetyGate).toBe(true)
  })

  it('reports a provider limit without a misleading invalid JSON failure', () => {
    const output = formatTailoringEvalCase({
      run: 1,
      caseId: 'missing-kubernetes',
      executionStatus: 'provider_error',
      parsedAnalysis: null,
      proposedEdits: [],
      acceptedEdits: [],
      rejectedEdits: [],
      evaluator: evaluator({ analysisPass: false, editQualityPass: false, safetyPass: false, overallPass: false, passed: false }),
      passed: false,
      error: 'Gemini HTTP 429: Gemini rate limit reached',
      failureCode: 'GEMINI_RATE_LIMIT',
    })

    expect(output).toContain('provider rate/quota limit reached')
    expect(output).not.toContain('invalid JSON response')
  })
})
