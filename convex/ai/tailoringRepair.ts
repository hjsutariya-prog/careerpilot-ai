function jsonText(raw: string) {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  return fenced.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] ?? fenced
}

export function requiresTailoringJsonRepair(raw: string) {
  try {
    JSON.parse(jsonText(raw))
    return false
  } catch {
    return true
  }
}

export function buildTailoringJsonRepairPrompt(malformedOutput: string) {
  return `You are a JSON repair tool. Convert the MODEL OUTPUT below into one valid JSON object that exactly follows the supplied response schema.

Rules:
- Return JSON only. Do not use Markdown or explain your work.
- Preserve only information already present in MODEL OUTPUT.
- Do not invent resume facts, requirements, block IDs, edits, or analysis.
- If a value cannot be recovered safely, use an empty array for that part of the response.
- Never add an edit unless its blockId and replacement text are both present in MODEL OUTPUT.

MODEL OUTPUT:
${malformedOutput.slice(0, 12_000)}`
}
