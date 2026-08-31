export type TailoringEdit = {
  blockId: string
  text: string
  /** Required when the edit relies on facts outside the Template experience. */
  sourceMasterBlockIds?: string[]
}

export type TailoringReorder = {
  experienceId: string
  blockIds: string[]
}

export type TailoringMerge = {
  experienceId: string
  sourceBlockIds: [string, string]
  targetBlockId: string
  text: string
  /** Optional proof from the Master experience matched to this Template experience. */
  sourceMasterBlockIds?: string[]
}

export type MatchedRequirement = {
  requirement: string
  evidenceBlockIds: string[]
  masterBlockIds?: string[]
}

export type UnderstatedRequirement = {
  requirement: string
  evidenceBlockIds: string[]
  masterBlockIds?: string[]
}

export type MissingRequirement = {
  requirement: string
}

export type TailoringAnalysis = {
  matched: MatchedRequirement[]
  understated: UnderstatedRequirement[]
  missing: MissingRequirement[]
}

export type LegacyIndexedTailoringEdit = {
  index: number
  text: string
}

export type LegacyIndexedTailoringResponse = {
  edits: LegacyIndexedTailoringEdit[]
}

export type TailoringResponse = {
  analysis: TailoringAnalysis
  edits: TailoringEdit[]
  reorders?: TailoringReorder[]
  merges?: TailoringMerge[]
}

// This flag is parser metadata only. It lets validation preserve safe
// edit-only responses produced before analysis was added to the API format.
export type ParsedTailoringResponse = TailoringResponse & {
  analysisProvided: boolean
}

export function emptyTailoringAnalysis(): TailoringAnalysis {
  return { matched: [], understated: [], missing: [] }
}

export const tailoringResponseSchema = {
  type: 'object',
  properties: {
    analysis: {
      type: 'object',
      properties: {
        matched: {
          type: 'array',
          items: {
            type: 'object',
        properties: { requirement: { type: 'string' }, evidenceBlockIds: { type: 'array', items: { type: 'string' } }, masterBlockIds: { type: 'array', items: { type: 'string' } } },
            required: ['requirement', 'evidenceBlockIds'],
            additionalProperties: false,
          },
        },
        understated: {
          type: 'array',
          items: {
            type: 'object',
        properties: { requirement: { type: 'string' }, evidenceBlockIds: { type: 'array', items: { type: 'string' } }, masterBlockIds: { type: 'array', items: { type: 'string' } } },
            required: ['requirement', 'evidenceBlockIds'],
            additionalProperties: false,
          },
        },
        missing: {
          type: 'array',
          items: {
            type: 'object',
            properties: { requirement: { type: 'string' } },
            required: ['requirement'],
            additionalProperties: false,
          },
        },
      },
      required: ['matched', 'understated', 'missing'],
      additionalProperties: false,
    },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: { blockId: { type: 'string' }, text: { type: 'string' }, sourceMasterBlockIds: { type: 'array', items: { type: 'string' } } },
        required: ['blockId', 'text'],
        additionalProperties: false,
      },
    },
    reorders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          experienceId: { type: 'string' },
          blockIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['experienceId', 'blockIds'],
        additionalProperties: false,
      },
    },
    merges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          experienceId: { type: 'string' },
          sourceBlockIds: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
          targetBlockId: { type: 'string' },
          text: { type: 'string' },
          sourceMasterBlockIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['experienceId', 'sourceBlockIds', 'targetBlockId', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['analysis', 'edits'],
  additionalProperties: false,
} as const

