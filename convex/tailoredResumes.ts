import { action, internalQuery, mutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { requireOwner } from './owner'
import { requestGeminiResponse, requestGeminiText } from './gemini'
import { tailoringGeminiConfig, tailoringJsonRepairGeminiConfig } from './ai/tailoringGeminiConfig'
import { buildTailoringUserPrompt } from './ai/tailoringPrompt'
import { buildTailoringJsonRepairPrompt, requiresTailoringJsonRepair } from './ai/tailoringRepair'
import { emptyTailoringAnalysis, parseLegacyIndexedTailoringResponse, parseLegacyTailoringReplacements, parseTailoringResponse, tailoringResponseSchema, type ParsedTailoringResponse, type TailoringMerge, type TailoringReorder } from './ai/tailoringSchema'
import { actionTense, isSafeExperienceRewrite, isSafeSkillReorder, preservesActionTense, validateTailoringResponse, type TailoringValidationResult } from './ai/tailoringValidation'
import { areResumeBlocksConsistent, type ResumeBlock } from './ai/resumeBlocks'
import { validateTailoringReorders, type TailoringReorderValidationResult } from './ai/tailoringReorderValidation'
import { validateTailoringMerges, type TailoringMergeValidationResult } from './ai/tailoringMergeValidation'
import { masterEvidenceForTemplateSlots, type TailoringMasterEvidence } from './ai/tailoringMasterProvenance'
import type { MasterResumeStructure } from './masterResumeStructure'
import { selectActiveMaster, selectLatestTemplateResume } from './resumeRecords'

type Input = { resumeText: string; resumeFileName: string; title: string; companyName: string; description: string; masterStructure: MasterResumeStructure | null }
type TemplateSlot = ResumeBlock
type TailoredResult = { fileName: string; resumeText: string; mode: 'ai' | 'reordered' | 'layout_protected'; replacements?: string[]; reorders?: TailoringReorder[]; merges?: TailoringMerge[]; reservationId?: string }

export function templateSlotsForGemini(slots: TemplateSlot[] | undefined): TemplateSlot[] | undefined {
  return slots?.map(({ blockId, index, text, editable, kind, experienceId, bulletIndex }) => ({
    blockId,
    index,
    text,
    editable,
    ...(kind ? { kind } : {}),
    ...(experienceId ? { experienceId } : {}),
    ...(bulletIndex !== undefined ? { bulletIndex } : {}),
  }))
}

/** Returns only Master blocks that deterministically match a Template experience. */
export function masterEvidenceForTailoring(slots: TemplateSlot[] | undefined, structure: MasterResumeStructure | null | undefined): TailoringMasterEvidence {
  return slots ? masterEvidenceForTemplateSlots(slots, structure) : { byTemplateExperience: {}, masterBlockExperienceIds: {} }
}

const keyTerms = (value: string) => new Set(value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g)?.filter((word) => !new Set(['the','and','with','for','that','this','from','you','your','will','are','our','job','role','work','years','experience']).has(word)) ?? [])
export { actionTense, isSafeExperienceRewrite, isSafeSkillReorder, preservesActionTense }

export function reorderResumeForJob(resumeText: string, description: string) {
  const lines = resumeText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 3) return resumeText
  const terms = keyTerms(description)
  const [header, ...body] = lines
  return [header, ...body.map((line, index) => ({ line, index, score: [...keyTerms(line)].filter((term) => terms.has(term)).length })).toSorted((a, b) => b.score - a.score || a.index - b.index).map(({ line }) => line)].join('\n')
}

export function reorderTemplateSlots(slots: TemplateSlot[], description: string) {
  const terms = keyTerms(description)
  return slots.map((slot) => {
    if (!slot.editable) return slot.text
    const skillList = slot.text.match(/^((?:technical\s+)?(?:skills|technologies|tools)\s*:\s*)([\s\S]+)$/i)
    if (!skillList) return slot.text
    const separator = skillList[2].includes(',') ? ',' : skillList[2].includes('|') ? '|' : null
    if (!separator) return slot.text
    const parts = skillList[2].split(separator).map((part, index) => ({ text: part.trim(), index, score: [...keyTerms(part)].filter((term) => terms.has(term)).length }))
    if (parts.length < 2 || parts.some((part) => /[.;]|\b(?:built|led|owned|directed|managed|cut|completed)\b/i.test(part.text)) || !parts.some((part) => part.score > 0)) return slot.text
    const reordered = `${skillList[1]}${parts.toSorted((a, b) => b.score - a.score || a.index - b.index).map((part) => part.text).join(`${separator} `)}`
    return reordered.length <= slot.text.length ? reordered : slot.text
  })
}

