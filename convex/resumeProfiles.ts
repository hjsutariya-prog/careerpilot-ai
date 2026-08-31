import { internalAction, internalMutation, internalQuery, query } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { requireOwner } from './owner'
import type { Id } from './_generated/dataModel'
import { requestGeminiText } from './gemini'

export const PROFILE_SCHEMA_VERSION = 1

export type ResumeProfile = {
  skills: { name: string; evidenceLineNumbers: number[] }[]
  roles: { title: string; years: number; evidenceLineNumbers: number[] }[]
  achievements: { text: string; evidenceLineNumbers: number[] }[]
  education: { text: string; evidenceLineNumbers: number[] }[]
  totalYears: number
}

export function normaliseResumeLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

async function sha256Text(text: string) {
  const bytes = new TextEncoder().encode(text.toLowerCase().replace(/\s+/g, ' ').trim())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export function isReusableProfile(profile: { sourceHash: string; schemaVersion: number } | null | undefined, sourceHash: string, schemaVersion = PROFILE_SCHEMA_VERSION) {
  return profile?.sourceHash === sourceHash && profile.schemaVersion === schemaVersion
}

export function planProfileGeneration(input: { existing: 'ready' | 'queued' | 'generating' | 'failed' | null; sameHash: boolean; sameVersion: boolean }) {
  return input.existing && input.sameHash && input.sameVersion && input.existing !== 'failed' ? { action: 'reuse' as const } : { action: 'generate' as const }
}

function uniqueStrings(values: unknown, max: number) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, max)
}

function lineNumbers(value: unknown, lineCount: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((number): number is number => Number.isInteger(number) && number >= 1 && number <= lineCount))].slice(0, 6)
}

export function parseResumeProfile(value: unknown, lineCount: number): ResumeProfile | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const skills = Array.isArray(candidate.skills) ? candidate.skills.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const name = uniqueStrings([row.name], 1)[0]
    const evidenceLineNumbers = lineNumbers(row.evidenceLineNumbers, lineCount)
    return name && evidenceLineNumbers.length ? [{ name, evidenceLineNumbers }] : []
  }).slice(0, 40) : []
  const roles = Array.isArray(candidate.roles) ? candidate.roles.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const title = uniqueStrings([row.title], 1)[0]
    const years = typeof row.years === 'number' && Number.isFinite(row.years) && row.years >= 0 && row.years <= 60 ? row.years : 0
    const evidenceLineNumbers = lineNumbers(row.evidenceLineNumbers, lineCount)
    return title && evidenceLineNumbers.length ? [{ title, years, evidenceLineNumbers }] : []
  }).slice(0, 20) : []
  const toEvidenceText = (value: unknown, limit: number) => Array.isArray(value) ? value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const text = uniqueStrings([row.text], 1)[0]
    const evidenceLineNumbers = lineNumbers(row.evidenceLineNumbers, lineCount)
    return text && evidenceLineNumbers.length ? [{ text, evidenceLineNumbers }] : []
  }).slice(0, limit) : []
  const achievements = toEvidenceText(candidate.achievements, 20)
  const education = toEvidenceText(candidate.education, 10)
  const totalYears = typeof candidate.totalYears === 'number' && Number.isFinite(candidate.totalYears) && candidate.totalYears >= 0 && candidate.totalYears <= 60 ? candidate.totalYears : 0
  return skills.length || roles.length ? { skills, roles, achievements, education, totalYears } : null
}

function profilePrompt(lines: string[]) {
  return `Extract a factual job-search profile from this resume. Never infer a skill, date, achievement, employer, title, qualification, or years of experience that is not explicitly written. Return JSON only with this exact shape: {"skills":[{"name":"string","evidenceLineNumbers":[1]}],"roles":[{"title":"string","years":0,"evidenceLineNumbers":[1]}],"achievements":[{"text":"string","evidenceLineNumbers":[1]}],"education":[{"text":"string","evidenceLineNumbers":[1]}],"totalYears":0}. Every item must cite one or more line numbers from this numbered resume.\n\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`
}

function jsonFromText(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const json = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed
  try { return JSON.parse(json) } catch { return null }
}

export const resumeForProfile = internalQuery({
  args: { resumeId: v.id('resumes') },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId)
    return resume?.extractedText ? resume : null
  },
})

export const existingForHash = internalQuery({
  args: { ownerId: v.string(), sourceHash: v.string() },
  handler: async (ctx, args) => await ctx.db.query('resumeProfiles').withIndex('by_owner_hash_version', (q) => q.eq('ownerId', args.ownerId).eq('sourceHash', args.sourceHash).eq('schemaVersion', PROFILE_SCHEMA_VERSION)).first(),
})

