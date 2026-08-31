import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { PROFILE_SCHEMA_VERSION, type ResumeProfile } from './resumeProfiles'
import { requestGeminiText } from './gemini'

export const SCORE_VERSION = 1

export type FitLevel = 'none' | 'partial' | 'strong'

export type JobEvidenceMap = {
  requiredSupported: number
  requiredTotal: number
  preferredSupported: number
  preferredTotal: number
  roleFit: FitLevel
  responsibilityFit: FitLevel
  workArrangementFits: boolean
  isIndiaRole: boolean
  matchedEvidence: { requirement: string; resumeLine: number }[]
  gaps: string[]
}

function fitPoints(fit: FitLevel, maximum: number) {
  if (fit === 'strong') return maximum
  if (fit === 'partial') return maximum / 2
  return 0
}

function coverage(supported: number, total: number) {
  if (total === 0) return 0
  return Math.min(1, Math.max(0, supported / total))
}

export function scoreResumeMatch(input: Omit<JobEvidenceMap, 'matchedEvidence' | 'gaps'>) {
  const required = coverage(input.requiredSupported, input.requiredTotal)
  const preferred = coverage(input.preferredSupported, input.preferredTotal)
  const skills = Math.round(40 * (required * 0.7 + preferred * 0.3))
  const role = fitPoints(input.roleFit, 30)
  const responsibilities = fitPoints(input.responsibilityFit, 20)
  const workArrangement = input.workArrangementFits ? 8 : 0
  const location = input.isIndiaRole ? 2 : 0
  return {
    score: skills + role + responsibilities + workArrangement + location,
    skills,
    role,
    responsibilities,
    workArrangement,
    location,
  }
}

export function matchCacheKey(input: { sourceHash: string; jobId: string; jobLastUpdatedAt: number; scoreVersion: number }) {
  return `${input.sourceHash}:${input.jobId}:${input.jobLastUpdatedAt}:${input.scoreVersion}`
}

type MatchJob = { _id: Id<'jobs'>; title: string; companyName: string; locationLabel: string; skills: string[]; description: string; lastUpdatedAt: number }

type BatchMatchRow = {
  jobId: string
  required: { supported: string[]; missing: string[] }
  preferred: { supported: string[]; missing: string[] }
  roleFit: FitLevel
  responsibilityFit: FitLevel
  evidence: { requirement: string; resumeLine: number }[]
}

function compactStrings(value: unknown, maximum: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, maximum)
}

function safeFitLevel(value: unknown): FitLevel {
  return value === 'strong' || value === 'partial' || value === 'none' ? value : 'none'
}

function parseBatchRows(value: unknown, expectedJobIds: Set<string>, lineCount: number): BatchMatchRow[] | null {
  const matches = (value as { matches?: unknown })?.matches
  if (!Array.isArray(matches) || matches.length !== expectedJobIds.size) return null
  const seen = new Set<string>()
  const rows: BatchMatchRow[] = []
  for (const item of matches) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const jobId = typeof row.jobId === 'string' ? row.jobId : ''
    if (!expectedJobIds.has(jobId) || seen.has(jobId)) return null
    const required = row.required as Record<string, unknown> | undefined
    const preferred = row.preferred as Record<string, unknown> | undefined
    if (!required || !preferred) return null
    const evidence = Array.isArray(row.evidence) ? row.evidence.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const evidenceRow = entry as Record<string, unknown>
      const requirement = typeof evidenceRow.requirement === 'string' ? evidenceRow.requirement.replace(/\s+/g, ' ').trim() : ''
      const resumeLine = evidenceRow.resumeLine
      return requirement && Number.isInteger(resumeLine) && (resumeLine as number) >= 1 && (resumeLine as number) <= lineCount ? [{ requirement, resumeLine: resumeLine as number }] : []
    }).slice(0, 12) : []
    rows.push({
      jobId,
      required: { supported: compactStrings(required.supported, 20), missing: compactStrings(required.missing, 20) },
      preferred: { supported: compactStrings(preferred.supported, 20), missing: compactStrings(preferred.missing, 20) },
      roleFit: safeFitLevel(row.roleFit),
      responsibilityFit: safeFitLevel(row.responsibilityFit),
      evidence,
    })
    seen.add(jobId)
  }
  return rows
}

function jsonFromText(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const json = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed
  try { return JSON.parse(json) } catch { return null }
}

