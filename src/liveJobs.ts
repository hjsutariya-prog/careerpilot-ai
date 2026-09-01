export type LiveJobRecord = {
  _id: string
  title: string
  companyName: string
  locationLabel: string
  description: string
  descriptionHtml?: string
  skills: string[]
  applyUrl: string
  lastUpdatedAt: number
  lastSeenAt: number
}

export type LiveSuggestionRecord = {
  rank: number
  matchScore: number
  matchExplanation: string
  isRelatedMatch: boolean
  matchSource?: 'preferences' | 'resume'
  fitSummary?: string
  fitEvidenceIds?: string[]
  strengths?: { requirement: string; resumeLine: number; source?: 'primary' | 'master' }[]
  cautions?: string[]
  requirements?: string[]
  preferenceAlignment?: { location: 'aligned' | 'mismatch' | 'not_set'; workStyle: 'aligned' | 'mismatch' | 'not_set'; salary: 'unknown' }
  matchGaps?: string[]
  matchEvidence?: { requirement: string; resumeLine: number; source?: 'primary' | 'master' }[]
  skillsScore?: number
  roleScore?: number
  responsibilitiesScore?: number
  workArrangementScore?: number
  locationScore?: number
  job: LiveJobRecord | null
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

function formatDate(timestamp: number) {
  return dateFormatter.format(new Date(timestamp))
}

function workArrangement(locationLabel: string) {
  if (/\bremote\b/i.test(locationLabel)) return 'Remote'
  if (/\bhybrid\b/i.test(locationLabel)) return 'Hybrid'
  return 'Office'
}

function displayLocation(locationLabel: string) {
  const stateNames = new Set(['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'])
  const locations = locationLabel
    .split(';')
    .flatMap((part) => part
      .replace(/\(\s*India\s*\)/gi, '')
      .replace(/\bIndia\b/gi, '')
      .replace(/^\s*[-–—•·]+\s*/g, '')
      .split(',')
      .map((location) => location.replace(/\s+/g, ' ').trim())
      .map((location) => /^Bangalore$/i.test(location) ? 'Bengaluru' : location)
      .filter((location) => location && !/^remote$/i.test(location) && !stateNames.has(location)))
  return [...new Map(locations.map((location) => [location.toLowerCase(), location])).values()].join(', ')
}

function preferenceCautions(alignment: LiveSuggestionRecord['preferenceAlignment'], locationLabel: string) {
  if (!alignment) return []
  const cautions: string[] = []
  if (alignment.location === 'mismatch') cautions.push(`This role is based in ${locationLabel}, outside your saved city preferences.`)
  if (alignment.workStyle === 'mismatch') cautions.push('This role’s work arrangement differs from your saved work preference.')
  return cautions
}

function fallbackFitSummary(evidence: NonNullable<LiveSuggestionRecord['strengths']>) {
  const strongest = evidence[0]
  return strongest
    ? `Your resume shows ${strongest.requirement} experience, directly supporting a core professional requirement for this role.`
    : 'Professional resume evidence is limited for this role, so its key requirements need closer review.'
}

export function summarizeRoleDescription(description: string, maximumLength = 280) {
  const compact = description.replace(/\s+/g, ' ').trim()
  if (compact.length <= maximumLength) return compact

  const preview = compact.slice(0, maximumLength)
  const lastSentence = Math.max(preview.lastIndexOf('. '), preview.lastIndexOf('; '), preview.lastIndexOf(': '))
  const endAt = lastSentence >= Math.floor(maximumLength * 0.65) ? lastSentence + 1 : maximumLength
  return `${compact.slice(0, endAt).trim()}…`
}

export function toLiveJobCard(suggestion: LiveSuggestionRecord) {
  if (!suggestion.job) return null
  const { job } = suggestion
  return {
    id: String(job._id),
    title: job.title,
    companyName: job.companyName,
    cityLabel: displayLocation(job.locationLabel),
    workPreference: workArrangement(job.locationLabel),
    description: job.description,
    descriptionHtml: job.descriptionHtml ?? null,
    skills: job.skills,
    applyUrl: job.applyUrl,
    matchScore: suggestion.matchScore,
    // Older suggestion rows can contain preference-based copy. Never reuse that copy as professional fit evidence.
    fitSummary: suggestion.matchSource === 'resume' && suggestion.fitSummary
      ? suggestion.fitSummary
      : fallbackFitSummary(suggestion.strengths ?? suggestion.matchEvidence ?? []),
    matchSource: suggestion.matchSource ?? 'preferences',
    strengths: suggestion.strengths ?? suggestion.matchEvidence ?? [],
    cautions: [...new Set([...(suggestion.cautions ?? suggestion.matchGaps ?? []), ...preferenceCautions(suggestion.preferenceAlignment, job.locationLabel)])],
    requirements: suggestion.requirements ?? [],
    preferenceAlignment: suggestion.preferenceAlignment,
    matchGaps: suggestion.matchGaps ?? [],
    matchEvidence: suggestion.matchEvidence ?? [],
    scoreBreakdown: suggestion.matchSource === 'resume' ? { skills: suggestion.skillsScore ?? 0, role: suggestion.roleScore ?? 0, responsibilities: suggestion.responsibilitiesScore ?? 0, workArrangement: suggestion.workArrangementScore ?? 0, location: suggestion.locationScore ?? 0 } : null,
    isRelatedMatch: suggestion.isRelatedMatch,
    freshnessLabel: `Last updated ${formatDate(job.lastUpdatedAt)}`,
    checkedLabel: `Checked ${formatDate(job.lastSeenAt)}`,
  }
}
