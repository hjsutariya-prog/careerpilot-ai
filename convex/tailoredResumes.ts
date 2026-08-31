import { action, internalQuery, mutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { requireOwner } from './owner'
import { requestGeminiResponse, requestGeminiText } from './gemini'
import { tailoringGeminiConfig, tailoringJsonRepairGeminiConfig } from './ai/tailoringGeminiConfig'
import { buildTailoringUserPrompt } from './ai/tailoringPrompt'
import { buildTailoringJsonRepairPrompt, requiresTailoringJsonRepair } from './ai/tailoringRepair'
import { emptyTailoringAnalysis, parseLegacyIndexedTailoringResponse, parseLegacyTailoringReplacements, parseTailoringResponse, tailoringResponseSchema, type ParsedTailoringResponse } from './ai/tailoringSchema'
import { actionTense, isSafeExperienceRewrite, isSafeSkillReorder, preservesActionTense, validateTailoringResponse } from './ai/tailoringValidation'
import { areResumeBlocksConsistent, type ResumeBlock } from './ai/resumeBlocks'

type Input = { resumeText: string; resumeFileName: string; title: string; companyName: string; description: string }
type TemplateSlot = ResumeBlock
type TailoredResult = { fileName: string; resumeText: string; mode: 'ai' | 'reordered' | 'layout_protected'; replacements?: string[]; reservationId?: string }

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

export function templateReplacements(text: string, slots: TemplateSlot[]) {
  const response = parseTailoringResponse(text)
  if (response) {
    return replacementsForResponse(response, slots)
  }
  const legacyIndexedResponse = parseLegacyIndexedTailoringResponse(text)
  if (legacyIndexedResponse) {
    const translatedResponse = legacyResponse(legacyIndexedResponse.edits.map((edit) => ({ blockId: slots[edit.index]?.blockId ?? `legacy_index_${edit.index}`, text: edit.text })))
    return replacementsForResponse(translatedResponse, slots)
  }
  const values = parseLegacyTailoringReplacements(text)
  if (!values || values.length !== slots.length) return null
  const responseFromReplacements = legacyResponse(values.flatMap((value, index) => typeof value === 'string' ? [{ blockId: slots[index].blockId, text: value }] : []))
  return replacementsForResponse(responseFromReplacements, slots, values.length)
}

function replacementsForResponse(response: ParsedTailoringResponse, slots: TemplateSlot[], maxEdits?: number) {
  const validation = validateTailoringResponse({ response, editableSlots: slots, maxEdits, enforceUnderstatedEditLinks: response.analysisProvided })
  const blocksById = new Map(slots.map((slot) => [slot.blockId, slot]))
  const replacements = slots.map((slot) => slot.text)
  for (const edit of validation.acceptedEdits) {
    const block = blocksById.get(edit.blockId)
    if (block) replacements[block.index] = edit.text
  }
  return replacements.some((replacement, index) => replacement !== slots[index].text) ? replacements : null
}

export function templateReplacementDiagnostics(text: string, slots: TemplateSlot[]) {
  try {
    const fenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const candidate = JSON.parse(fenced.match(/\{[\s\S]*\}/)?.[0] ?? fenced)
    if (!Array.isArray(candidate?.edits)) return { shape: Array.isArray(candidate) || Array.isArray(candidate?.replacements) ? 'replacement-array' : 'unexpected', proposed: 0, editable: 0, safe: 0 }
    const response = parseTailoringResponse(text) ?? (() => {
      const legacy = parseLegacyIndexedTailoringResponse(text)
      return legacy ? legacyResponse(legacy.edits.map((edit) => ({ blockId: slots[edit.index]?.blockId ?? `legacy_index_${edit.index}`, text: edit.text }))) : null
    })()
    if (!response) return { shape: 'invalid-edits', proposed: 0, editable: 0, safe: 0 }
    return { shape: 'edits', ...validateTailoringResponse({ response, editableSlots: slots, enforceUnderstatedEditLinks: response.analysisProvided }).diagnostics }
  } catch (error) {
    return { shape: 'invalid-json', textLength: text.length, parserError: error instanceof Error ? error.message : 'unknown', proposed: 0, editable: 0, safe: 0 }
  }
}

async function providerText(prompt: string, expectsTemplateEdits: boolean) {
  return await requestGeminiText({ ...tailoringGeminiConfig, prompt, ...(expectsTemplateEdits ? { schema: tailoringResponseSchema } : {}) })
}

async function repairedProviderText(malformedOutput: string) {
  return await requestGeminiText({
    ...tailoringJsonRepairGeminiConfig,
    prompt: buildTailoringJsonRepairPrompt(malformedOutput),
    schema: tailoringResponseSchema,
  })
}

export const inputForGeneration = internalQuery({ args: { ownerId: v.string(), jobId: v.id('jobs') }, handler: async (ctx, args) => {
  const resume = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', args.ownerId)).order('desc').first()
  const latest = (await ctx.db.query('searchRuns').withIndex('by_owner_requested', (q) => q.eq('ownerId', args.ownerId)).order('desc').collect())[0]
  if (!resume?.extractedText || !latest) return null
  const suggestions = await ctx.db.query('jobSuggestions').withIndex('by_search_rank', (q) => q.eq('searchRunId', latest._id)).collect()
  if (!suggestions.some((suggestion) => suggestion.jobId === args.jobId)) return null
  const job = await ctx.db.get(args.jobId)
  return job ? { resumeText: resume.extractedText, resumeFileName: resume.fileName, title: job.title, companyName: job.companyName, description: job.description } : null
} })

export const generate = action({ args: { jobId: v.id('jobs'), templateSlots: v.optional(v.array(v.object({ blockId: v.string(), index: v.number(), text: v.string(), editable: v.boolean() }))) }, handler: async (ctx, args): Promise<TailoredResult> => {
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
    const prompt = buildTailoringUserPrompt({ jobTitle: input.title, companyName: input.companyName, jobDescription: input.description, resumeText: input.resumeText, editableSlots: args.templateSlots })
    const initialResponse = args.templateSlots
      ? await requestGeminiResponse({ ...tailoringGeminiConfig, prompt, schema: tailoringResponseSchema })
      : { text: await providerText(prompt, false), status: 'completed' }
    const malformedInitialResponse = Boolean(args.templateSlots)
      && (initialResponse.status === 'incomplete' || requiresTailoringJsonRepair(initialResponse.text))
    const text = (malformedInitialResponse
      ? await repairedProviderText(initialResponse.text)
      : initialResponse.text).trim()
    if (args.templateSlots) {
      const replacements = templateReplacements(text, args.templateSlots)
      if (replacements) return { fileName: tailoredFileName(input.resumeFileName, input.title, input.companyName), resumeText: replacements.join('\n'), replacements, mode: 'ai', reservationId: String(reservation.reservationId) }
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
