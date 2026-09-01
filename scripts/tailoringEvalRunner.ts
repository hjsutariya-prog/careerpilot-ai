import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { tailoringGeminiConfig } from '../convex/ai/tailoringGeminiConfig'
import { buildTailoringUserPrompt } from '../convex/ai/tailoringPrompt'
import { parseTailoringResponse, tailoringResponseSchema, type TailoringAnalysis, type TailoringEdit } from '../convex/ai/tailoringSchema'
import { validateTailoringResponse, type RejectedTailoringEdit, type ValidatedTailoringEdit } from '../convex/ai/tailoringValidation'
import { evaluateRawTailoringResponse, masterEvidenceForEvalCase, summarizeTailoringEvaluation, summarizeTailoringEvalRuns, type TailoringEvalMultiRunSummary, type TailoringEvalSummary } from '../convex/ai/evals/tailoringEval'
import { tailoringEvalCases, type TailoringEvalCase } from '../convex/ai/evals/tailoringEvalCases'
import { requestGeminiForEval, type GeminiEvalResponseDiagnostics } from './tailoringEvalGemini'
import { isGeminiProviderFailure, type GeminiFailureCode } from '../convex/gemini'

export type TailoringEvalParseDiagnostic = GeminiEvalResponseDiagnostics & {
  parseFailure: 'empty_model_text' | 'truncated_or_incomplete_json' | 'malformed_json' | 'valid_json_rejected_by_tailoring_schema'
}

export type LiveTailoringEvalCaseResult = {
  run: number
  caseId: string
  executionStatus: 'evaluated' | 'provider_error' | 'model_output_error'
  parsedAnalysis: TailoringAnalysis | null
  proposedEdits: TailoringEdit[]
  acceptedEdits: ValidatedTailoringEdit[]
  rejectedEdits: RejectedTailoringEdit[]
  evaluator: TailoringEvalSummary
  passed: boolean
  error?: string
  failureCode?: GeminiFailureCode
  parseDiagnostic?: TailoringEvalParseDiagnostic
}

export type LiveTailoringEvalSummary = TailoringEvalMultiRunSummary & {
  attemptedCalls: number
  successfullyEvaluatedCalls: number
  providerErrorCalls: number
  modelOutputErrorCalls: number
}

export type LiveTailoringEvalRun = {
  results: LiveTailoringEvalCaseResult[]
  summary: LiveTailoringEvalSummary
  outputPath: string
}

const list = (values: string[]) => values.length ? values.join(', ') : 'none'
const rateLabel = (passed: number, total: number, rate: number) => total ? `${passed}/${total} (${Math.round(rate * 100)}%)` : 'n/a (no successful provider response)'

function parserFailure(raw: string, diagnostics: GeminiEvalResponseDiagnostics): TailoringEvalParseDiagnostic['parseFailure'] {
  if (!raw.trim()) return 'empty_model_text'
  const withoutFences = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const candidate = withoutFences.match(/\{[\s\S]*\}/)?.[0] ?? withoutFences
  try {
    JSON.parse(candidate)
    return 'valid_json_rejected_by_tailoring_schema'
  } catch {
    return diagnostics.appearsTruncated ? 'truncated_or_incomplete_json' : 'malformed_json'
  }
}

export function tailoringParseDiagnostic(raw: string, diagnostics: GeminiEvalResponseDiagnostics): TailoringEvalParseDiagnostic {
  return { ...diagnostics, parseFailure: parserFailure(raw, diagnostics) }
}

function diagnosticLines(diagnostic: TailoringEvalParseDiagnostic | undefined) {
  if (!diagnostic) return []
  return [
    `parse failure: ${diagnostic.parseFailure}`,
    `HTTP ${diagnostic.httpStatus}; content type: ${diagnostic.contentType ?? 'missing'}; model text: ${diagnostic.rawModelTextLength} characters`,
    `API body empty: ${diagnostic.responseBodyEmpty}; API body JSON: ${diagnostic.apiBodyWasJson}; markdown fence: ${diagnostic.hasMarkdownCodeFence}; explanatory text: ${diagnostic.hasExplanatoryTextAroundJson}; truncated: ${diagnostic.appearsTruncated}`,
    ...(diagnostic.interactionStatus ? [`interaction status: ${diagnostic.interactionStatus}`] : []),
    ...(diagnostic.finishReason ? [`finish reason: ${diagnostic.finishReason}`] : []),
    ...(diagnostic.rawModelTextStart ? [`model text start: ${JSON.stringify(diagnostic.rawModelTextStart)}`] : []),
    ...(diagnostic.rawModelTextEnd ? [`model text end: ${JSON.stringify(diagnostic.rawModelTextEnd)}`] : []),
  ]
}

