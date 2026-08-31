import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'
import { requireOwner } from './owner'
import { selectActiveMaster } from './resumeRecords'

export const MASTER_RESUME_STRUCTURE_SCHEMA_VERSION = 1

export type MasterExperienceBlockKind = 'experience_header' | 'experience_bullet' | 'other'

export type MasterExperienceBlock = {
  blockId: string
  text: string
  kind: MasterExperienceBlockKind
}

export type MasterExperience = {
  experienceId: string
  order: number
  headerText: string
  company?: string
  title?: string
  dateText?: string
  blocks: MasterExperienceBlock[]
}

export type MasterResumeStructure = {
  resumeId: Id<'resumes'>
  experiences: MasterExperience[]
  ungroupedBlocks: MasterExperienceBlock[]
}

const dateRangePattern = /\b(?:19|20)\d{2}\s*(?:[-–—]|to)\s*(?:(?:19|20)\d{2}|present|current)\b/i
const bulletPattern = /^\s*(?:[•●▪◦‣⁃*-]|\d+[.)])\s+/

function isSectionHeading(text: string) {
  return /^[A-Z][A-Z &/]{2,}$/.test(text.trim())
}

function isExperienceSectionHeading(text: string) {
  return /^(?:PROFESSIONAL |WORK )?EXPERIENCE$/i.test(text.trim())
}

function isExperienceHeader(text: string) {
  const value = text.trim()
  const hasDateRange = dateRangePattern.test(value)
  const hasRoleCompanySeparator = /[|•·]|\bat\b|\s[-–—]\s/i.test(value)
  return hasDateRange && hasRoleCompanySeparator
}

function isBullet(text: string) {
  return bulletPattern.test(text)
}

function headerMetadata(headerText: string) {
  const parts = headerText.split('|').map((part) => part.trim()).filter(Boolean)
  if (parts.length !== 3 || !dateRangePattern.test(parts[2])) return {}
  return { title: parts[0], company: parts[1], dateText: parts[2] }
}

export function masterResumeLines(text: string) {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0)
}

export function parseMasterResumeStructure(input: { resumeId: Id<'resumes'>; text: string }): MasterResumeStructure {
  const experiences: MasterExperience[] = []
  const ungroupedBlocks: MasterExperienceBlock[] = []
  let inExperienceSection = false
  let currentExperience: MasterExperience | null = null
  let ungroupedIndex = 0

  const addUngrouped = (text: string, kind: MasterExperienceBlockKind = 'other') => {
    ungroupedBlocks.push({ blockId: `master_ungrouped_block_${ungroupedIndex++}`, text, kind })
  }

  for (const line of masterResumeLines(input.text)) {
    const trimmed = line.trim()
    if (isSectionHeading(trimmed)) {
      inExperienceSection = isExperienceSectionHeading(trimmed)
      currentExperience = null
      addUngrouped(line)
      continue
    }

    if (inExperienceSection && isExperienceHeader(trimmed)) {
      const order = experiences.length
      currentExperience = { experienceId: `master_experience_${order}`, order, headerText: line, ...headerMetadata(trimmed), blocks: [] }
      experiences.push(currentExperience)
      continue
    }

    if (inExperienceSection && currentExperience && isBullet(line)) {
      const blockIndex = currentExperience.blocks.length
      currentExperience.blocks.push({ blockId: `${currentExperience.experienceId}_block_${blockIndex}`, text: line, kind: 'experience_bullet' })
      continue
    }

    addUngrouped(line)
  }

  return { resumeId: input.resumeId, experiences, ungroupedBlocks }
}

export function structureForActiveMaster<T extends { ownerId: string; sourceResumeId: string }>(structures: T[], ownerId: string, activeMasterResumeId: string | null | undefined) {
  if (!activeMasterResumeId) return null
  return structures.find((structure) => structure.ownerId === ownerId && structure.sourceResumeId === activeMasterResumeId) ?? null
}

export const inputForMaster = internalQuery({
  args: { resumeId: v.id('resumes') },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId)
    if (!resume?.extractedText || !resume.contentHash || resume.purpose !== 'master' || !resume.isActiveMaster) return null
    return { ownerId: resume.ownerId, resumeId: resume._id, sourceHash: resume.contentHash, text: resume.extractedText }
  },
})

