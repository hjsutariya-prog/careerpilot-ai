import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { requestGeminiText } from '../convex/gemini'
import { tailoringGeminiConfig } from '../convex/ai/tailoringGeminiConfig'
import { buildTailoringUserPrompt } from '../convex/ai/tailoringPrompt'
import { parseTailoringResponse, tailoringResponseSchema, type TailoringAnalysis, type TailoringEdit } from '../convex/ai/tailoringSchema'
import { validateTailoringResponse, type RejectedTailoringEdit, type ValidatedTailoringEdit } from '../convex/ai/tailoringValidation'
import { evaluateRawTailoringResponse, summarizeTailoringEvaluation, summarizeTailoringEvalRuns, type TailoringEvalMultiRunSummary, type TailoringEvalSummary } from '../convex/ai/evals/tailoringEval'
import { tailoringEvalCases, type TailoringEvalCase } from '../convex/ai/evals/tailoringEvalCases'

export type LiveTailoringEvalCaseResult = {
  run: number
  caseId: string
  parsedAnalysis: TailoringAnalysis | null
  proposedEdits: TailoringEdit[]
  acceptedEdits: ValidatedTailoringEdit[]
  rejectedEdits: RejectedTailoringEdit[]
  evaluator: TailoringEvalSummary
  passed: boolean
  error?: string
}

export type LiveTailoringEvalRun = {
  results: LiveTailoringEvalCaseResult[]
  summary: TailoringEvalMultiRunSummary
  outputPath: string
}

const list = (values: string[]) => values.length ? values.join(', ') : 'none'

export function formatTailoringEvalCase(result: LiveTailoringEvalCaseResult) {
  const failureSections = [
    ['ANALYSIS RECOGNITION FAILURE', result.evaluator.analysisRecognitionFailures.map((failure) => `${failure.category}: ${failure.concept}`)],
    ['SAFETY FAILURE', result.evaluator.safetyFailures],
    ['EDIT QUALITY FAILURE', result.evaluator.editQualityFailures],
    ['RUNNER FAILURE', [...(result.error ? [result.error] : []), ...(result.evaluator.parseError ? ['invalid JSON response'] : [])]],
  ].filter(([, failures]) => failures.length) as Array<[string, string[]]>
  const analysis = result.parsedAnalysis
  return [
    `CASE: ${result.caseId}`,
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

function promptFor(evalCase: TailoringEvalCase) {
  return buildTailoringUserPrompt({
    jobTitle: 'Synthetic evaluation role',
    companyName: 'CareerPilot evaluation',
    jobDescription: evalCase.jobDescription,
    resumeText: evalCase.resumeBlocks.map((block) => block.text).join('\n'),
    editableSlots: evalCase.resumeBlocks,
  })
}

async function runCase(evalCase: TailoringEvalCase, run: number): Promise<LiveTailoringEvalCaseResult> {
  try {
    const raw = await requestGeminiText({
      ...tailoringGeminiConfig,
      prompt: promptFor(evalCase),
      schema: tailoringResponseSchema,
    })
    const parsed = parseTailoringResponse(raw)
    if (!parsed) {
      const evaluator = evaluateRawTailoringResponse(evalCase, raw)
      return {
        run,
        caseId: evalCase.id,
        parsedAnalysis: null,
        proposedEdits: [],
        acceptedEdits: [],
        rejectedEdits: [],
        evaluator,
        passed: false,
      }
    }
    const validation = validateTailoringResponse({
      response: parsed,
      editableSlots: evalCase.resumeBlocks,
      maxEdits: 8,
      enforceUnderstatedEditLinks: parsed.analysisProvided,
    })
    const evaluator = summarizeTailoringEvaluation(evalCase, parsed, validation)
    return {
      run,
      caseId: evalCase.id,
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
      parsedAnalysis: null,
      proposedEdits: [],
      acceptedEdits: [],
      rejectedEdits: [],
      evaluator,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runTailoringEval({ runs = 1 }: { runs?: number } = {}): Promise<LiveTailoringEvalRun> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required. Set it locally before running npm run eval:tailoring.')
  if (!Number.isInteger(runs) || runs < 1) throw new Error('runs must be a positive integer')

  const results: LiveTailoringEvalCaseResult[] = []
  for (const evalCase of tailoringEvalCases) {
    for (let run = 1; run <= runs; run += 1) {
      const result = await runCase(evalCase, run)
      results.push(result)
      if (runs === 1) console.log(`\n${formatTailoringEvalCase(result)}`)
    }
  }

  const summary = summarizeTailoringEvalRuns(results.map((result) => result.evaluator), runs)
  const outputPath = resolve(process.cwd(), 'tmp', 'tailoring-eval-results.json')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), model: tailoringGeminiConfig.model, runs, cases: results, summary }, null, 2)}\n`, 'utf8')
  console.log('\nCategory results:')
  for (const [category, categorySummary] of Object.entries(summary.categories)) console.log(`${category}: ${categorySummary.passed}/${categorySummary.total} passed`)
  console.log(`\n${summary.totalCases} evaluated cases across ${runs} run${runs === 1 ? '' : 's'} (${summary.totalModelCalls} model calls)`)
  console.log(`Analysis accuracy: ${summary.analysisPassedCases}/${summary.totalCases} (${Math.round(summary.analysisPassRate * 100)}%)`)
  console.log(`Edit-quality pass rate: ${summary.editQualityPassedCases}/${summary.totalCases} (${Math.round(summary.editQualityPassRate * 100)}%)`)
  console.log(`Safety pass rate: ${summary.safetyPassedCases}/${summary.totalCases} (${Math.round(summary.safetyPassRate * 100)}%)`)
  console.log(`Overall: ${summary.overallPassedCases}/${summary.totalCases} (${Math.round(summary.overallPassRate * 100)}%)`)
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
