import { parseTailoringEvalRuns, runTailoringEval } from './tailoringEvalRunner'

runTailoringEval({ runs: parseTailoringEvalRuns() }).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