function batchPrompt(profile: ResumeProfile, lines: string[], jobs: MatchJob[]) {
  return `Match one factual resume profile against every job below. Return JSON only: {"matches":[{"jobId":"job id","required":{"supported":["requirement"],"missing":["requirement"]},"preferred":{"supported":["requirement"],"missing":["requirement"]},"roleFit":"none|partial|strong","responsibilityFit":"none|partial|strong","evidence":[{"requirement":"requirement","resumeLine":1}]}]}. A supported requirement must have direct evidence in the numbered resume. Do not infer unlisted skills, achievements, dates, employers, qualifications, or years. A requirement can be in only one supported/missing list. Include exactly one match for each job.\n\nPROFILE:\n${JSON.stringify(profile)}\n\nNUMBERED RESUME:\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}\n\nJOBS:\n${JSON.stringify(jobs.map((job) => ({ jobId: String(job._id), title: job.title, companyName: job.companyName, locationLabel: job.locationLabel, listedSkills: job.skills, description: job.description.slice(0, 9000) })) )}`
}

function worksForPreference(locationLabel: string, workPreferences: string[]) {
  if (workPreferences.length === 0) return true
  const isRemote = /\bremote\b/i.test(locationLabel)
  return isRemote ? workPreferences.includes('Remote') : workPreferences.some((preference) => preference === 'Hybrid' || preference === 'On-site')
}

export const inputForSearchRun = internalQuery({
  args: { searchRunId: v.id('searchRuns') },
  handler: async (ctx, args) => {
    const searchRun = await ctx.db.get(args.searchRunId)
    if (!searchRun) return null
    const resume = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', searchRun.ownerId)).order('desc').first()
    if (!resume?.contentHash || !resume.extractedText) return { state: 'missing_resume' as const }
    const profile = await ctx.db.query('resumeProfiles').withIndex('by_owner_hash_version', (q) => q.eq('ownerId', searchRun.ownerId).eq('sourceHash', resume.contentHash!).eq('schemaVersion', PROFILE_SCHEMA_VERSION)).first()
    if (!profile || profile.status === 'queued' || profile.status === 'generating') return { state: 'profile_pending' as const }
    if (profile.status !== 'ready' || !profile.profile) return { state: 'profile_failed' as const }
    const preferences = await ctx.db.query('preferences').withIndex('by_owner', (q) => q.eq('ownerId', searchRun.ownerId)).first()
    const suggestions = await ctx.db.query('jobSuggestions').withIndex('by_search_rank', (q) => q.eq('searchRunId', args.searchRunId)).collect()
    const jobs = (await Promise.all(suggestions.map((suggestion) => ctx.db.get(suggestion.jobId)))).filter((job): job is NonNullable<typeof job> => Boolean(job))
    const cached = await Promise.all(jobs.map(async (job) => await ctx.db.query('resumeJobMatches').withIndex('by_owner_hash_job', (q) => q.eq('ownerId', searchRun.ownerId).eq('sourceHash', resume.contentHash!).eq('jobId', job._id)).first()))
    return { state: 'ready' as const, ownerId: searchRun.ownerId, sourceHash: resume.contentHash, resumeText: resume.extractedText, profile: profile.profile as ResumeProfile, jobs, cached: cached.filter(Boolean), workPreferences: preferences?.workPreferences ?? (preferences?.workPreference ? [preferences.workPreference] : []) }
  },
})

export const saveMatches = internalMutation({
  args: {
    searchRunId: v.id('searchRuns'),
    sourceHash: v.string(),
    rows: v.array(v.object({ jobId: v.id('jobs'), jobLastUpdatedAt: v.number(), score: v.number(), skillsScore: v.number(), roleScore: v.number(), responsibilitiesScore: v.number(), workArrangementScore: v.number(), locationScore: v.number(), evidence: v.array(v.object({ requirement: v.string(), resumeLine: v.number() })), gaps: v.array(v.string()) })),
  },
  handler: async (ctx, args) => {
    const searchRun = await ctx.db.get(args.searchRunId)
    if (!searchRun) return
    for (const row of args.rows) {
      const existing = await ctx.db.query('resumeJobMatches').withIndex('by_owner_hash_job', (q) => q.eq('ownerId', searchRun.ownerId).eq('sourceHash', args.sourceHash).eq('jobId', row.jobId)).first()
      const record = { ownerId: searchRun.ownerId, sourceHash: args.sourceHash, jobId: row.jobId, jobLastUpdatedAt: row.jobLastUpdatedAt, scoreVersion: SCORE_VERSION, score: row.score, skillsScore: row.skillsScore, roleScore: row.roleScore, responsibilitiesScore: row.responsibilitiesScore, workArrangementScore: row.workArrangementScore, locationScore: row.locationScore, evidence: row.evidence, gaps: row.gaps, createdAt: Date.now() }
      if (existing) await ctx.db.replace(existing._id, record)
      else await ctx.db.insert('resumeJobMatches', record)
      const suggestion = await ctx.db.query('jobSuggestions').withIndex('by_search_job', (q) => q.eq('searchRunId', args.searchRunId).eq('jobId', row.jobId)).unique()
      if (suggestion) await ctx.db.patch(suggestion._id, { matchScore: row.score, matchExplanation: row.evidence.length ? `Resume evidence: ${row.evidence.slice(0, 2).map((item) => item.requirement).join(', ')}` : 'Resume evidence needs review', matchSource: 'resume', matchGaps: row.gaps, matchEvidence: row.evidence, skillsScore: row.skillsScore, roleScore: row.roleScore, responsibilitiesScore: row.responsibilitiesScore, workArrangementScore: row.workArrangementScore, locationScore: row.locationScore })
    }
  },
})

