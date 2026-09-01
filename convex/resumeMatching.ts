import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { PROFILE_SCHEMA_VERSION, type ResumeProfile } from './resumeProfiles'
import { isGeminiRequestError, requestGeminiText } from './gemini'
import { resumeMatchingGeminiConfig } from './ai/resumeMatchingGeminiConfig'
import { buildFitSummaryPrompt, evidenceId, fallbackFitSummary, fitSummaryResponseSchema, parseFitSummaries, type FitSummaryInput } from './ai/fitSummary'
import { jsonrepair } from 'jsonrepair'
import { selectActiveMaster, selectLatestTemplateResume } from './resumeRecords'
import { isProfessionalRequirement, professionalEvidence, professionalRequirements, type EvidenceSource, type ProfessionalEvidence } from './professionalFit'

export const SCORE_VERSION = 3

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
  matchedEvidence: ProfessionalEvidence[]
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
  evidence: ProfessionalEvidence[]
}

/** Constrains the evidence-classification call before deterministic source-line validation. */
export const batchMatchResponseSchema = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          required: {
            type: 'object',
            properties: { supported: { type: 'array', items: { type: 'string' } }, missing: { type: 'array', items: { type: 'string' } } },
            required: ['supported', 'missing'],
            additionalProperties: false,
          },
          preferred: {
            type: 'object',
            properties: { supported: { type: 'array', items: { type: 'string' } }, missing: { type: 'array', items: { type: 'string' } } },
            required: ['supported', 'missing'],
            additionalProperties: false,
          },
          roleFit: { type: 'string', enum: ['none', 'partial', 'strong'] },
          responsibilityFit: { type: 'string', enum: ['none', 'partial', 'strong'] },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: { requirement: { type: 'string' }, source: { type: 'string', enum: ['primary', 'master'] }, resumeLine: { type: 'integer' } },
              required: ['requirement', 'source', 'resumeLine'],
              additionalProperties: false,
            },
          },
        },
        required: ['jobId', 'required', 'preferred', 'roleFit', 'responsibilityFit', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
} as const

function compactStrings(value: unknown, maximum: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, maximum)
}

function inBatches<T>(values: T[], size: number) {
  const batches: T[][] = []
  for (let index = 0; index < values.length; index += size) batches.push(values.slice(index, index + size))
  return batches
}

function safeFitLevel(value: unknown): FitLevel {
  return value === 'strong' || value === 'partial' || value === 'none' ? value : 'none'
}