export function tailoredFileName(resumeFileName: string, title: string, companyName: string) {
  const base = resumeFileName.replace(/\.[^.]+$/, '') || 'resume'
  return `${[base, title, companyName, 'tailored'].join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.docx`
}

function legacyResponse(edits: ParsedTailoringResponse['edits']): ParsedTailoringResponse {
  return { analysis: emptyTailoringAnalysis(), edits, analysisProvided: false }
}

type ParsedTemplateResponse = {
  response: ParsedTailoringResponse
  maxEdits?: number
}

function parsedTemplateResponse(text: string, slots: TemplateSlot[]): ParsedTemplateResponse | null {
  const response = parseTailoringResponse(text)
  if (response) return { response }
  const legacyIndexedResponse = parseLegacyIndexedTailoringResponse(text)
  if (legacyIndexedResponse) {
    return { response: legacyResponse(legacyIndexedResponse.edits.map((edit) => ({ blockId: slots[edit.index]?.blockId ?? `legacy_index_${edit.index}`, text: edit.text }))) }
  }
  const values = parseLegacyTailoringReplacements(text)
  if (!values || values.length !== slots.length) return null
  return {
    response: legacyResponse(values.flatMap((value, index) => typeof value === 'string' ? [{ blockId: slots[index].blockId, text: value }] : [])),
    maxEdits: values.length,
  }
}

function resumeBlocksAfterMerges(slots: TemplateSlot[], merges: TailoringMerge[]) {
  const removedBlockIds = new Set(merges.map((merge) => merge.sourceBlockIds.find((blockId) => blockId !== merge.targetBlockId)!))
  return slots.filter((slot) => !removedBlockIds.has(slot.blockId))
}

function templateValidation(text: string, slots: TemplateSlot[], masterEvidence?: TailoringMasterEvidence) {
  const parsed = parsedTemplateResponse(text, slots)
  if (!parsed) return null
  const validation = validateTailoringResponse({ response: parsed.response, editableSlots: slots, maxEdits: parsed.maxEdits, enforceUnderstatedEditLinks: parsed.response.analysisProvided, masterEvidence })
  const mergeValidation = validateTailoringMerges({ merges: parsed.response.merges, resumeBlocks: slots, acceptedEditBlockIds: validation.acceptedEdits.map((edit) => edit.blockId), masterEvidence })
  const postMergeBlocks = resumeBlocksAfterMerges(slots, mergeValidation.acceptedMerges)
  return {
    response: parsed.response,
    validation,
    mergeValidation,
    reorderValidation: validateTailoringReorders({ reorders: parsed.response.reorders, resumeBlocks: postMergeBlocks }),
  }
}

function replacementsForValidation(validation: TailoringValidationResult, slots: TemplateSlot[], merges: TailoringMerge[] = []) {
  const blocksById = new Map(slots.map((slot) => [slot.blockId, slot]))
  const replacements = slots.map((slot) => slot.text)
  for (const edit of validation.acceptedEdits) {
    const block = blocksById.get(edit.blockId)
    if (block) replacements[block.index] = edit.text
  }
  for (const merge of merges) {
    const target = blocksById.get(merge.targetBlockId)
    if (target) replacements[target.index] = merge.text
  }
  return replacements.some((replacement, index) => replacement !== slots[index].text) ? replacements : null
}

export function templateReplacements(text: string, slots: TemplateSlot[]) {
  const result = templateValidation(text, slots)
  return result ? replacementsForValidation(result.validation, slots, result.mergeValidation.acceptedMerges) : null
}

export function templateReorders(text: string, slots: TemplateSlot[]) {
  return templateValidation(text, slots)?.reorderValidation.acceptedReorders ?? []
}

export function templateMerges(text: string, slots: TemplateSlot[]) {
  return templateValidation(text, slots)?.mergeValidation.acceptedMerges ?? []
}