export const matchSearchRun = internalAction({
  args: { searchRunId: v.id('searchRuns') },
  handler: async (ctx, args): Promise<{ state: 'ready' | 'pending' | 'fallback' }> => {
    const input = await ctx.runQuery(internal.resumeMatching.inputForSearchRun, args) as { state: string; ownerId?: string; sourceHash?: string; resumeText?: string; profile?: ResumeProfile; jobs?: MatchJob[]; cached?: any[]; workPreferences?: string[] } | null
    if (!input || input.state === 'missing_resume' || input.state === 'profile_failed') return { state: 'fallback' }
    if (input.state === 'profile_pending') return { state: 'pending' }
    const jobs = input.jobs ?? []
    const sourceHash = input.sourceHash!
    const cachedByJob = new Map((input.cached ?? []).filter((row) => row.jobLastUpdatedAt && row.scoreVersion === SCORE_VERSION).map((row) => [String(row.jobId), row]))
    const toSave: { jobId: Id<'jobs'>; jobLastUpdatedAt: number; score: number; skillsScore: number; roleScore: number; responsibilitiesScore: number; workArrangementScore: number; locationScore: number; evidence: { requirement: string; resumeLine: number }[]; gaps: string[] }[] = []
    const staleJobs = jobs.filter((job) => !cachedByJob.get(String(job._id)) || cachedByJob.get(String(job._id)).jobLastUpdatedAt !== job.lastUpdatedAt)
    for (const job of jobs) {
      const cached = cachedByJob.get(String(job._id))
      if (cached && cached.jobLastUpdatedAt === job.lastUpdatedAt) toSave.push({ jobId: job._id, jobLastUpdatedAt: job.lastUpdatedAt, score: cached.score, skillsScore: cached.skillsScore, roleScore: cached.roleScore, responsibilitiesScore: cached.responsibilitiesScore, workArrangementScore: cached.workArrangementScore, locationScore: cached.locationScore, evidence: cached.evidence, gaps: cached.gaps })
    }
    if (staleJobs.length > 0) {
      try {
        const text = await requestGeminiText({ model: 'gemini-3.6-flash', prompt: batchPrompt(input.profile!, input.resumeText!.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean), staleJobs), thinkingLevel: 'medium', maxOutputTokens: 4500 })
        const parsed = parseBatchRows(jsonFromText(text), new Set(staleJobs.map((job) => String(job._id))), input.resumeText!.split(/\r?\n/).filter(Boolean).length)
        if (!parsed) throw new Error('invalid match response')
        const jobsById = new Map(staleJobs.map((job) => [String(job._id), job]))
        for (const row of parsed) {
          const job = jobsById.get(row.jobId)!
          const score = scoreResumeMatch({ requiredSupported: row.required.supported.length, requiredTotal: row.required.supported.length + row.required.missing.length, preferredSupported: row.preferred.supported.length, preferredTotal: row.preferred.supported.length + row.preferred.missing.length, roleFit: row.roleFit, responsibilityFit: row.responsibilityFit, workArrangementFits: worksForPreference(job.locationLabel, input.workPreferences ?? []), isIndiaRole: true })
          toSave.push({ jobId: job._id, jobLastUpdatedAt: job.lastUpdatedAt, score: score.score, skillsScore: score.skills, roleScore: score.role, responsibilitiesScore: score.responsibilities, workArrangementScore: score.workArrangement, locationScore: score.location, evidence: row.evidence, gaps: [...row.required.missing, ...row.preferred.missing].slice(0, 5) })
        }
      } catch { return { state: 'fallback' } }
    }
    await ctx.runMutation(internal.resumeMatching.saveMatches, { searchRunId: args.searchRunId, sourceHash, rows: toSave })
    return { state: 'ready' }
  },
})