function jsonCandidate(raw: string): unknown | null {
  const fenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const candidate = fenced.match(/\{[\s\S]*\}/)?.[0] ?? fenced
  try {
    return JSON.parse(candidate)
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate))
    } catch {
      return null
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTailoringEdit(value: unknown): value is TailoringEdit {
  return isRecord(value) && typeof value.blockId === 'string' && typeof value.text === 'string'
    && (value.sourceMasterBlockIds === undefined || (Array.isArray(value.sourceMasterBlockIds) && value.sourceMasterBlockIds.every((blockId) => typeof blockId === 'string')))
}

function isTailoringReorder(value: unknown): value is TailoringReorder {
  return isRecord(value)
    && typeof value.experienceId === 'string'
    && Array.isArray(value.blockIds)
    && value.blockIds.every((blockId) => typeof blockId === 'string')
}

function isTailoringMerge(value: unknown): value is TailoringMerge {
  return isRecord(value)
    && typeof value.experienceId === 'string'
    && Array.isArray(value.sourceBlockIds)
    && value.sourceBlockIds.length === 2
    && value.sourceBlockIds.every((blockId) => typeof blockId === 'string')
    && typeof value.targetBlockId === 'string'
    && typeof value.text === 'string'
    && (value.sourceMasterBlockIds === undefined || (Array.isArray(value.sourceMasterBlockIds) && value.sourceMasterBlockIds.every((blockId) => typeof blockId === 'string')))
}

function isEvidenceRequirement(value: unknown): value is MatchedRequirement | UnderstatedRequirement {
  return isRecord(value)
    && typeof value.requirement === 'string'
    && Array.isArray(value.evidenceBlockIds)
    && value.evidenceBlockIds.every((blockId) => typeof blockId === 'string')
    && (value.masterBlockIds === undefined || (Array.isArray(value.masterBlockIds) && value.masterBlockIds.every((blockId) => typeof blockId === 'string')))
}

function isMissingRequirement(value: unknown): value is MissingRequirement {
  return isRecord(value) && typeof value.requirement === 'string' && !Object.prototype.hasOwnProperty.call(value, 'evidenceBlockIds')
}

function isTailoringAnalysis(value: unknown): value is TailoringAnalysis {
  return isRecord(value)
    && Array.isArray(value.matched)
    && value.matched.every(isEvidenceRequirement)
    && Array.isArray(value.understated)
    && value.understated.every(isEvidenceRequirement)
    && Array.isArray(value.missing)
    && value.missing.every(isMissingRequirement)
}

function isLegacyIndexedTailoringEdit(value: unknown): value is LegacyIndexedTailoringEdit {
  return isRecord(value) && typeof value.index === 'number' && Number.isInteger(value.index) && typeof value.text === 'string'
}

export function parseTailoringResponse(raw: string): ParsedTailoringResponse | null {
  const candidate = jsonCandidate(raw)
  if (!isRecord(candidate) || !Array.isArray(candidate.edits) || !candidate.edits.every(isTailoringEdit)) return null
  if (candidate.reorders !== undefined && (!Array.isArray(candidate.reorders) || !candidate.reorders.every(isTailoringReorder))) return null
  if (candidate.merges !== undefined && (!Array.isArray(candidate.merges) || !candidate.merges.every(isTailoringMerge))) return null
  const reorders = candidate.reorders as TailoringReorder[] | undefined
  const merges = candidate.merges as TailoringMerge[] | undefined
  const analysisProvided = candidate.analysis !== undefined
  if (analysisProvided && !isTailoringAnalysis(candidate.analysis)) return null
  const analysis = isTailoringAnalysis(candidate.analysis) ? candidate.analysis : emptyTailoringAnalysis()
  return {
    analysis: {
      matched: analysis.matched.map((item) => ({ requirement: item.requirement, evidenceBlockIds: [...item.evidenceBlockIds], ...(item.masterBlockIds ? { masterBlockIds: [...item.masterBlockIds] } : {}) })),
      understated: analysis.understated.map((item) => ({ requirement: item.requirement, evidenceBlockIds: [...item.evidenceBlockIds], ...(item.masterBlockIds ? { masterBlockIds: [...item.masterBlockIds] } : {}) })),
      missing: analysis.missing.map((item) => ({ requirement: item.requirement })),
    },
    edits: candidate.edits.map((edit) => ({ blockId: edit.blockId, text: edit.text, ...(edit.sourceMasterBlockIds ? { sourceMasterBlockIds: [...edit.sourceMasterBlockIds] } : {}) })),
    ...(reorders ? { reorders: reorders.map((reorder) => ({ experienceId: reorder.experienceId, blockIds: [...reorder.blockIds] })) } : {}),
    ...(merges ? { merges: merges.map((merge) => ({ experienceId: merge.experienceId, sourceBlockIds: [merge.sourceBlockIds[0], merge.sourceBlockIds[1]], targetBlockId: merge.targetBlockId, text: merge.text, ...(merge.sourceMasterBlockIds ? { sourceMasterBlockIds: [...merge.sourceMasterBlockIds] } : {}) })) } : {}),
    analysisProvided,
  }
}

export function parseLegacyIndexedTailoringResponse(raw: string): LegacyIndexedTailoringResponse | null {
  const candidate = jsonCandidate(raw)
  if (!isRecord(candidate) || !Array.isArray(candidate.edits) || !candidate.edits.every(isLegacyIndexedTailoringEdit)) return null
  return { edits: candidate.edits.map((edit) => ({ index: edit.index, text: edit.text })) }
}

// The UI previously accepted these response shapes. Keep parsing them here so
// this extraction does not alter the existing fallback compatibility.
export function parseLegacyTailoringReplacements(raw: string): unknown[] | null {
  const candidate = jsonCandidate(raw)
  const values = Array.isArray(candidate) ? candidate : isRecord(candidate) ? candidate.replacements : null
  return Array.isArray(values) ? values : null
}
import { jsonrepair } from 'jsonrepair'