export const createForResume = internalMutation({
  args: { resumeId: v.id('resumes') },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId)
    if (!resume?.extractedText || !resume.contentHash) return null
    const existing = await ctx.db.query('resumeProfiles').withIndex('by_owner_hash_version', (q) => q.eq('ownerId', resume.ownerId).eq('sourceHash', resume.contentHash!).eq('schemaVersion', PROFILE_SCHEMA_VERSION)).first()
    if (existing && existing.status !== 'failed') return existing._id
    if (existing) {
      await ctx.db.patch(existing._id, { status: 'queued', failureMessage: undefined, updatedAt: Date.now(), sourceResumeId: args.resumeId })
      return existing._id
    }
    return await ctx.db.insert('resumeProfiles', { ownerId: resume.ownerId, sourceResumeId: args.resumeId, sourceHash: resume.contentHash, schemaVersion: PROFILE_SCHEMA_VERSION, status: 'queued', createdAt: Date.now(), updatedAt: Date.now() })
  },
})

export const setContentHash = internalMutation({
  args: { resumeId: v.id('resumes'), contentHash: v.string() },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId)
    if (!resume) return null
    if (!resume.contentHash) await ctx.db.patch(args.resumeId, { contentHash: args.contentHash })
    return resume.contentHash ?? args.contentHash
  },
})

export const markGenerating = internalMutation({
  args: { profileId: v.id('resumeProfiles') },
  handler: async (ctx, args) => await ctx.db.patch(args.profileId, { status: 'generating', updatedAt: Date.now() }),
})

export const finish = internalMutation({
  args: { profileId: v.id('resumeProfiles'), profile: v.optional(v.any()), failureMessage: v.optional(v.string()) },
  handler: async (ctx, args) => await ctx.db.patch(args.profileId, args.profile ? { status: 'ready', profile: args.profile, failureMessage: undefined, updatedAt: Date.now() } : { status: 'failed', failureMessage: args.failureMessage ?? 'We could not analyse this resume. Please upload it again.', updatedAt: Date.now() }),
})

export const ensureForResume = internalAction({
  args: { resumeId: v.id('resumes') },
  handler: async (ctx, args): Promise<{ status: 'skipped' | 'reused' | 'ready' | 'failed'; profileId?: Id<'resumeProfiles'> }> => {
    const resume = await ctx.runQuery(internal.resumeProfiles.resumeForProfile, args) as { ownerId: string; contentHash?: string; extractedText: string } | null
    if (!resume) return { status: 'skipped' as const }
    const sourceHash = resume.contentHash ?? await sha256Text(resume.extractedText)
    if (!resume.contentHash) await ctx.runMutation(internal.resumeProfiles.setContentHash, { resumeId: args.resumeId, contentHash: sourceHash })
    const existing = await ctx.runQuery(internal.resumeProfiles.existingForHash, { ownerId: resume.ownerId, sourceHash }) as { _id: Id<'resumeProfiles'>; status: 'queued' | 'generating' | 'ready' | 'failed' } | null
    if (existing && existing.status !== 'failed') return { status: 'reused' as const, profileId: existing._id }
    const profileId = await ctx.runMutation(internal.resumeProfiles.createForResume, args) as Id<'resumeProfiles'> | null
    if (!profileId) return { status: 'skipped' as const }
    await ctx.runMutation(internal.resumeProfiles.markGenerating, { profileId })
    try {
      const lines = normaliseResumeLines(resume.extractedText)
      const text = await requestGeminiText({ model: 'gemini-3.6-flash', prompt: profilePrompt(lines), thinkingLevel: 'medium', maxOutputTokens: 2800, timeoutMs: 30_000 })
      const profile = parseResumeProfile(jsonFromText(text), lines.length)
      if (!profile) throw new Error('unsafe profile')
      await ctx.runMutation(internal.resumeProfiles.finish, { profileId, profile })
      return { status: 'ready' as const, profileId }
    } catch {
      await ctx.runMutation(internal.resumeProfiles.finish, { profileId, failureMessage: 'We could not analyse this resume. Please try again after re-uploading it.' })
      return { status: 'failed' as const }
    }
  },
})

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before viewing your resume analysis.')
    const resume = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).order('desc').first()
    if (!resume?.contentHash) return null
    return await ctx.db.query('resumeProfiles').withIndex('by_owner_hash_version', (q) => q.eq('ownerId', ownerId).eq('sourceHash', resume.contentHash!).eq('schemaVersion', PROFILE_SCHEMA_VERSION)).first()
  },
})
