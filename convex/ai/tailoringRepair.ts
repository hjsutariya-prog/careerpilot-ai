function jsonText(raw: string) {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  return fenced.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] ?? fenced
}

export function requiresTailoringJsonRepair(raw: string) {
  // The schema parser first attempts a local punctuation-only JSON repair.
  // Only spend a second model call if none of the supported formats survive it.
  const candidate = jsonText(raw)
  return !parseTailoringResponse(candidate)
    && !parseLegacyIndexedTailoringResponse(candidate)
    && !parseLegacyTailoringReplacements(candidate)
}

export function buildTailoringJsonRepairPrompt(originalPrompt: string) {
  return `The previous response could not be parsed as valid JSON. Repeat the task below and return one valid JSON object that exactly follows the supplied response schema.

Rules:
- Return JSON only. Do not use Markdown or explain your work.
- Follow every factual-safety rule in the task exactly.
- Do not invent resume facts, requirements, block IDs, edits, or analysis.
- If no safe edit is needed, return the required response shape with empty arrays.

TASK:
${originalPrompt}`
}
import { parseLegacyIndexedTailoringResponse, parseLegacyTailoringReplacements, parseTailoringResponse } from './tailoringSchema'
