import type { MasterExperience } from '../masterResumeStructure'
import type { ResumeBlock } from './resumeBlocks'

export type TemplateExperience = {
  experienceId: string
  order: number
  headerText: string
  company?: string
  title?: string
  dateText?: string
}

export type ExperienceMatch = {
  templateExperienceId: string
  masterExperienceId: string
  confidence: number
  matchedBy: string[]
}

export type ExperienceMatchingResult = {
  matches: ExperienceMatch[]
  unmatchedTemplateExperienceIds: string[]
  unmatchedMasterExperienceIds: string[]
}

type EmploymentRange = {
  startMonth: number
  endMonth: number
}

type Candidate = ExperienceMatch & {
  templateOrder: number
  masterOrder: number
}

const companySuffixPattern = /(?:\b(?:private limited|pvt ltd|pvt limited|limited|ltd|inc|llc|corporation|corp)\b\s*)+$/i
const monthNames: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
  sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

function normaliseWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Removes only terminal legal suffixes, so "ABC" does not match "ABC Consulting". */
export function normalizeCompanyName(company: string | undefined) {
  if (!company) return ''
  return normaliseWords(company).replace(companySuffixPattern, '').trim()
}

/** Deliberately narrow: only standard senior abbreviations are expanded. */
export function normalizeTitle(title: string | undefined) {
  if (!title) return ''
  return normaliseWords(title).replace(/\bsr\b/g, 'senior').replace(/\s+/g, ' ').trim()
}