export function formatTailoringEvalCase(result: LiveTailoringEvalCaseResult) {
  if (result.executionStatus === 'provider_error') {
    const rateOrQuota = result.failureCode === 'GEMINI_RATE_LIMIT' || result.failureCode === 'GEMINI_QUOTA_EXHAUSTED'
    return [
      `CASE: ${result.caseId}`,
      'EXECUTION STATUS: provider_error',
      '',
      'RUNNER FAILURE',
      `  ${result.error ?? 'Gemini provider request failed'}`,
      `  ${rateOrQuota ? 'provider rate/quota limit reached' : 'provider request unavailable'}`,
      ...(result.failureCode ? [`  failure code: ${result.failureCode}`] : []),
    ].join('\n')
  }
  const failureSections = [
    ['ANALYSIS RECOGNITION FAILURE', result.evaluator.analysisRecognitionFailures.map((failure) => `${failure.category}: ${failure.concept}`)],
    ['SAFETY FAILURE', result.evaluator.safetyFailures],
    ['EDIT QUALITY FAILURE', result.evaluator.editQualityFailures],
    ['RUNNER FAILURE', [...(result.error ? [result.error] : []), ...(result.failureCode ? [`failure code: ${result.failureCode}`] : []), ...(!result.failureCode && result.evaluator.parseError ? ['invalid JSON response'] : []), ...diagnosticLines(result.parseDiagnostic)]],
  ].filter(([, failures]) => failures.length) as Array<[string, string[]]>
  const analysis = result.parsedAnalysis
  return [
    `CASE: ${result.caseId}`,
    `EXECUTION STATUS: ${result.executionStatus}`,
    `OVERALL PASS: ${result.evaluator.overallPass}`,
    `ANALYSIS PASS: ${result.evaluator.analysisPass}`,
    `EDIT-QUALITY PASS: ${result.evaluator.editQualityPass}`,
    `SAFETY PASS: ${result.evaluator.safetyPass}`,
    '',
    'Analysis:',
    `  matched: ${analysis ? list(analysis.matched.map((item) => item.requirement)) : 'unavailable'}`,
    `  understated: ${analysis ? list(analysis.understated.map((item) => item.requirement)) : 'unavailable'}`,
    `  missing: ${analysis ? list(analysis.missing.map((item) => item.requirement)) : 'unavailable'}`,
    'Concept matches:',
    ...(result.evaluator.analysisRecognitionMatches.length
      ? result.evaluator.analysisRecognitionMatches.map((match) => `  expected concept: ${match.concept} -> Gemini: ${match.matchedGeminiRequirement}`)
      : ['  none']),
    '',
    `Edits proposed: ${result.proposedEdits.length}`,
    `Edits accepted: ${result.acceptedEdits.length}`,
    `Edits rejected: ${result.rejectedEdits.length}`,
    ...(result.evaluator.rejectedEditReasons.length ? [`Rejected reasons: ${list(result.evaluator.rejectedEditReasons)}`] : []),
    '',
    'Failures:',
    ...(failureSections.length ? failureSections.flatMap(([heading, failures]) => [`  ${heading}`, ...failures.map((failure) => `    ${failure}`)]) : ['  none']),
  ].join('\n')
}

export function parseTailoringEvalRuns(args: string[] = process.argv.slice(2)) {
  const runArgument = args.find((argument) => argument.startsWith('--runs='))
  if (!runArgument) return 1
  const runs = Number(runArgument.slice('--runs='.length))
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer')
  return runs
}

export type TailoringEvalRunOptions = { runs: number; caseId?: string }

