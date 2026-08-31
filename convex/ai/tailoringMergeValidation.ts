import type { ResumeBlock } from './resumeBlocks'
import type { TailoringMerge } from './tailoringSchema'
import { introducesUnsupportedNamedTechnology, preservesMaterialContent } from './tailoringValidation'
import { matchedMasterEvidenceForTemplate, needsMasterProvenance, resolveMasterSources, type TailoringMasterEvidence } from './tailoringMasterProvenance'

export type RejectedTailoringMergeReason =
  | 'merge_unknown_experience'
  | 'merge_unknown_block'
  | 'merge_cross_experience'
  | 'merge_non_bullet'
  | 'merge_invalid_target'
  | 'merge_duplicate_source'
  | 'merge_conflict'
  | 'merge_not_redundant'
  | 'merge_material_content_removed'
  | 'merge_unsupported_fact'
  | 'merge_number_changed'
  | 'merge_acronym_changed'
  | 'merge_named_requirement_introduced'
  | 'merge_leadership_upgraded'
  | 'merge_too_long'
  | 'unknown_master_source_block'
  | 'master_source_cross_experience'
  | 'master_source_without_match'
  | 'master_source_wrong_template_experience'
  | 'master_provenance_required'

export type RejectedTailoringMerge = {
  experienceId: string
  sourceBlockIds: [string, string]
  targetBlockId: string
  reason: RejectedTailoringMergeReason
}

export type TailoringMergeValidationInput = {
  merges?: TailoringMerge[]
  resumeBlocks: ResumeBlock[]
  acceptedEditBlockIds?: Iterable<string>
  masterEvidence?: TailoringMasterEvidence
}

export type TailoringMergeValidationResult = {
  acceptedMerges: TailoringMerge[]
  rejectedMerges: RejectedTailoringMerge[]
}

const genericTerms = new Set(['across', 'and', 'business', 'for', 'from', 'into', 'managed', 'management', 'on', 'product', 'the', 'through', 'with'])
const derivedMergeTerms = new Set(['delivery', 'management', 'prioritization', 'project', 'release'])
const deliveryTerms = new Set(['agile', 'backlog', 'delivery', 'project', 'release', 'releases', 'sprint', 'sprints'])
const leadershipClaimPatterns = [
  /\b(?:led|leadership)\b/i,
  /\bdirected\b/i,
  /\bsupervised\b/i,
  /\b(?:owned|ownership)\b/i,
  /\bmanaged\s+(?:a|the)?\s*(?:team|people|engineers|developers|analysts)\b/i,
] as const
const controlledMergeConcepts = [
  ['backlog prioritization', 'prioritized product backlog', 'prioritized backlog'],
  ['sprint planning', 'facilitated sprint planning', 'planned sprints'],
  ['release management', 'managed releases', 'managed release', 'releases'],
] as const