function parseEndpoint(value: string, isEnd: boolean) {
  const cleaned = value.trim().toLowerCase()
  if (/^(?:present|current)$/.test(cleaned)) return 9999 * 12 + 11
  const match = cleaned.match(/^(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?((?:19|20)\d{2})$/i)
  if (!match) return null
  const month = match[1] ? monthNames[match[1].toLowerCase()] : (isEnd ? 11 : 0)
  return Number(match[2]) * 12 + month
}

export function parseEmploymentRange(dateText: string | undefined): EmploymentRange | null {
  if (!dateText) return null
  const match = dateText
    .replace(/[–—]/g, '-')
    .match(/((?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:19|20)\d{2})\s*(?:-|to)\s*((?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?(?:19|20)\d{2}|present|current)/i)
  if (!match) return null
  const startMonth = parseEndpoint(match[1], false)
  const endMonth = parseEndpoint(match[2], true)
  if (startMonth === null || endMonth === null || startMonth > endMonth) return null
  return { startMonth, endMonth }
}

function rangesOverlap(first: EmploymentRange | null, second: EmploymentRange | null) {
  return Boolean(first && second && first.startMonth <= second.endMonth && second.startMonth <= first.endMonth)
}

function headerMetadata(headerText: string) {
  const parts = headerText.split('|').map((part) => part.trim()).filter(Boolean)
  if (parts.length !== 3 || !parseEmploymentRange(parts[2])) return {}
  return { title: parts[0], company: parts[1], dateText: parts[2] }
}

/** Builds template experience metadata only from existing locked experience headers. */
export function templateExperiencesFromBlocks(blocks: ResumeBlock[]): TemplateExperience[] {
  return blocks
    .filter((block) => block.kind === 'experience_header' && block.experienceId)
    .sort((first, second) => first.index - second.index)
    .map((block, order) => ({
      experienceId: block.experienceId!,
      order,
      headerText: block.text,
      ...headerMetadata(block.text),
    }))
}

function candidateFor(template: TemplateExperience, master: MasterExperience): Candidate | null {
  const templateCompany = normalizeCompanyName(template.company)
  const masterCompany = normalizeCompanyName(master.company)
  // A company anchor is mandatory. This deliberately prevents chronology-only matches.
  if (!templateCompany || !masterCompany || templateCompany !== masterCompany) return null

  const templateRange = parseEmploymentRange(template.dateText)
  const masterRange = parseEmploymentRange(master.dateText)
  if (templateRange && masterRange && !rangesOverlap(templateRange, masterRange)) return null

  const titleMatches = Boolean(normalizeTitle(template.title) && normalizeTitle(template.title) === normalizeTitle(master.title))
  const datesOverlap = rangesOverlap(templateRange, masterRange)
  // Same company alone is never enough. Require either the exact normalised title or overlapping dates.
  if (!titleMatches && !datesOverlap) return null

  const orderDistance = Math.abs(template.order - master.order)
  const orderScore = orderDistance === 0 ? 0.02 : orderDistance === 1 ? 0.01 : 0
  const confidence = Math.min(1, 0.55 + (datesOverlap ? 0.28 : 0) + (titleMatches ? 0.2 : 0) + orderScore)
  const matchedBy = ['company']
  if (datesOverlap) matchedBy.push('date_overlap')
  if (titleMatches) matchedBy.push('title')
  if (orderScore > 0) matchedBy.push('order_proximity')

  return {
    templateExperienceId: template.experienceId,
    masterExperienceId: master.experienceId,
    confidence,
    matchedBy,
    templateOrder: template.order,
    masterOrder: master.order,
  }
}

function bestCandidatesBy<T extends 'templateExperienceId' | 'masterExperienceId'>(candidates: Candidate[], key: T) {
  const groups = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    const group = groups.get(candidate[key]) ?? []
    group.push(candidate)
    groups.set(candidate[key], group)
  }
  const result = new Map<string, Candidate | null>()
  for (const [id, group] of groups) {
    const ordered = [...group].sort((first, second) => second.confidence - first.confidence || first.templateOrder - second.templateOrder || first.masterOrder - second.masterOrder)
    const best = ordered[0]
    const second = ordered[1]
    // Do not guess between near-equal candidates; the next layer can fall back to template evidence.
    result.set(id, second && best.confidence - second.confidence < 0.1 ? null : best)
  }
  return result
}

/**
 * Uses only exact conservative normalisation and parsed employment ranges. A no-match is intentional
 * when identity is uncertain; it never means that one experience may borrow another's evidence.
 */
export function matchTemplateExperiencesToMaster(templateExperiences: TemplateExperience[], masterExperiences: MasterExperience[]): ExperienceMatchingResult {
  const candidates = templateExperiences
    .flatMap((template) => masterExperiences.map((master) => candidateFor(template, master)).filter((candidate): candidate is Candidate => candidate !== null))
    .filter((candidate) => candidate.confidence >= 0.75)
  const bestForTemplate = bestCandidatesBy(candidates, 'templateExperienceId')
  const bestForMaster = bestCandidatesBy(candidates, 'masterExperienceId')
  const matches = candidates
    .filter((candidate) => bestForTemplate.get(candidate.templateExperienceId) === candidate && bestForMaster.get(candidate.masterExperienceId) === candidate)
    .sort((first, second) => first.templateOrder - second.templateOrder)
    .map(({ templateOrder: _templateOrder, masterOrder: _masterOrder, ...match }) => match)
  const matchedTemplateIds = new Set(matches.map((match) => match.templateExperienceId))
  const matchedMasterIds = new Set(matches.map((match) => match.masterExperienceId))
  return {
    matches,
    unmatchedTemplateExperienceIds: templateExperiences.filter((experience) => !matchedTemplateIds.has(experience.experienceId)).map((experience) => experience.experienceId),
    unmatchedMasterExperienceIds: masterExperiences.filter((experience) => !matchedMasterIds.has(experience.experienceId)).map((experience) => experience.experienceId),
  }
}

/** Future tailoring can use this to obtain the only allowed Master experience for a template experience. */
export function getMatchedMasterExperienceForTemplate(result: ExperienceMatchingResult, templateExperienceId: string, masterExperiences: MasterExperience[]) {
  const match = result.matches.find((candidate) => candidate.templateExperienceId === templateExperienceId)
  return match ? masterExperiences.find((experience) => experience.experienceId === match.masterExperienceId) ?? null : null
}