export function parseTailoringEvalOptions(args: string[] = process.argv.slice(2)): TailoringEvalRunOptions {
  const caseArgument = args.find((argument) => argument.startsWith('--case='))
  const caseId = caseArgument?.slice('--case='.length).trim()
  if (caseArgument && !caseId) throw new Error('--case must name an evaluation case')
  return { runs: parseTailoringEvalRuns(args), ...(caseId ? { caseId } : {}) }
}

function promptFor(evalCase: TailoringEvalCase) {
  return buildTailoringUserPrompt({
    jobTitle: 'Synthetic evaluation role',
    companyName: 'CareerPilot evaluation',
    jobDescription: evalCase.jobDescription,
    resumeText: evalCase.resumeBlocks.map((block) => block.text).join('\n'),
    editableSlots: evalCase.resumeBlocks,
    masterEvidence: masterEvidenceForEvalCase(evalCase),
  })
}

async function runCase(evalCase: TailoringEvalCase, run: number): Promise<LiveTailoringEvalCaseResult> {
  try {
    const gemini = await requestGeminiForEval({
      ...tailoringGeminiConfig,
      prompt: promptFor(evalCase),
      schema: tailoringResponseSchema,
    })
    const raw = gemini.text
    if (gemini.failure) {
      const evaluator = evaluateRawTailoringResponse(evalCase, raw)
      const providerError = isGeminiProviderFailure(gemini.failure.code)
      return {
        run,
        caseId: evalCase.id,
        executionStatus: providerError ? 'provider_error' : 'model_output_error',
        parsedAnalysis: null,
        proposedEdits: [],
        acceptedEdits: [],
        rejectedEdits: [],
        evaluator,
        passed: false,
        error: gemini.failure.httpStatus ? `Gemini HTTP ${gemini.failure.httpStatus}: ${gemini.failure.message}` : gemini.failure.message,
        failureCode: gemini.failure.code,
        ...(!providerError ? { parseDiagnostic: tailoringParseDiagnostic(raw, gemini.diagnostics) } : {}),
      }
    }
    const parsed = parseTailoringResponse(raw)
    if (!parsed) {
      const evaluator = evaluateRawTailoringResponse(evalCase, raw)
      return {
        run,
        caseId: evalCase.id,
        executionStatus: 'model_output_error',
        parsedAnalysis: null,
        proposedEdits: [],
        acceptedEdits: [],
        rejectedEdits: [],
        evaluator,
        passed: false,
        parseDiagnostic: tailoringParseDiagnostic(raw, gemini.diagnostics),
      }
    }
    const validation = validateTailoringResponse({
      response: parsed,
      editableSlots: evalCase.resumeBlocks,
      maxEdits: 8,
      enforceUnderstatedEditLinks: parsed.analysisProvided,
      masterEvidence: masterEvidenceForEvalCase(evalCase),
    })
    const evaluator = summarizeTailoringEvaluation(evalCase, parsed, validation)
    return {
      run,
      caseId: evalCase.id,
      executionStatus: 'evaluated',
      parsedAnalysis: parsed.analysis,
      proposedEdits: parsed.edits,
      acceptedEdits: validation.acceptedEdits,
      rejectedEdits: validation.rejectedEdits,
      evaluator,
      passed: evaluator.passed,
    }
  } catch (error) {
    const evaluator = evaluateRawTailoringResponse(evalCase, '')
    return {
      run,
      caseId: evalCase.id,
      executionStatus: 'provider_error',
      parsedAnalysis: null,
      proposedEdits: [],
      acceptedEdits: [],
      rejectedEdits: [],
      evaluator,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      failureCode: 'GEMINI_SERVER_ERROR',
    }
  }
}

export function summarizeLiveTailoringEval(results: LiveTailoringEvalCaseResult[], runs: number): LiveTailoringEvalSummary {
  const modelQualityResults = results.filter((result) => result.executionStatus !== 'provider_error')
  return {
    ...summarizeTailoringEvalRuns(modelQualityResults.map((result) => result.evaluator), runs),
    attemptedCalls: results.length,
    successfullyEvaluatedCalls: results.filter((result) => result.executionStatus === 'evaluated').length,
    providerErrorCalls: results.filter((result) => result.executionStatus === 'provider_error').length,
    modelOutputErrorCalls: results.filter((result) => result.executionStatus === 'model_output_error').length,
  }
}

