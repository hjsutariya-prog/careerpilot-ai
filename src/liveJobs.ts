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
  matchGaps?: string[]
  matchEvidence?: { requirement: string; resumeLine: number }[]
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
    cityLabel: job.locationLabel,
    workPreference: /\bremote\b/i.test(job.locationLabel) ? 'Remote' : 'India office',
    description: job.description,
    descriptionHtml: job.descriptionHtml ?? null,
    skills: job.skills,
    applyUrl: job.applyUrl,
    matchScore: suggestion.matchScore,
    matchReason: suggestion.matchExplanation,
    matchSource: suggestion.matchSource ?? 'preferences',
    matchGaps: suggestion.matchGaps ?? [],
    matchEvidence: suggestion.matchEvidence ?? [],
    scoreBreakdown: suggestion.matchSource === 'resume' ? { skills: suggestion.skillsScore ?? 0, role: suggestion.roleScore ?? 0, responsibilities: suggestion.responsibilitiesScore ?? 0, workArrangement: suggestion.workArrangementScore ?? 0, location: suggestion.locationScore ?? 0 } : null,
    isRelatedMatch: suggestion.isRelatedMatch,
    freshnessLabel: `Last updated ${formatDate(job.lastUpdatedAt)}`,
    checkedLabel: `Checked ${formatDate(job.lastSeenAt)}`,
  }
}
