import type { MasterExperience, MasterExperienceBlock, MasterResumeStructure } from '../masterResumeStructure'
import { matchTemplateExperiencesToMaster, templateExperiencesFromBlocks } from './experienceMatching'
import type { ResumeBlock } from './resumeBlocks'
import { introducesUnsupportedNamedTechnology, preservesActionTense, preservesMaterialContent } from './tailoringValidation'

export type MatchedMasterExperienceEvidence = {
  templateExperienceId: string
  masterExperienceId: string
  confidence: number
  blocks: MasterExperienceBlock[]
}

export type TailoringMasterEvidence = {
  byTemplateExperience: Record<string, MatchedMasterExperienceEvidence>
  /** Includes all active-Master block IDs solely to distinguish unknown IDs from cross-experience IDs. */
  masterBlockExperienceIds: Record<string, string>
}

export type MasterProvenanceReason =
  | 'unknown_master_source_block'
  | 'master_source_cross_experience'
  | 'master_source_without_match'
  | 'master_source_wrong_template_experience'
  | 'master_provenance_required'

export type ResolvedMasterSources =
  | { ok: true; blocks: MasterExperienceBlock[] }
  | { ok: false; reason: MasterProvenanceReason }

export function emptyTailoringMasterEvidence(): TailoringMasterEvidence {
  return { byTemplateExperience: {}, masterBlockExperienceIds: {} }
}

/** Creates the only Master evidence pool that a Template experience may later use. */
export function masterEvidenceForTemplateSlots(templateBlocks: ResumeBlock[], structure: MasterResumeStructure | null | undefined): TailoringMasterEvidence {
  if (!structure) return emptyTailoringMasterEvidence()
  const templateExperiences = templateExperiencesFromBlocks(templateBlocks)
  const result = matchTemplateExperiencesToMaster(templateExperiences, structure.experiences)
  const masterById = new Map(structure.experiences.map((experience) => [experience.experienceId, experience]))
  const byTemplateExperience: Record<string, MatchedMasterExperienceEvidence> = {}
  for (const match of result.matches) {
    const master = masterById.get(match.masterExperienceId)
    if (master) byTemplateExperience[match.templateExperienceId] = {
      templateExperienceId: match.templateExperienceId,
      masterExperienceId: master.experienceId,
      confidence: match.confidence,
      blocks: master.blocks.map((block) => ({ ...block })),
    }
  }
  const masterBlockExperienceIds: Record<string, string> = {}
  for (const experience of structure.experiences) for (const block of experience.blocks) masterBlockExperienceIds[block.blockId] = experience.experienceId
  return { byTemplateExperience, masterBlockExperienceIds }
}

export function matchedMasterEvidenceForTemplate(masterEvidence: TailoringMasterEvidence | undefined, templateExperienceId: string | undefined) {
  return templateExperienceId ? masterEvidence?.byTemplateExperience[templateExperienceId] : undefined
}

export function resolveMasterSources(input: { templateBlock: ResumeBlock; sourceMasterBlockIds?: string[]; masterEvidence?: TailoringMasterEvidence }): ResolvedMasterSources {
  const ids = input.sourceMasterBlockIds ?? []
  if (!ids.length) return { ok: true, blocks: [] }
  const templateExperienceId = input.templateBlock.experienceId
  if (!templateExperienceId || input.templateBlock.kind !== 'experience_bullet') return { ok: false, reason: 'master_source_wrong_template_experience' }
  const evidence = matchedMasterEvidenceForTemplate(input.masterEvidence, templateExperienceId)
  if (!evidence) return { ok: false, reason: 'master_source_without_match' }
  const blocksById = new Map(evidence.blocks.map((block) => [block.blockId, block]))
  const seen = new Set<string>()
  const blocks: MasterExperienceBlock[] = []
  for (const blockId of ids) {
    if (seen.has(blockId)) return { ok: false, reason: 'unknown_master_source_block' }
    seen.add(blockId)
    const block = blocksById.get(blockId)
    if (block) {
      blocks.push(block)
      continue
    }
    if (input.masterEvidence?.masterBlockExperienceIds[blockId]) return { ok: false, reason: 'master_source_cross_experience' }
    return { ok: false, reason: 'unknown_master_source_block' }
  }
  return { ok: true, blocks }
}

function wordsIn(text: string) {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.-]*/g) ?? []).map((word) => word.replace(/[.-]+$/g, ''))
}

function valuesIn(text: string) {
  return text.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []
}

function acronymsIn(text: string) {
  return text.match(/\b[A-Z][A-Z0-9]{1,}\b/g) ?? []
}