export async function runTailoringEval({ runs = 1, caseId }: TailoringEvalRunOptions = { runs: 1 }): Promise<LiveTailoringEvalRun> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required. Set it locally before running npm run eval:tailoring.')
  if (!Number.isInteger(runs) || runs < 1) throw new Error('runs must be a positive integer')

  const selectedCases = caseId ? tailoringEvalCases.filter((evalCase) => evalCase.id === caseId) : tailoringEvalCases
  if (caseId && !selectedCases.length) throw new Error(`Unknown tailoring evaluation case: ${caseId}`)
  const results: LiveTailoringEvalCaseResult[] = []
  for (const evalCase of selectedCases) {
    for (let run = 1; run <= runs; run += 1) {
      const result = await runCase(evalCase, run)
      results.push(result)
      if (runs === 1) console.log(`\n${formatTailoringEvalCase(result)}`)
    }
  }

  const summary = summarizeLiveTailoringEval(results, runs)
  const outputPath = resolve(process.cwd(), 'tmp', 'tailoring-eval-results.json')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), model: tailoringGeminiConfig.model, runs, ...(caseId ? { caseId } : {}), cases: results, summary }, null, 2)}\n`, 'utf8')
  console.log('\nCategory results:')
  for (const [category, categorySummary] of Object.entries(summary.categories)) console.log(`${category}: ${categorySummary.passed}/${categorySummary.total} passed`)
  console.log(`\n${summary.attemptedCalls} calls attempted; ${summary.successfullyEvaluatedCalls} successfully evaluated; ${summary.providerErrorCalls} provider errors; ${summary.modelOutputErrorCalls} model-output errors`)
  console.log(`${summary.totalCases} model-quality evaluations across ${runs} run${runs === 1 ? '' : 's'} (${summary.totalModelCalls} scored model calls)`)
  console.log(`Analysis accuracy: ${rateLabel(summary.analysisPassedCases, summary.totalCases, summary.analysisPassRate)}`)
  console.log(`Edit-quality pass rate: ${rateLabel(summary.editQualityPassedCases, summary.totalCases, summary.editQualityPassRate)}`)
  console.log(`Safety pass rate: ${rateLabel(summary.safetyPassedCases, summary.totalCases, summary.safetyPassRate)}`)
  console.log(`Overall: ${rateLabel(summary.overallPassedCases, summary.totalCases, summary.overallPassRate)}`)
  console.log(`Production safety gate: ${summary.productionSafetyGate ? 'PASS' : 'FAIL'}`)
  console.log(`Proposed edits: ${summary.totalProposedEdits}; accepted: ${summary.totalAcceptedEdits}; rejected: ${summary.totalRejectedEdits}`)
  console.log(`Missing leakage: ${summary.missingRequirementLeakageCount}; unsupported terms: ${summary.unsupportedTermIntroductionCount}; number changes: ${summary.numberChangeCount}`)
  console.log(`Leadership upgrades: ${summary.leadershipUpgradeViolations}; already-aligned over-edits: ${summary.alreadyAlignedOverEditCount}`)
  console.log(`Protected block modifications: ${summary.protectedBlockModificationCount}; unknown accepted blocks: ${summary.unknownAcceptedBlockCount}; evidence bypasses: ${summary.evidenceBypassCount}; unsupported named technologies: ${summary.unsupportedNamedTechnologySurvivalCount}`)
  console.log(`${summary.editPrecisionProxy.label} ${summary.editPrecisionProxy.value === null ? 'n/a' : summary.editPrecisionProxy.value.toFixed(2)}`)
  console.log('Internal evaluation metrics only; they are not scientifically validated scores.')
  if (runs > 1) {
    console.log('\nPer-case stability:')
    for (const item of summary.cases) {
      const stability = item.stablePass ? 'stablePass' : item.flaky ? 'flaky' : 'stableFailure'
      console.log(`${item.caseId}\noverall: ${item.overallPasses}/${item.runs}\nanalysis: ${item.analysisPasses}/${item.runs}\nsafety: ${item.safetyPasses}/${item.runs}\nstability: ${stability}`)
    }
  }
  console.log(`Results written to ${outputPath}`)
  return { results, summary, outputPath }
}
