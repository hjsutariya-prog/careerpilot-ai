import type { MatchedRequirement, TailoringAnalysis, TailoringEdit, TailoringResponse, UnderstatedRequirement } from './tailoringSchema'
import type { ResumeBlock } from './resumeBlocks'
import { masterBackedRewriteReason, matchedMasterEvidenceForTemplate, needsMasterProvenance, resolveMasterSources, type TailoringMasterEvidence } from './tailoringMasterProvenance'

export type TailoringEditableSlot = ResumeBlock

export type TailoringValidationInput = {
  response: TailoringResponse
  editableSlots: TailoringEditableSlot[]
  maxEdits?: number
  enforceUnderstatedEditLinks?: boolean
  masterEvidence?: TailoringMasterEvidence
}

export type ValidatedTailoringEdit = TailoringEdit

export type RejectedTailoringEdit = {
  blockId: string
  text: string
  reason: string
}

export type RejectedTailoringEvidence = {
  classification: 'matched' | 'understated'
  requirement: string
  blockId: string
  reason: 'unknown_evidence_block' | 'duplicate_evidence_block' | 'unknown_master_source_block' | 'master_source_cross_experience' | 'master_source_without_match'
}

export type RejectedTailoringRequirement = {
  classification: 'matched' | 'understated' | 'missing'
  requirement: string
  reason: 'empty_requirement' | 'requirement_in_multiple_categories' | 'empty_evidence_block_ids' | 'missing_requirement_has_evidence'
}

export type TailoringValidationResult = {
  acceptedEdits: ValidatedTailoringEdit[]
  rejectedEdits: RejectedTailoringEdit[]
  analysis: TailoringAnalysis
  rejectedEvidence: RejectedTailoringEvidence[]
  rejectedRequirements: RejectedTailoringRequirement[]
  diagnostics: { proposed: number; editable: number; nonEmpty: number; withinLength: number; safe: number }
}

const irregularPastActionWords = new Set(['built', 'led', 'made', 'ran', 'wrote', 'drove', 'grew', 'saw', 'won', 'taught', 'spoke', 'took', 'gave', 'found', 'held', 'kept', 'met', 'paid', 'read', 'sent', 'set', 'spent'])
const presentActionWords = new Set(['build', 'builds', 'lead', 'leads', 'manage', 'manages', 'develop', 'develops', 'own', 'owns', 'drive', 'drives', 'work', 'works', 'create', 'creates', 'deliver', 'delivers', 'support', 'supports', 'maintain', 'maintains', 'collaborate', 'collaborates', 'design', 'designs', 'implement', 'implements', 'use', 'uses', 'improve', 'improves'])
const namedTechnologyAliases = [
  ['typescript'], ['javascript'], ['react'], ['next js', 'nextjs'], ['node js', 'nodejs'], ['python'], ['django'], ['java'], ['sql'], ['postgresql'], ['mysql'], ['mongodb'],
  ['aws', 'amazon web services'], ['azure'], ['gcp', 'google cloud platform'], ['docker'], ['kubernetes'], ['terraform'], ['pytorch'], ['tensorflow'], ['tableau'], ['snowflake'], ['bigquery'], ['datadog'],
  ['aws certified solutions architect'], ['aws certified'], ['azure certification'], ['google cloud certification'],
] as const

export function actionTense(text: string) {
  const action = text.trim().replace(/^[-*•]\s*/, '').match(/^([a-zA-Z]+)/)?.[1]?.toLowerCase()
  if (!action) return null
  if (action.endsWith('ing')) return 'ongoing'
  if (action.endsWith('ed') || irregularPastActionWords.has(action)) return 'past'
  if (presentActionWords.has(action)) return 'present'
  return null
}

export function preservesActionTense(source: string, replacement: string) {
  const sourceTense = actionTense(source)
  return sourceTense === null || sourceTense === actionTense(replacement)
}

function valuesIn(text: string): string[] {
  return text.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []
}

