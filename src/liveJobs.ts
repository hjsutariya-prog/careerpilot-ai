export type LiveJobRecord = {
  _id: string
  title: string
  companyName: string
  locationLabel: string
  description: string
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
  job: LiveJobRecord | null
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

function formatDate(timestamp: number) {
  return dateFormatter.format(new Date(timestamp))
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
    skills: job.skills,
    applyUrl: job.applyUrl,
    matchScore: suggestion.matchScore,
    matchReason: suggestion.matchExplanation,
    isRelatedMatch: suggestion.isRelatedMatch,
    freshnessLabel: `Last updated ${formatDate(job.lastUpdatedAt)}`,
    checkedLabel: `Checked ${formatDate(job.lastSeenAt)}`,
  }
}