export const upsertForActiveMaster = internalMutation({
  args: { resumeId: v.id('resumes'), ownerId: v.string(), sourceHash: v.string(), structure: v.object({ resumeId: v.id('resumes'), experiences: v.array(v.object({ experienceId: v.string(), order: v.number(), headerText: v.string(), company: v.optional(v.string()), title: v.optional(v.string()), dateText: v.optional(v.string()), blocks: v.array(v.object({ blockId: v.string(), text: v.string(), kind: v.union(v.literal('experience_header'), v.literal('experience_bullet'), v.literal('other')) })) })), ungroupedBlocks: v.array(v.object({ blockId: v.string(), text: v.string(), kind: v.union(v.literal('experience_header'), v.literal('experience_bullet'), v.literal('other')) })) }) },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId)
    if (!resume || resume.ownerId !== args.ownerId || resume.purpose !== 'master' || !resume.isActiveMaster || resume.contentHash !== args.sourceHash) return null
    const existing = await ctx.db.query('masterResumeStructures').withIndex('by_owner_hash_version', (q) => q.eq('ownerId', args.ownerId).eq('sourceHash', args.sourceHash).eq('schemaVersion', MASTER_RESUME_STRUCTURE_SCHEMA_VERSION)).first()
    if (existing) {
      await ctx.db.patch(existing._id, { sourceResumeId: args.resumeId, structure: args.structure, updatedAt: Date.now() })
      return existing._id
    }
    return await ctx.db.insert('masterResumeStructures', { ownerId: args.ownerId, sourceResumeId: args.resumeId, sourceHash: args.sourceHash, schemaVersion: MASTER_RESUME_STRUCTURE_SCHEMA_VERSION, structure: args.structure, createdAt: Date.now(), updatedAt: Date.now() })
  },
})

export const reuseForActiveMaster = internalMutation({
  args: { resumeId: v.id('resumes'), ownerId: v.string(), sourceHash: v.string() },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId)
    if (!resume || resume.ownerId !== args.ownerId || resume.purpose !== 'master' || !resume.isActiveMaster || resume.contentHash !== args.sourceHash) return null
    const existing = await ctx.db.query('masterResumeStructures').withIndex('by_owner_hash_version', (q) => q.eq('ownerId', args.ownerId).eq('sourceHash', args.sourceHash).eq('schemaVersion', MASTER_RESUME_STRUCTURE_SCHEMA_VERSION)).first()
    if (!existing) return null
    if (existing.sourceResumeId !== args.resumeId || existing.structure.resumeId !== args.resumeId) {
      await ctx.db.patch(existing._id, { sourceResumeId: args.resumeId, structure: { ...existing.structure, resumeId: args.resumeId }, updatedAt: Date.now() })
    }
    return existing._id
  },
})

export const ensureForMaster = internalAction({
  args: { resumeId: v.id('resumes') },
  handler: async (ctx, args): Promise<Id<'masterResumeStructures'> | null> => {
    const input = await ctx.runQuery(internal.masterResumeStructure.inputForMaster, args) as { ownerId: string; resumeId: Id<'resumes'>; sourceHash: string; text: string } | null
    if (!input) return null
    const reused = await ctx.runMutation(internal.masterResumeStructure.reuseForActiveMaster, { resumeId: input.resumeId, ownerId: input.ownerId, sourceHash: input.sourceHash })
    if (reused) return reused
    const structure = parseMasterResumeStructure({ resumeId: input.resumeId, text: input.text })
    return await ctx.runMutation(internal.masterResumeStructure.upsertForActiveMaster, { ...input, structure })
  },
})

export const activeMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before viewing Master Resume structure.')
    const resumes = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).order('desc').collect()
    const master = selectActiveMaster(resumes)
    if (!master) return null
    const record = await ctx.db.query('masterResumeStructures').withIndex('by_owner_resume', (q) => q.eq('ownerId', ownerId).eq('sourceResumeId', master._id)).first()
    return record?.structure ?? null
  },
})

export const rebuildMine = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before rebuilding Master Resume structure.')
    const resumes = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).order('desc').collect()
    const master = selectActiveMaster(resumes)
    if (!master) return false
    await ctx.scheduler.runAfter(0, internal.masterResumeStructure.ensureForMaster, { resumeId: master._id })
    return true
  },
})