function normalizedNamedTechnologyText(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

function hasNamedTechnologyAlias(text: string, aliases: readonly string[]) {
  const normalized = normalizedNamedTechnologyText(text)
  return aliases.some((alias) => normalized.includes(` ${alias} `))
}

function namedTechnologiesIn(text: string) {
  return namedTechnologyAliases.flatMap((aliases, index) => hasNamedTechnologyAlias(text, aliases) ? [index] : [])
}

export function introducesUnsupportedNamedTechnology(resumeEvidence: string, replacement: string) {
  const evidenceTechnologies = new Set(namedTechnologiesIn(resumeEvidence))
  return namedTechnologiesIn(replacement).some((technology) => !evidenceTechnologies.has(technology))
}

function acronymsIn(text: string): string[] {
  return text.match(/\b[A-Z][A-Z0-9]{1,}\b/g) ?? []
}

function isSkillSlot(text: string) {
  return /^\s*(?:technical\s+)?(?:skills|technologies|tools)\s*:/i.test(text)
}

function skillItemsIn(text: string) {
  const match = text.match(/^\s*((?:technical\s+)?(?:skills|technologies|tools)\s*:\s*)([\s\S]+)$/i)
  if (!match) return null
  const separator = match[2].includes(',') ? ',' : match[2].includes('|') ? '|' : null
  if (!separator) return null
  const items = match[2].split(separator).map((item) => item.trim())
  return items.length > 1 && items.every(Boolean) ? { prefix: match[1].trim(), separator, items } : null
}

export function isSafeSkillReorder(source: string, replacement: string) {
  const sourceItems = skillItemsIn(source)
  const replacementItems = skillItemsIn(replacement)
  if (!sourceItems || !replacementItems || sourceItems.prefix.toLowerCase() !== replacementItems.prefix.toLowerCase() || sourceItems.separator !== replacementItems.separator || sourceItems.items.length !== replacementItems.items.length) return false
  return sourceItems.items.toSorted().join('\u0000') === replacementItems.items.toSorted().join('\u0000') && sourceItems.items.join('\u0000') !== replacementItems.items.join('\u0000')
}

const genericMaterialWords = new Set(['a', 'an', 'and', 'applications', 'as', 'for', 'in', 'of', 'on', 'or', 'responsible', 'stakeholders', 'systems', 'team', 'the', 'to', 'with', 'worked', 'work'])
const leadingActionWords = new Set(['built', 'created', 'delivered', 'developed', 'directed', 'drove', 'led', 'made', 'managed', 'owned', 'partnered', 'ran', 'supported', 'wrote'])
const responsibilityEquivalences = [
  ['backlog prioritization', 'prioritized backlog'],
  ['sprint planning', 'planned sprints'],
  ['release management', 'managed releases'],
] as const

function wordCount(text: string) {
  return text.match(/[A-Za-z0-9]+(?:[+#.-][A-Za-z0-9]+)*/g)?.length ?? 0
}

function normalizedMaterialPhrase(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function includesMaterialPhrase(text: string, phrase: string) {
  return ` ${normalizedMaterialPhrase(text)} `.includes(` ${phrase} `)
}

function equivalentMaterialPhrases(phrase: string) {
  const pair = responsibilityEquivalences.find(([first, second]) => first === phrase || second === phrase)
  return pair ? [...pair] : [phrase]
}

function isControlledResponsibilityPhrase(phrase: string) {
  return responsibilityEquivalences.some(([first, second]) => first === phrase || second === phrase)
}

function addMaterialConcept(concepts: Set<string>, value: string) {
  const normalized = normalizedMaterialPhrase(value)
  const words = normalized.split(' ').filter(Boolean)
  if (!normalized || (words.length === 1 && genericMaterialWords.has(words[0]))) return
  concepts.add(normalized)
}

function responsibilityItemsIn(text: string) {
  const items: string[] = []
  const pattern = /\b(?:own|owned|manage|managed|lead|led|direct|directed|drive|drove|deliver|delivered|prioritize|prioritized)\s+([^.;:]+?)(?=\s+(?:across|through|with|for|in|to)\b|[.;]|$)/gi
  for (const match of text.matchAll(pattern)) {
    const isList = /,|\band\b/i.test(match[1])
    for (const item of match[1].replace(/\s+and\s+/gi, ',').split(',')) {
      const normalized = normalizedMaterialPhrase(item)
      const words = normalized.split(' ').filter(Boolean)
      const isControlledPhrase = isControlledResponsibilityPhrase(normalized)
      if ((isList || isControlledPhrase) && (words.length > 1 || (words.length === 1 && !genericMaterialWords.has(words[0])))) items.push(normalized)
    }
  }
  return items
}

function materialConceptsIn(text: string) {
  const concepts = new Set<string>()
  for (const item of responsibilityItemsIn(text)) addMaterialConcept(concepts, item)
  const capitalizedPhrase = /\b(?:[A-Z][A-Za-z0-9]*)(?:(?:\s+|\s*[&–-]\s*)[A-Z][A-Za-z0-9]*)*/g
  for (const match of text.matchAll(capitalizedPhrase)) {
    const words = match[0].split(/\s+/)
    if (leadingActionWords.has(words[0].toLowerCase())) words.shift()
    addMaterialConcept(concepts, words.join(' '))
  }
  const organizationalConcept = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+of\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\b/g
  for (const match of text.matchAll(organizationalConcept)) addMaterialConcept(concepts, match[1])
  const scopePatterns = [
    /\b(?:across|through|within|in)\s+((?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:[a-z]+\s+){0,3}(?:platforms?|teams?|products?|regions?|markets?|countries?))\b/gi,
    /\b((?:[A-Z][A-Za-z]*(?:[-–][A-Z][A-Za-z]*)+)\s+team)\b/g,
    /\b(\d+\s+(?:(?:[A-Za-z]+\s+){0,2})(?:developers?|analysts?|engineers?|designers?|managers?|specialists?|users?|customers?))\b/gi,
  ]
  for (const pattern of scopePatterns) for (const match of text.matchAll(pattern)) addMaterialConcept(concepts, match[1])
  return [...concepts]
}

function removedMaterialConcepts(source: string, replacement: string) {
  return materialConceptsIn(source).filter((concept) => !equivalentMaterialPhrases(concept).some((variant) => includesMaterialPhrase(replacement, variant)))
}

export function preservesMaterialContent(source: string, replacement: string) {
  return removedMaterialConcepts(source, replacement).length === 0
}

function isWithinExperienceLengthLimit(source: string, replacement: string) {
  return replacement.length <= Math.ceil(source.length * 1.1)
    && wordCount(replacement) <= Math.ceil(wordCount(source) * 1.1)
}

export function isSafeExperienceRewrite(source: string, replacement: string) {
  const sourceValues = valuesIn(source)
  const replacementValues = valuesIn(replacement)
  const sourceAcronyms = acronymsIn(source)
  const replacementAcronyms = acronymsIn(replacement)
  return preservesActionTense(source, replacement)
    && isWithinExperienceLengthLimit(source, replacement)
    && sourceValues.length === replacementValues.length
    && sourceValues.every((value, index) => value === replacementValues[index])
    && sourceAcronyms.every((acronym) => replacementAcronyms.includes(acronym))
    && replacementAcronyms.every((acronym) => sourceAcronyms.includes(acronym))
    && replacement.split(/[.!?]/).filter(Boolean).length <= source.split(/[.!?]/).filter(Boolean).length
    && preservesMaterialContent(source, replacement)
}

function rejectionReason(source: string, replacement: string) {
  if (isSkillSlot(source)) {
    if (replacement.length > source.length) return 'replacement_too_long'
    return 'unsafe_skill_reorder'
  }
  if (!isWithinExperienceLengthLimit(source, replacement)) return 'replacement_too_long'
  if (!preservesActionTense(source, replacement)) return 'changed_action_tense'
  if (valuesIn(source).join('\u0000') !== valuesIn(replacement).join('\u0000')) return 'changed_number'
  const sourceAcronyms = acronymsIn(source)
  const replacementAcronyms = acronymsIn(replacement)
  if (!sourceAcronyms.every((acronym) => replacementAcronyms.includes(acronym)) || !replacementAcronyms.every((acronym) => sourceAcronyms.includes(acronym))) return 'changed_acronym'
  if (replacement.split(/[.!?]/).filter(Boolean).length > source.split(/[.!?]/).filter(Boolean).length) return 'expanded_sentence_count'
  if (!preservesMaterialContent(source, replacement)) return 'material_content_removed'
  return 'unsafe_rewrite'
}

function isSafeTemplateReplacement(source: string, replacement: string) {
  return isSkillSlot(source)
    ? replacement.length <= source.length && isSafeSkillReorder(source, replacement)
    : isSafeExperienceRewrite(source, replacement)
}

type RequirementClassification = 'matched' | 'understated' | 'missing'

function normalizedRequirement(requirement: string) {
  return requirement.trim().toLowerCase().replace(/\s+/g, ' ')
}

function requirementMentionsSkill(requirement: string, skill: string) {
  const normalizedRequirementText = ` ${normalizedNamedTechnologyText(requirement)} `
  const normalizedSkill = normalizedNamedTechnologyText(skill).trim()
  return Boolean(normalizedSkill) && normalizedRequirementText.includes(` ${normalizedSkill} `)
}

function hasRelevantSkillEvidence(blockId: string, source: string, requirements: Array<MatchedRequirement | UnderstatedRequirement>) {
  const skills = skillItemsIn(source)?.items ?? []
  return requirements.some((item) => item.evidenceBlockIds.includes(blockId) && skills.some((skill) => requirementMentionsSkill(item.requirement, skill)))
}

function validateAnalysis(analysis: TailoringAnalysis, blocksById: Map<string, TailoringEditableSlot>, masterEvidence?: TailoringMasterEvidence) {
  const rejectedEvidence: RejectedTailoringEvidence[] = []
  const rejectedRequirements: RejectedTailoringRequirement[] = []
  const categoriesByRequirement = new Map<string, Set<RequirementClassification>>()
  const allRequirements: Array<readonly [RequirementClassification, { requirement: string }]> = [
    ...analysis.matched.map((item) => ['matched', item] as const),
    ...analysis.understated.map((item) => ['understated', item] as const),
    ...analysis.missing.map((item) => ['missing', item] as const),
  ]

  for (const [classification, item] of allRequirements) {
    const requirement = normalizedRequirement(item.requirement)
    if (!requirement) continue
    const categories = categoriesByRequirement.get(requirement) ?? new Set<RequirementClassification>()
    categories.add(classification)
    categoriesByRequirement.set(requirement, categories)
  }
  const contradictoryRequirements = new Set([...categoriesByRequirement].filter(([, categories]) => categories.size > 1).map(([requirement]) => requirement))

  const rejectRequirement = (classification: RequirementClassification, requirement: string, reason: RejectedTailoringRequirement['reason']) => {
    rejectedRequirements.push({ classification, requirement: requirement.trim(), reason })
  }
  const isInvalidRequirement = (classification: RequirementClassification, requirement: string) => {
    const normalized = normalizedRequirement(requirement)
    if (!normalized) {
      rejectRequirement(classification, requirement, 'empty_requirement')
      return true
    }
    if (contradictoryRequirements.has(normalized)) {
      rejectRequirement(classification, requirement, 'requirement_in_multiple_categories')
      return true
    }
    return false
  }
  const validateEvidence = <T extends MatchedRequirement | UnderstatedRequirement>(classification: 'matched' | 'understated', requirements: T[]) => requirements.flatMap((item) => {
    if (isInvalidRequirement(classification, item.requirement)) return []
    const seenBlockIds = new Set<string>()
    const evidenceBlockIds = item.evidenceBlockIds.flatMap((blockId) => {
      if (seenBlockIds.has(blockId)) {
        rejectedEvidence.push({ classification, requirement: item.requirement.trim(), blockId, reason: 'duplicate_evidence_block' })
        return []
      }
      seenBlockIds.add(blockId)
      if (!blocksById.has(blockId)) {
        rejectedEvidence.push({ classification, requirement: item.requirement.trim(), blockId, reason: 'unknown_evidence_block' })
        return []
      }
      return [blockId]
    })
    if (!evidenceBlockIds.length) {
      rejectRequirement(classification, item.requirement, 'empty_evidence_block_ids')
      return []
    }
    const seenMasterBlockIds = new Set<string>()
    const masterBlockIds = (item.masterBlockIds ?? []).flatMap((masterBlockId) => {
      if (seenMasterBlockIds.has(masterBlockId)) {
        rejectedEvidence.push({ classification, requirement: item.requirement.trim(), blockId: masterBlockId, reason: 'duplicate_evidence_block' })
        return []
      }
      seenMasterBlockIds.add(masterBlockId)
      const hasAllowedMatch = evidenceBlockIds.some((templateBlockId) => {
        const templateBlock = blocksById.get(templateBlockId)
        const matchedMaster = matchedMasterEvidenceForTemplate(masterEvidence, templateBlock?.experienceId)
        return matchedMaster?.blocks.some((block) => block.blockId === masterBlockId)
      })
      if (hasAllowedMatch) return [masterBlockId]
      const reason = masterEvidence?.masterBlockExperienceIds[masterBlockId]
        ? 'master_source_cross_experience'
        : masterEvidence ? 'unknown_master_source_block' : 'master_source_without_match'
      rejectedEvidence.push({ classification, requirement: item.requirement.trim(), blockId: masterBlockId, reason })
      return []
    })
    return [{ requirement: item.requirement.trim(), evidenceBlockIds, ...(masterBlockIds.length ? { masterBlockIds } : {}) }]
  })
  const validateMissing = () => analysis.missing.flatMap((item) => {
    if (isInvalidRequirement('missing', item.requirement)) return []
    if (Object.prototype.hasOwnProperty.call(item, 'evidenceBlockIds')) {
      rejectRequirement('missing', item.requirement, 'missing_requirement_has_evidence')
      return []
    }
    return [{ requirement: item.requirement.trim() }]
  })

  return {
    analysis: {
      matched: validateEvidence('matched', analysis.matched),
      understated: validateEvidence('understated', analysis.understated),
      missing: validateMissing(),
    },
    rejectedEvidence,
    rejectedRequirements,
  }
}

export function validateTailoringResponse(input: TailoringValidationInput): TailoringValidationResult {
  const edits = input.response.edits.slice(0, input.maxEdits ?? 8)
  const blocksById = new Map(input.editableSlots.map((block) => [block.blockId, block]))
  const analysisValidation = validateAnalysis(input.response.analysis, blocksById, input.masterEvidence)
  const understatedEvidenceBlockIds = new Set(analysisValidation.analysis.understated.flatMap((item) => item.evidenceBlockIds))
  const seenBlockIds = new Set<string>()
  const acceptedEdits: ValidatedTailoringEdit[] = []
  const rejectedEdits: RejectedTailoringEdit[] = []
  let editable = 0
  let nonEmpty = 0
  let withinLength = 0
  let safe = 0

  for (const edit of edits) {
    const slot = blocksById.get(edit.blockId)
    const text = edit.text.replace(/\s+/g, ' ').trim()
    if (seenBlockIds.has(edit.blockId)) {
      rejectedEdits.push({ blockId: edit.blockId, text, reason: 'duplicate_block_id' })
      continue
    }
    seenBlockIds.add(edit.blockId)
    if (!slot) {
      rejectedEdits.push({ blockId: edit.blockId, text, reason: 'unknown_block_id' })
      continue
    }
    if (!slot.editable) {
      rejectedEdits.push({ blockId: edit.blockId, text, reason: 'protected_slot' })
      continue
    }
    const resolvedMasterSources = resolveMasterSources({ templateBlock: slot, sourceMasterBlockIds: edit.sourceMasterBlockIds, masterEvidence: input.masterEvidence })
    if (!resolvedMasterSources.ok) {
      rejectedEdits.push({ blockId: edit.blockId, text, reason: resolvedMasterSources.reason })
      continue
    }
    const matchedMasterEvidence = matchedMasterEvidenceForTemplate(input.masterEvidence, slot.experienceId)
    if (!edit.sourceMasterBlockIds?.length && matchedMasterEvidence && needsMasterProvenance(slot.text, text, matchedMasterEvidence.blocks)) {
      rejectedEdits.push({ blockId: edit.blockId, text, reason: 'master_provenance_required' })
      continue
    }
    const exactSkillReorder = isSafeSkillReorder(slot.text, text)
    const hasUnderstatedEvidence = understatedEvidenceBlockIds.has(edit.blockId)
    const hasRelevantMatchedSkillEvidence = hasRelevantSkillEvidence(edit.blockId, slot.text, analysisValidation.analysis.matched)
    const hasRelevantUnderstatedSkillEvidence = hasRelevantSkillEvidence(edit.blockId, slot.text, analysisValidation.analysis.understated)
    const hasSkillReorderEvidence = hasRelevantMatchedSkillEvidence || hasRelevantUnderstatedSkillEvidence
    if (input.enforceUnderstatedEditLinks && !(exactSkillReorder ? hasSkillReorderEvidence : hasUnderstatedEvidence)) {
      rejectedEdits.push({ blockId: edit.blockId, text, reason: 'edit_has_no_understated_evidence' })
      continue
    }
    const templateExperienceEvidence = slot.experienceId
      ? input.editableSlots.filter((block) => block.experienceId === slot.experienceId).map((block) => block.text).join('\n')
      : input.editableSlots.map((block) => block.text).join('\n')
    const allowedEvidence = `${templateExperienceEvidence}\n${resolvedMasterSources.blocks.map((block) => block.text).join('\n')}`
    if (input.enforceUnderstatedEditLinks && introducesUnsupportedNamedTechnology(allowedEvidence, text)) {
      rejectedEdits.push({ blockId: edit.blockId, text, reason: 'missing_named_requirement_introduced' })
      continue
    }
    editable += 1
    if (!text) {
      rejectedEdits.push({ blockId: edit.blockId, text, reason: 'empty_replacement' })
      continue
    }
    nonEmpty += 1
    if (isSkillSlot(slot.text) ? text.length <= slot.text.length : text.length < slot.text.length) withinLength += 1
    const safetyReason = resolvedMasterSources.blocks.length
      ? masterBackedRewriteReason(slot.text, text, resolvedMasterSources.blocks)
      : isSafeTemplateReplacement(slot.text, text) ? null : rejectionReason(slot.text, text)
    if (!safetyReason) {
      safe += 1
      acceptedEdits.push({ blockId: edit.blockId, text, ...(edit.sourceMasterBlockIds?.length ? { sourceMasterBlockIds: [...edit.sourceMasterBlockIds] } : {}) })
      continue
    }
    rejectedEdits.push({ blockId: edit.blockId, text, reason: safetyReason })
  }

  return { acceptedEdits, rejectedEdits, analysis: analysisValidation.analysis, rejectedEvidence: analysisValidation.rejectedEvidence, rejectedRequirements: analysisValidation.rejectedRequirements, diagnostics: { proposed: edits.length, editable, nonEmpty, withinLength, safe } }
}