function parseBatchRows(value: unknown, expectedJobIds: Set<string>, lineCounts: Record<EvidenceSource, number>): BatchMatchRow[] | null {
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
      const source: EvidenceSource = evidenceRow.source === 'master' ? 'master' : 'primary'
      return requirement && isProfessionalRequirement(requirement) && Number.isInteger(resumeLine) && (resumeLine as number) >= 1 && (resumeLine as number) <= lineCounts[source] ? [{ requirement, resumeLine: resumeLine as number, source }] : []
    }).slice(0, 12) : []
    rows.push({
      jobId,
      required: { supported: professionalRequirements(compactStrings(required.supported, 20)), missing: professionalRequirements(compactStrings(required.missing, 20)) },
      preferred: { supported: professionalRequirements(compactStrings(preferred.supported, 20)), missing: professionalRequirements(compactStrings(preferred.missing, 20)) },
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
  try { return JSON.parse(json) } catch {
    try { return JSON.parse(jsonrepair(json)) } catch { return null }
  }
}

function batchPrompt(profile: ResumeProfile, primaryLines: string[], masterLines: string[], jobs: MatchJob[]) {
  return `Match the candidate's factual resume evidence against every job below. Return JSON only: {"matches":[{"jobId":"job id","required":{"supported":["professional requirement"],"missing":["professional requirement"]},"preferred":{"supported":["professional requirement"],"missing":["professional requirement"]},"roleFit":"none|partial|strong","responsibilityFit":"none|partial|strong","evidence":[{"requirement":"professional requirement","source":"primary|master","resumeLine":1}]}]}. Focus only on professional requirements: skills, responsibilities, seniority, domain knowledge, tools, achievements, leadership, and stakeholder scope. Do not list or use location, remote/hybrid/on-site arrangements, salary, notice period, availability, or other search preferences as professional evidence. A supported requirement must have direct evidence in the numbered PRIMARY RESUME or optional MASTER RESUME. The job description is relevance only, never evidence about the candidate. Never infer unlisted skills, achievements, dates, employers, qualifications, or years. A requirement can be in only one supported/missing list. Put the most important supported required requirement first and cite its source. Include exactly one match for each job.\n\nPRIMARY PROFILE:\n${JSON.stringify(profile)}\n\nPRIMARY NUMBERED RESUME:\n${primaryLines.map((line, index) => `${index + 1}. ${line}`).join('\n')}\n\n${masterLines.length ? `MASTER NUMBERED RESUME (additional evidence only):\n${masterLines.map((line, index) => `${index + 1}. ${line}`).join('\n')}\n\n` : ''}JOBS:\n${JSON.stringify(jobs.map((job) => ({ jobId: String(job._id), title: job.title, companyName: job.companyName, listedSkills: job.skills, description: job.description.slice(0, 9000) })) )}`
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
    const resumes = await ctx.db.query('resumes').withIndex('by_owner', (q) => q.eq('ownerId', searchRun.ownerId)).order('desc').collect()
    const resume = selectLatestTemplateResume(resumes)
    const masterResume = selectActiveMaster(resumes)
    if (!resume?.contentHash || !resume.extractedText) return { state: 'missing_resume' as const }
    const profile = await ctx.db.query('resumeProfiles').withIndex('by_owner_hash_version', (q) => q.eq('ownerId', searchRun.ownerId).eq('sourceHash', resume.contentHash!).eq('schemaVersion', PROFILE_SCHEMA_VERSION)).first()
    if (!profile || profile.status === 'queued' || profile.status === 'generating') return { state: 'profile_pending' as const }
    if (profile.status !== 'ready' || !profile.profile) return { state: 'profile_failed' as const }
    const preferences = await ctx.db.query('preferences').withIndex('by_owner', (q) => q.eq('ownerId', searchRun.ownerId)).first()
    const suggestions = await ctx.db.query('jobSuggestions').withIndex('by_search_rank', (q) => q.eq('searchRunId', args.searchRunId)).collect()
    const jobs = (await Promise.all(suggestions.map((suggestion) => ctx.db.get(suggestion.jobId)))).filter((job): job is NonNullable<typeof job> => Boolean(job))
    const sourceHash = `${resume.contentHash}:${masterResume?.contentHash ?? ''}`
    const cached = await Promise.all(jobs.map(async (job) => await ctx.db.query('resumeJobMatches').withIndex('by_owner_hash_job', (q) => q.eq('ownerId', searchRun.ownerId).eq('sourceHash', sourceHash).eq('jobId', job._id)).first()))
    return { state: 'ready' as const, ownerId: searchRun.ownerId, sourceHash, resumeText: resume.extractedText, masterResumeText: masterResume?.extractedText ?? '', profile: profile.profile as ResumeProfile, jobs, cached: cached.filter(Boolean), workPreferences: preferences?.workPreferences ?? (preferences?.workPreference ? [preferences.workPreference] : []) }
  },
})