export function templateReplacementDiagnostics(text: string, slots: TemplateSlot[]) {
  const result = templateValidation(text, slots)
  if (result) return { shape: 'edits', ...result.validation.diagnostics }
  try {
    const fenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const candidate = JSON.parse(fenced.match(/\{[\s\S]*\}/)?.[0] ?? fenced)
    if (!Array.isArray(candidate?.edits)) return { shape: Array.isArray(candidate) || Array.isArray(candidate?.replacements) ? 'replacement-array' : 'unexpected', proposed: 0, editable: 0, safe: 0 }
    return { shape: 'invalid-edits', proposed: 0, editable: 0, safe: 0 }
  } catch (error) {
    return { shape: 'invalid-json', textLength: text.length, parserError: error instanceof Error ? error.message : 'unknown', proposed: 0, editable: 0, safe: 0 }
  }
}

function redactDiagnosticText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?<!\d)(?:\+?\d{1,3}[\s.-]?)?\d{10}(?!\d)/g, '[redacted-phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

export type TailoringValidationDiagnostic = {
  tailoring_result: 'model_response_unparseable' | 'model_proposed_no_edits' | 'all_proposed_edits_rejected' | 'accepted_edits'
  analysis: { matched: Array<{ requirement: string; evidenceBlockIds: string[]; masterBlockIds?: string[] }>; understated: Array<{ requirement: string; evidenceBlockIds: string[]; masterBlockIds?: string[] }>; missing: Array<{ requirement: string }> }
  proposed_edits: Array<{ blockId: string; originalText: string | null; replacementText: string }>
  validation: {
    accepted_edit_count: number
    rejected_edit_count: number
    accepted_block_ids: string[]
    rejected_edits: Array<{ blockId: string; reason: string }>
    rejected_evidence: TailoringValidationResult['rejectedEvidence']
    rejected_requirements: TailoringValidationResult['rejectedRequirements']
  }
  reorders: {
    accepted_reorder_count: number
    rejected_reorder_count: number
    rejected_reorders: TailoringReorderValidationResult['rejectedReorders']
  }
  merges: {
    accepted_merge_count: number
    rejected_merge_count: number
    rejected_merges: TailoringMergeValidationResult['rejectedMerges']
  }
}

export function tailoringValidationDiagnostic(text: string, slots: TemplateSlot[], masterEvidence?: TailoringMasterEvidence): TailoringValidationDiagnostic {
  const result = templateValidation(text, slots, masterEvidence)
  if (!result) {
    return {
      tailoring_result: 'model_response_unparseable',
      analysis: emptyTailoringAnalysis(),
      proposed_edits: [],
      validation: { accepted_edit_count: 0, rejected_edit_count: 0, accepted_block_ids: [], rejected_edits: [], rejected_evidence: [], rejected_requirements: [] },
      reorders: { accepted_reorder_count: 0, rejected_reorder_count: 0, rejected_reorders: [] },
      merges: { accepted_merge_count: 0, rejected_merge_count: 0, rejected_merges: [] },
    }
  }
  const blocksById = new Map(slots.map((slot) => [slot.blockId, slot]))
  const proposedEdits = result.response.edits.slice(0, 8).map((edit) => ({
    blockId: edit.blockId,
    originalText: blocksById.get(edit.blockId) ? redactDiagnosticText(blocksById.get(edit.blockId)!.text) : null,
    replacementText: redactDiagnosticText(edit.text),
  }))
  const analysis = {
    matched: result.response.analysis.matched.slice(0, 12).map((item) => ({ requirement: redactDiagnosticText(item.requirement), evidenceBlockIds: item.evidenceBlockIds, ...(item.masterBlockIds ? { masterBlockIds: item.masterBlockIds } : {}) })),
    understated: result.response.analysis.understated.slice(0, 12).map((item) => ({ requirement: redactDiagnosticText(item.requirement), evidenceBlockIds: item.evidenceBlockIds, ...(item.masterBlockIds ? { masterBlockIds: item.masterBlockIds } : {}) })),
    missing: result.response.analysis.missing.slice(0, 12).map((item) => ({ requirement: redactDiagnosticText(item.requirement) })),
  }
  const { validation } = result
  return {
    tailoring_result: validation.acceptedEdits.length > 0 || result.mergeValidation.acceptedMerges.length > 0 || result.reorderValidation.acceptedReorders.length > 0
      ? 'accepted_edits'
      : result.response.edits.length === 0 && (result.response.reorders?.length ?? 0) === 0 && (result.response.merges?.length ?? 0) === 0
        ? 'model_proposed_no_edits'
        : 'all_proposed_edits_rejected',
    analysis,
    proposed_edits: proposedEdits,
    validation: {
      accepted_edit_count: validation.acceptedEdits.length,
      rejected_edit_count: validation.rejectedEdits.length,
      accepted_block_ids: validation.acceptedEdits.map((edit) => edit.blockId),
      rejected_edits: validation.rejectedEdits.map((edit) => ({ blockId: edit.blockId, reason: edit.reason })),
      rejected_evidence: validation.rejectedEvidence.map((item) => ({ ...item, requirement: redactDiagnosticText(item.requirement) })),
      rejected_requirements: validation.rejectedRequirements.map((item) => ({ ...item, requirement: redactDiagnosticText(item.requirement) })),
    },
    reorders: {
      accepted_reorder_count: result.reorderValidation.acceptedReorders.length,
      rejected_reorder_count: result.reorderValidation.rejectedReorders.length,
      rejected_reorders: result.reorderValidation.rejectedReorders,
    },
    merges: {
      accepted_merge_count: result.mergeValidation.acceptedMerges.length,
      rejected_merge_count: result.mergeValidation.rejectedMerges.length,
      rejected_merges: result.mergeValidation.rejectedMerges,
    },
  }
}

