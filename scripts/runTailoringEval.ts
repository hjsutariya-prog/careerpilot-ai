import { parseTailoringEvalOptions, runTailoringEval } from './tailoringEvalRunner'

runTailoringEval(parseTailoringEvalOptions()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