export const saveMatches = internalMutation({
  args: {
    searchRunId: v.id('searchRuns'),
    sourceHash: v.string(),
    rows: v.array(v.object({ jobId: v.id('jobs'), jobLastUpdatedAt: v.number(), score: v.number(), skillsScore: v.number(), roleScore: v.number(), responsibilitiesScore: v.number(), workArrangementScore: v.number(), locationScore: v.number(), evidence: v.array(v.object({ requirement: v.string(), resumeLine: v.number(), source: v.union(v.literal('primary'), v.literal('master')) })), gaps: v.array(v.string()), requirements: v.array(v.string()), fitSummary: v.string(), fitEvidenceIds: v.array(v.string()) })),
  },
  handler: async (ctx, args) => {
    const searchRun = await ctx.db.get(args.searchRunId)
    if (!searchRun) return
    for (const row of args.rows) {
      const existing = await ctx.db.query('resumeJobMatches').withIndex('by_owner_hash_job', (q) => q.eq('ownerId', searchRun.ownerId).eq('sourceHash', args.sourceHash).eq('jobId', row.jobId)).first()
      const record = { ownerId: searchRun.ownerId, sourceHash: args.sourceHash, jobId: row.jobId, jobLastUpdatedAt: row.jobLastUpdatedAt, scoreVersion: SCORE_VERSION, score: row.score, skillsScore: row.skillsScore, roleScore: row.roleScore, responsibilitiesScore: row.responsibilitiesScore, workArrangementScore: row.workArrangementScore, locationScore: row.locationScore, evidence: row.evidence, gaps: row.gaps, requirements: row.requirements, fitSummary: row.fitSummary, fitEvidenceIds: row.fitEvidenceIds, createdAt: Date.now() }
      if (existing) await ctx.db.replace(existing._id, record)
      else await ctx.db.insert('resumeJobMatches', record)
      const suggestion = await ctx.db.query('jobSuggestions').withIndex('by_search_job', (q) => q.eq('searchRunId', args.searchRunId).eq('jobId', row.jobId)).unique()
      if (suggestion) {
        const strengths = professionalEvidence(row.evidence)
        await ctx.db.patch(suggestion._id, { matchScore: row.score, matchExplanation: row.fitSummary, fitSummary: row.fitSummary, fitEvidenceIds: row.fitEvidenceIds, strengths, cautions: row.gaps, requirements: row.requirements, matchSource: 'resume', matchGaps: row.gaps, matchEvidence: strengths, skillsScore: row.skillsScore, roleScore: row.roleScore, responsibilitiesScore: row.responsibilitiesScore, workArrangementScore: row.workArrangementScore, locationScore: row.locationScore })
      }
    }
  },
})