async function providerText(prompt: string, expectsTemplateEdits: boolean) {
  return await requestGeminiText({ ...tailoringGeminiConfig, prompt, ...(expectsTemplateEdits ? { schema: tailoringResponseSchema } : {}) })
}

async function repairedProviderText(originalPrompt: string) {
  return await requestGeminiText({
    ...tailoringJsonRepairGeminiConfig,
    prompt: buildTailoringJsonRepairPrompt(originalPrompt),
    schema: tailoringResponseSchema,
  })
}

export const inputForGeneration = internalQuery({ args: { ownerId: v.string(), jobId: v.id('jobs') }, handler: async (ctx, args) => {
  const resumes = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', args.ownerId)).order('desc').collect()
  const resume = selectLatestTemplateResume(resumes)
  const master = selectActiveMaster(resumes)
  const latest = (await ctx.db.query('searchRuns').withIndex('by_owner_requested', (q) => q.eq('ownerId', args.ownerId)).order('desc').collect())[0]
  if (!resume?.extractedText || !latest) return null
  const suggestions = await ctx.db.query('jobSuggestions').withIndex('by_search_rank', (q) => q.eq('searchRunId', latest._id)).collect()
  if (!suggestions.some((suggestion) => suggestion.jobId === args.jobId)) return null
  const job = await ctx.db.get(args.jobId)
  const masterStructure = master
    ? await ctx.db.query('masterResumeStructures').withIndex('by_owner_resume', (q) => q.eq('ownerId', args.ownerId).eq('sourceResumeId', master._id)).first()
    : null
  return job ? { resumeText: resume.extractedText, resumeFileName: resume.fileName, title: job.title, companyName: job.companyName, description: job.description, masterStructure: masterStructure?.structure ?? null } : null
} })