function hasAllValues(source: string[], replacement: string[]) {
  const available = new Map<string, number>()
  for (const value of replacement) available.set(value, (available.get(value) ?? 0) + 1)
  return source.every((value) => {
    const count = available.get(value) ?? 0
    if (!count) return false
    available.set(value, count - 1)
    return true
  })
}

function wordsCount(text: string) {
  return wordsIn(text).length
}

const presentationOnlyTerms = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with', 'across', 'through', 'using', 'used', 'while', 'which', 'built', 'build', 'developed', 'develop', 'created', 'create', 'delivered', 'deliver', 'translated', 'translate', 'improved', 'improve', 'optimized', 'optimize'])

function evidenceStem(word: string) {
  return word
    .replace(/ization$/, 'iz')
    .replace(/ment$/, '')
    .replace(/ing$/, '')
    .replace(/ed$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '')
    .replace(/e$/, '')
}

/** Conservative lexical check for named domains, stakeholder groups, scope, and other added factual wording. */
function hasUnsupportedMasterContent(evidence: string, replacement: string) {
  const evidenceTerms = new Set(wordsIn(evidence).map(evidenceStem))
  return wordsIn(replacement).some((word) => {
    if (word.length < 4 || presentationOnlyTerms.has(word)) return false
    return !evidenceTerms.has(evidenceStem(word))
  })
}

const leadershipPatterns = [
  /\b(?:led|leadership)\b/i,
  /\bdirected\b/i,
  /\bsupervised\b/i,
  /\b(?:owned|ownership)\b/i,
  /\bmanaged\s+(?:a|the)?\s*(?:team|people|engineers|developers|analysts)\b/i,
] as const

function leadershipIsSupported(evidence: string, replacement: string) {
  return leadershipPatterns.every((pattern) => !pattern.test(replacement) || pattern.test(evidence))
}

/** A citation is mandatory when a replacement visibly introduces wording from the matched Master evidence. */
export function needsMasterProvenance(templateText: string, replacement: string, availableMasterBlocks: MasterExperienceBlock[]) {
  const templateTerms = new Set(wordsIn(templateText).filter((word) => word.length > 3))
  const replacementTerms = new Set(wordsIn(replacement).filter((word) => word.length > 3))
  const introducedTerms = [...replacementTerms].filter((term) => !templateTerms.has(term))
  if (!introducedTerms.length) return false
  const masterTerms = new Set(availableMasterBlocks.flatMap((block) => wordsIn(block.text)).filter((word) => word.length > 3))
  return introducedTerms.some((term) => masterTerms.has(term))
}

/** Keeps every existing Template safeguard, while allowing additions only when the cited Master blocks prove them. */
export function masterBackedRewriteReason(templateText: string, replacement: string, masterBlocks: MasterExperienceBlock[]): string | null {
  const masterText = masterBlocks.map((block) => block.text).join('\n')
  const combinedEvidence = `${templateText}\n${masterText}`
  if (!preservesActionTense(templateText, replacement)) return 'changed_action_tense'
  if (replacement.length > Math.ceil(templateText.length * 1.2) || wordsCount(replacement) > Math.ceil(wordsCount(templateText) * 1.2)) return 'replacement_too_long'
  if (!hasAllValues(valuesIn(templateText), valuesIn(replacement))) return 'changed_number'
  if (!hasAllValues(valuesIn(replacement), valuesIn(combinedEvidence))) return 'unsupported_master_number'
  if (!hasAllValues(acronymsIn(templateText), acronymsIn(replacement))) return 'changed_acronym'
  if (!hasAllValues(acronymsIn(replacement), acronymsIn(combinedEvidence))) return 'unsupported_master_acronym'
  if (introducesUnsupportedNamedTechnology(combinedEvidence, replacement)) return 'missing_named_requirement_introduced'
  if (!leadershipIsSupported(combinedEvidence, replacement)) return 'leadership_not_supported'
  if (hasUnsupportedMasterContent(combinedEvidence, replacement)) return 'unsupported_master_fact'
  if (replacement.split(/[.!?]/).filter(Boolean).length > templateText.split(/[.!?]/).filter(Boolean).length) return 'expanded_sentence_count'
  if (!preservesMaterialContent(templateText, replacement)) return 'material_content_removed'
  return null
}

export function masterExperienceForId(structure: MasterResumeStructure, experienceId: string): MasterExperience | null {
  return structure.experiences.find((experience) => experience.experienceId === experienceId) ?? null
}