function wordsIn(value: string) {
  return (value.toLowerCase().match(/[a-z][a-z0-9+#.-]*/g) ?? []).map((word) => word.replace(/[.-]+$/g, ''))
}

function wordCount(value: string) {
  return wordsIn(value).length
}

function valuesIn(value: string) {
  return value.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []
}

function preservesValues(source: string[], replacement: string[]) {
  const available = new Map<string, number>()
  for (const value of replacement) available.set(value, (available.get(value) ?? 0) + 1)
  return source.every((value) => {
    const count = available.get(value) ?? 0
    if (!count) return false
    available.set(value, count - 1)
    return true
  })
}

function acronymsIn(value: string): string[] {
  return value.match(/\b[A-Z][A-Z0-9]{1,}\b/g) ?? []
}

function hasControlledConcept(value: string, aliases: readonly string[]) {
  const normalized = ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  return aliases.some((alias) => normalized.includes(` ${alias} `))
}

function preservesControlledMergeConcepts(source: string, replacement: string) {
  return controlledMergeConcepts.every((aliases) => !hasControlledConcept(source, aliases) || hasControlledConcept(replacement, aliases))
}

function normalizedForMergeSafety(value: string) {
  return value
    .replace(/\bprioritized product backlog\b/gi, 'backlog prioritization')
    .replace(/\bprioritized backlog\b/gi, 'backlog prioritization')
    .replace(/\bfacilitated sprint planning\b/gi, 'sprint planning')
    .replace(/\bplanned sprints\b/gi, 'sprint planning')
    .replace(/\bmanaged releases?\b/gi, 'release management')
}

function hasReasonableResponsibilityOverlap(first: string, second: string) {
  const firstTerms = new Set(wordsIn(first).filter((term) => term.length > 3 && !genericTerms.has(term)))
  const secondTerms = new Set(wordsIn(second).filter((term) => term.length > 3 && !genericTerms.has(term)))
  if ([...firstTerms].some((term) => secondTerms.has(term))) return true
  return [...firstTerms].some((term) => deliveryTerms.has(term))
    && [...secondTerms].some((term) => deliveryTerms.has(term))
}

function hasUnsupportedNewFact(source: string, replacement: string) {
  const sourceTerms = new Set(wordsIn(source))
  return wordsIn(replacement).some((term) => term.length > 3 && !sourceTerms.has(term) && !genericTerms.has(term) && !derivedMergeTerms.has(term))
}

function lengthIsBounded(source: string, replacement: string) {
  const sourceWords = wordCount(source)
  const replacementWords = wordCount(replacement)
  return replacement.length <= source.length
    && replacementWords <= sourceWords
    && (replacement.length < source.length || replacementWords < sourceWords)
}

function hasLeadershipUpgrade(source: string, replacement: string) {
  return leadershipClaimPatterns.some((pattern) => pattern.test(replacement) && !pattern.test(source))
}

function mergeSourceText(blocks: [ResumeBlock, ResumeBlock]) {
  return `${blocks[0].text}\n${blocks[1].text}`
}

export function validateTailoringMerges(input: TailoringMergeValidationInput): TailoringMergeValidationResult {
  const blocksById = new Map(input.resumeBlocks.map((block) => [block.blockId, block]))
  const experienceIds = new Set(input.resumeBlocks.filter((block) => block.kind === 'experience_header').map((block) => block.experienceId).filter((experienceId): experienceId is string => Boolean(experienceId)))
  const acceptedEditBlockIds = new Set(input.acceptedEditBlockIds ?? [])
  const claimedSourceBlockIds = new Set<string>()
  const acceptedMerges: TailoringMerge[] = []
  const rejectedMerges: RejectedTailoringMerge[] = []

  for (const merge of input.merges ?? []) {
    const reject = (reason: RejectedTailoringMergeReason) => {
      rejectedMerges.push({ experienceId: merge.experienceId, sourceBlockIds: [merge.sourceBlockIds[0], merge.sourceBlockIds[1]], targetBlockId: merge.targetBlockId, reason })
    }
    if (!experienceIds.has(merge.experienceId)) {
      reject('merge_unknown_experience')
      continue
    }

    const [firstId, secondId] = merge.sourceBlockIds
    if (firstId === secondId) {
      reject('merge_duplicate_source')
      continue
    }
    if (merge.targetBlockId !== firstId && merge.targetBlockId !== secondId) {
      reject('merge_invalid_target')
      continue
    }
    const first = blocksById.get(firstId)
    const second = blocksById.get(secondId)
    if (!first || !second) {
      reject('merge_unknown_block')
      continue
    }
    if (first.kind !== 'experience_bullet' || second.kind !== 'experience_bullet' || !first.editable || !second.editable) {
      reject('merge_non_bullet')
      continue
    }
    if (first.experienceId !== merge.experienceId || second.experienceId !== merge.experienceId) {
      reject('merge_cross_experience')
      continue
    }
    if (claimedSourceBlockIds.has(firstId) || claimedSourceBlockIds.has(secondId) || acceptedEditBlockIds.has(firstId) || acceptedEditBlockIds.has(secondId)) {
      reject('merge_conflict')
      continue
    }
    claimedSourceBlockIds.add(firstId)
    claimedSourceBlockIds.add(secondId)

    const sources: [ResumeBlock, ResumeBlock] = [first, second]
    const source = mergeSourceText(sources)
    const replacement = merge.text.replace(/\s+/g, ' ').trim()
    const resolvedMasterSources = resolveMasterSources({ templateBlock: first, sourceMasterBlockIds: merge.sourceMasterBlockIds, masterEvidence: input.masterEvidence })
    if (!resolvedMasterSources.ok) {
      reject(resolvedMasterSources.reason)
      continue
    }
    const matchedMasterEvidence = matchedMasterEvidenceForTemplate(input.masterEvidence, merge.experienceId)
    if (!merge.sourceMasterBlockIds?.length && matchedMasterEvidence && needsMasterProvenance(source, replacement, matchedMasterEvidence.blocks)) {
      reject('master_provenance_required')
      continue
    }
    if (!hasReasonableResponsibilityOverlap(first.text, second.text)) {
      reject('merge_not_redundant')
      continue
    }
    if (!lengthIsBounded(source, replacement)) {
      reject('merge_too_long')
      continue
    }
    const masterText = resolvedMasterSources.blocks.map((block) => block.text).join('\n')
    const combinedSource = `${source}\n${masterText}`
    if (resolvedMasterSources.blocks.length && (!preservesValues(valuesIn(source), valuesIn(replacement)) || !preservesValues(valuesIn(replacement), valuesIn(combinedSource)))) {
      reject('merge_number_changed')
      continue
    }
    if (!resolvedMasterSources.blocks.length && valuesIn(source).join('\u0000') !== valuesIn(replacement).join('\u0000')) {
      reject('merge_number_changed')
      continue
    }
    const sourceAcronyms = acronymsIn(source)
    const replacementAcronyms = acronymsIn(replacement)
    const sourceAcronymsPreserved = preservesValues(sourceAcronyms, replacementAcronyms)
    const replacementAcronymsSupported = preservesValues(replacementAcronyms, acronymsIn(combinedSource))
    if (resolvedMasterSources.blocks.length ? (!sourceAcronymsPreserved || !replacementAcronymsSupported) : (!sourceAcronyms.every((acronym) => replacementAcronyms.includes(acronym)) || !replacementAcronyms.every((acronym) => sourceAcronyms.includes(acronym)))) {
      reject('merge_acronym_changed')
      continue
    }
    if (!resolvedMasterSources.blocks.length && introducesUnsupportedNamedTechnology(combinedSource, replacement)) {
      reject('merge_named_requirement_introduced')
      continue
    }
    if (hasLeadershipUpgrade(combinedSource, replacement)) {
      reject('merge_leadership_upgraded')
      continue
    }
    if (hasUnsupportedNewFact(combinedSource, replacement)) {
      reject('merge_unsupported_fact')
      continue
    }
    if (!preservesControlledMergeConcepts(source, replacement) || !preservesMaterialContent(normalizedForMergeSafety(source), normalizedForMergeSafety(replacement))) {
      reject('merge_material_content_removed')
      continue
    }

    acceptedMerges.push({ ...merge, text: replacement, ...(merge.sourceMasterBlockIds?.length ? { sourceMasterBlockIds: [...merge.sourceMasterBlockIds] } : {}) })
  }

  return { acceptedMerges, rejectedMerges }
}