export const generate = action({ args: { jobId: v.id('jobs'), templateSlots: v.optional(v.array(v.object({
  blockId: v.string(),
  index: v.number(),
  text: v.string(),
  editable: v.boolean(),
  kind: v.optional(v.union(v.literal('heading'), v.literal('experience_header'), v.literal('experience_bullet'), v.literal('skills'), v.literal('summary'), v.literal('other'))),
  experienceId: v.optional(v.string()),
  bulletIndex: v.optional(v.number()),
}))) }, handler: async (ctx, args): Promise<TailoredResult> => {
  const ownerId = await requireOwner(ctx, 'Please sign in before tailoring a resume.')
  const input = await ctx.runQuery(internal.tailoredResumes.inputForGeneration, { ownerId, jobId: args.jobId }) as Input | null
  if (!input) throw new Error('Please re-upload your resume before tailoring it.')
  if (args.templateSlots && !areResumeBlocksConsistent(args.templateSlots)) throw new Error('The resume blocks are invalid. Please refresh and try again.')
  const reservation = await ctx.runMutation(internal.credits.reserve, { ownerId, referenceId: `tailored:${String(args.jobId)}:${Date.now()}` })
  const fallback = (): TailoredResult => ({ fileName: tailoredFileName(input.resumeFileName, input.title, input.companyName), resumeText: reorderResumeForJob(input.resumeText, input.description), mode: 'reordered' })
  const protectedTemplate = (): TailoredResult => ({ fileName: tailoredFileName(input.resumeFileName, input.title, input.companyName), resumeText: input.resumeText, mode: 'layout_protected' })
  const templateFallback = (): TailoredResult => {
    const replacements = args.templateSlots ? reorderTemplateSlots(args.templateSlots, input.description) : []
    return replacements.some((replacement, index) => replacement !== args.templateSlots?.[index].text)
      ? { fileName: tailoredFileName(input.resumeFileName, input.title, input.companyName), resumeText: replacements.join('\n'), replacements, mode: 'reordered' }
      : protectedTemplate()
  }
  const requestStartedAt = Date.now()
  try {
    const masterEvidence = masterEvidenceForTailoring(args.templateSlots, input.masterStructure)
    const prompt = buildTailoringUserPrompt({ jobTitle: input.title, companyName: input.companyName, jobDescription: input.description, resumeText: input.resumeText, editableSlots: templateSlotsForGemini(args.templateSlots), masterEvidence })
    const initialResponse = args.templateSlots
      ? await requestGeminiResponse({ ...tailoringGeminiConfig, prompt, schema: tailoringResponseSchema })
      : { text: await providerText(prompt, false), status: 'completed' }
    const malformedInitialResponse = Boolean(args.templateSlots)
      && (initialResponse.status === 'incomplete' || requiresTailoringJsonRepair(initialResponse.text))
    const text = (malformedInitialResponse
      ? await repairedProviderText(prompt)
      : initialResponse.text).trim()
    if (args.templateSlots) {
      const validationDiagnostic = tailoringValidationDiagnostic(text, args.templateSlots, masterEvidence)
      console.info('Resume tailoring validation diagnostic.', { durationMs: Date.now() - requestStartedAt, repairedMalformedJson: malformedInitialResponse, ...validationDiagnostic })
      const validated = templateValidation(text, args.templateSlots, masterEvidence)
      const merges = validated?.mergeValidation.acceptedMerges ?? []
      const replacements = validated ? replacementsForValidation(validated.validation, args.templateSlots, merges) : null
      const reorders = validated?.reorderValidation.acceptedReorders ?? []
      if (replacements || merges.length > 0 || reorders.length > 0) {
        const finalReplacements = replacements ?? args.templateSlots.map((slot) => slot.text)
        return { fileName: tailoredFileName(input.resumeFileName, input.title, input.companyName), resumeText: finalReplacements.join('\n'), replacements: finalReplacements, merges, reorders, mode: 'ai', reservationId: String(reservation.reservationId) }
      }
      console.warn('Gemini tailoring response did not contain safe template-slot replacements.', { durationMs: Date.now() - requestStartedAt, repairedMalformedJson: malformedInitialResponse, ...templateReplacementDiagnostics(text, args.templateSlots) })
      await ctx.runMutation(internal.credits.release, { reservationId: reservation.reservationId })
      return templateFallback()
    }
    if (text.length < 80 || text.replace(/\s+/g, ' ') === input.resumeText.replace(/\s+/g, ' ')) {
      await ctx.runMutation(internal.credits.release, { reservationId: reservation.reservationId })
      return fallback()
    }
    return { fileName: tailoredFileName(input.resumeFileName, input.title, input.companyName), resumeText: text, mode: 'ai' as const, reservationId: String(reservation.reservationId) }
  } catch (error) {
    console.warn('Gemini tailoring request failed.', { durationMs: Date.now() - requestStartedAt, message: error instanceof Error ? error.message : String(error) })
    await ctx.runMutation(internal.credits.release, { reservationId: reservation.reservationId })
    return args.templateSlots ? templateFallback() : fallback()
  }
} })

export const complete = mutation({
  args: { reservationId: v.id('creditLedger') },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before completing resume tailoring.')
    const reservation = await ctx.db.get(args.reservationId)
    if (!reservation || reservation.ownerId !== ownerId || reservation.kind !== 'tailored_resume') throw new Error('This tailoring request is no longer available.')
    if (reservation.status !== 'reserved') return reservation.status === 'completed'
    if (reservation.expiresAt !== undefined && reservation.expiresAt <= Date.now()) {
      await ctx.db.patch(reservation._id, { status: 'released' })
      throw new Error('This tailoring request expired. Please try again.')
    }
    await ctx.db.patch(reservation._id, { status: 'completed' })
    return true
  },
})
