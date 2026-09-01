import { isProfessionalRequirement, type ProfessionalEvidence } from '../professionalFit'

export type FitSummaryInput = {
  jobId: string
  evidence: ProfessionalEvidence[]
  gaps: string[]
}

export type FitSummaryOutput = {
  jobId: string
  sentence: string
  evidenceIds: string[]
  gap?: string
}

export const fitSummaryResponseSchema = {
  type: 'object',
  properties: {
    summaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          sentence: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          gap: { type: 'string' },
        },
        required: ['jobId', 'sentence', 'evidenceIds'],
        additionalProperties: false,
      },
    },
  },
  required: ['summaries'],
  additionalProperties: false,
} as const

const preferencePattern = /\b(remote|hybrid|on[ -]?site|location|city|salary|compensation|ctc|notice|availability|visa|commute|relocat)\b/i
const bannedPhrases = /\b(perfect fit|great match|strong candidate|based on your profile|your background is relevant)\b/i

function words(value: string) {
  return value.match(/[A-Za-z0-9+#./-]+/g) ?? []
}

export function evidenceId(evidence: ProfessionalEvidence) {
  return `${evidence.source}:${evidence.resumeLine}`
}

export function fallbackFitSummary(evidence: ProfessionalEvidence[]) {
  const strongest = evidence.find((item) => isProfessionalRequirement(item.requirement))
  return strongest
    ? `Your resume shows ${strongest.requirement} experience, directly supporting a core professional requirement for this role.`
    : 'Professional resume evidence is limited for this role, so its key requirements need closer review.'
}

export function buildFitSummaryPrompt(inputs: FitSummaryInput[]) {
  return `Write exactly one calm, specific sentence for each job card. Return JSON only. Each sentence must be 12 to 24 words and fit within two short lines. Use only the supplied professional evidence and optional professional gaps. Never use or mention location, work arrangement, salary, notice period, availability, visa, commute, or any preference. Do not invent experience, requirements, or conclusions. Lead with the strongest evidence. You may mention one supplied gap only if it materially affects fit. Avoid marketing language such as "perfect fit", "great match", "strong candidate", "based on your profile", and "your background is relevant". Cite the evidence IDs you used.\n\nINPUT:\n${JSON.stringify(inputs.map((input) => ({
    jobId: input.jobId,
    evidence: input.evidence.slice(0, 3).map((item) => ({ id: evidenceId(item), requirement: item.requirement })),
    professionalGaps: input.gaps.slice(0, 2),
  })))} `
}

export function parseFitSummaries(raw: string, inputs: FitSummaryInput[]) {
  let parsed: unknown
  try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')) } catch { return null }
  const summaries = (parsed as { summaries?: unknown })?.summaries
  if (!Array.isArray(summaries) || summaries.length !== inputs.length) return null
  const inputByJob = new Map(inputs.map((input) => [input.jobId, input]))
  const seen = new Set<string>()
  const result: FitSummaryOutput[] = []
  for (const value of summaries) {
    if (!value || typeof value !== 'object') return null
    const row = value as Record<string, unknown>
    const jobId = typeof row.jobId === 'string' ? row.jobId : ''
    const sentence = typeof row.sentence === 'string' ? row.sentence.replace(/\s+/g, ' ').trim() : ''
    const evidenceIds = Array.isArray(row.evidenceIds) ? [...new Set(row.evidenceIds.filter((item): item is string => typeof item === 'string'))] : []
    const gap = typeof row.gap === 'string' ? row.gap.replace(/\s+/g, ' ').trim() : undefined
    const input = inputByJob.get(jobId)
    if (!input || seen.has(jobId) || !sentence || words(sentence).length < 12 || words(sentence).length > 24 || preferencePattern.test(sentence) || bannedPhrases.test(sentence)) return null
    const allowedEvidenceIds = new Set(input.evidence.map(evidenceId))
    if (evidenceIds.length === 0 || evidenceIds.some((id) => !allowedEvidenceIds.has(id))) return null
    const allowedTerms = new Set(input.evidence.flatMap((item) => words(item.requirement).map((word) => word.toLowerCase())))
    if (!words(sentence).some((word) => allowedTerms.has(word.toLowerCase()))) return null
    if (gap && !input.gaps.includes(gap)) return null
    result.push({ jobId, sentence, evidenceIds, ...(gap ? { gap } : {}) })
    seen.add(jobId)
  }
  return result
}