export const matchSearchRun = internalAction({
  args: { searchRunId: v.id('searchRuns') },
  handler: async (ctx, args): Promise<{ state: 'ready' | 'pending' | 'fallback' }> => {
    const input = await ctx.runQuery(internal.resumeMatching.inputForSearchRun, args) as { state: string; ownerId?: string; sourceHash?: string; resumeText?: string; masterResumeText?: string; profile?: ResumeProfile; jobs?: MatchJob[]; cached?: any[]; workPreferences?: string[] } | null
    if (!input || input.state === 'missing_resume' || input.state === 'profile_failed') return { state: 'fallback' }
    if (input.state === 'profile_pending') return { state: 'pending' }
    const jobs = input.jobs ?? []
    const sourceHash = input.sourceHash!
    const cachedByJob = new Map((input.cached ?? []).filter((row) => row.jobLastUpdatedAt && row.scoreVersion === SCORE_VERSION).map((row) => [String(row.jobId), row]))
    const toSave: { jobId: Id<'jobs'>; jobLastUpdatedAt: number; score: number; skillsScore: number; roleScore: number; responsibilitiesScore: number; workArrangementScore: number; locationScore: number; evidence: ProfessionalEvidence[]; gaps: string[]; requirements: string[]; fitSummary: string; fitEvidenceIds: string[] }[] = []
    const staleJobs = jobs.filter((job) => !cachedByJob.get(String(job._id)) || cachedByJob.get(String(job._id)).jobLastUpdatedAt !== job.lastUpdatedAt)
    for (const job of jobs) {
      const cached = cachedByJob.get(String(job._id))
      if (cached && cached.jobLastUpdatedAt === job.lastUpdatedAt) {
        const evidence = cached.evidence.map((item: ProfessionalEvidence) => ({ ...item, source: item.source ?? 'primary' as EvidenceSource }))
        toSave.push({ jobId: job._id, jobLastUpdatedAt: job.lastUpdatedAt, score: cached.score, skillsScore: cached.skillsScore, roleScore: cached.roleScore, responsibilitiesScore: cached.responsibilitiesScore, workArrangementScore: cached.workArrangementScore, locationScore: cached.locationScore, evidence, gaps: cached.gaps, requirements: cached.requirements ?? [], fitSummary: cached.fitSummary ?? fallbackFitSummary(evidence), fitEvidenceIds: cached.fitEvidenceIds ?? evidence.map(evidenceId) })
      }
    }
    if (staleJobs.length > 0) {
      try {
        const primaryLines = input.resumeText!.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
        const masterLines = (input.masterResumeText ?? '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
        const parsed: BatchMatchRow[] = []
        for (const jobBatch of inBatches(staleJobs, 3)) {
          const text = await requestGeminiText({ ...resumeMatchingGeminiConfig, prompt: batchPrompt(input.profile!, primaryLines, masterLines, jobBatch), schema: batchMatchResponseSchema })
          const rows = parseBatchRows(jsonFromText(text), new Set(jobBatch.map((job) => String(job._id))), { primary: primaryLines.length, master: masterLines.length })
          if (!rows) throw new Error('invalid match response')
          parsed.push(...rows)
        }
        const jobsById = new Map(staleJobs.map((job) => [String(job._id), job]))
        for (const row of parsed) {
          const job = jobsById.get(row.jobId)!
          const score = scoreResumeMatch({ requiredSupported: row.required.supported.length, requiredTotal: row.required.supported.length + row.required.missing.length, preferredSupported: row.preferred.supported.length, preferredTotal: row.preferred.supported.length + row.preferred.missing.length, roleFit: row.roleFit, responsibilityFit: row.responsibilityFit, workArrangementFits: worksForPreference(job.locationLabel, input.workPreferences ?? []), isIndiaRole: true })
          toSave.push({ jobId: job._id, jobLastUpdatedAt: job.lastUpdatedAt, score: score.score, skillsScore: score.skills, roleScore: score.role, responsibilitiesScore: score.responsibilities, workArrangementScore: score.workArrangement, locationScore: score.location, evidence: row.evidence, gaps: professionalRequirements([...row.required.missing, ...row.preferred.missing]).slice(0, 5), requirements: professionalRequirements([...row.required.supported, ...row.required.missing, ...row.preferred.supported, ...row.preferred.missing]), fitSummary: fallbackFitSummary(row.evidence), fitEvidenceIds: row.evidence.map(evidenceId) })
        }
      } catch (error) {
        const failure = isGeminiRequestError(error)
          ? { code: error.code, httpStatus: error.options.httpStatus, retryAfterSeconds: error.options.retryAfterSeconds }
          : { code: 'MATCH_RESPONSE_INVALID' }
        console.warn('Resume-to-job matching failed.', { searchRunId: String(args.searchRunId), failure })
        return { state: 'fallback' }
      }
    }
    // The writer sees only pre-validated, cited professional evidence. A failed wording call never blocks matching.
    if (toSave.length) {
      const fitInputs: FitSummaryInput[] = toSave.map((row) => ({ jobId: String(row.jobId), evidence: professionalEvidence(row.evidence), gaps: row.gaps }))
      try {
        const summaryByJob = new Map<string, { sentence: string; evidenceIds: string[] }>()
        for (const inputBatch of inBatches(fitInputs, 3)) {
          const text = await requestGeminiText({ ...resumeMatchingGeminiConfig, thinkingLevel: 'low', maxOutputTokens: 2_800, prompt: buildFitSummaryPrompt(inputBatch), schema: fitSummaryResponseSchema })
          const summaries = parseFitSummaries(text, inputBatch)
          if (!summaries) throw new Error('invalid fit-summary response')
          for (const summary of summaries) summaryByJob.set(summary.jobId, { sentence: summary.sentence, evidenceIds: summary.evidenceIds })
        }
        for (const row of toSave) {
          const summary = summaryByJob.get(String(row.jobId))
          row.fitSummary = summary?.sentence ?? fallbackFitSummary(row.evidence)
          row.fitEvidenceIds = summary?.evidenceIds ?? row.evidence.map(evidenceId)
        }
      } catch (error) {
        const failure = isGeminiRequestError(error) ? { code: error.code, httpStatus: error.options.httpStatus } : { code: 'FIT_SUMMARY_RESPONSE_INVALID' }
        console.warn('Professional fit summary generation failed; using evidence-backed fallback.', { searchRunId: String(args.searchRunId), failure })
      }
    }
    await ctx.runMutation(internal.resumeMatching.saveMatches, { searchRunId: args.searchRunId, sourceHash, rows: toSave })
    return { state: 'ready' }
  },
})
