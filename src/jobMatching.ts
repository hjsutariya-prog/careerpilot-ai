import type { SampleJob } from './data/sampleJobs'

export type JobPreferences = {
  roles: string[]
  skills: string
  experience: number
  cities: string[]
  workPreferences: string[]
  jobType: string
  companiesToAvoid: string
}

export type SuggestedJob = SampleJob & {
  matchScore: number
  matchReason: string
  isRelatedMatch: boolean
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function parseList(value: string) {
  return value.split(',').map(normalise).filter(Boolean)
}

function parseMinimumExperience(value: string) {
  const match = value.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function daysSincePosted(postedDate: string, now: Date) {
  const postedAt = Date.parse(`${postedDate}T00:00:00.000Z`)
  return Math.floor((now.getTime() - postedAt) / 86_400_000)
}

function matchesRole(job: SampleJob, roles: string[]) {
  const title = normalise(job.title)
  return roles.find((role) => {
    const target = normalise(role)
    return title.includes(target) || target.includes(title)
  })
}

function matchingSkills(job: SampleJob, skills: string[]) {
  return skills.filter((skill) => job.skills.some((jobSkill) => {
    const normalisedJobSkill = normalise(jobSkill)
    return normalisedJobSkill.includes(skill) || skill.includes(normalisedJobSkill)
  }))
}

function matchesCity(job: SampleJob, cities: string[]) {
  const preferredCities = cities.map(normalise)
  return job.cities.find((city) => preferredCities.includes(normalise(city)))
}

function isAvoided(job: SampleJob, companiesToAvoid: string[]) {
  const company = normalise(job.companyName)
  return companiesToAvoid.some((avoided) => company === avoided)
}

export function getSuggestedJobs(preferences: JobPreferences, jobs: SampleJob[], now = new Date()): SuggestedJob[] {
  const preferenceSkills = parseList(preferences.skills)
  const avoidedCompanies = parseList(preferences.companiesToAvoid)

  return jobs
    .filter((job) => {
      const postedDaysAgo = daysSincePosted(job.postedDate, now)
      if (!job.isActive || !job.applyUrl.startsWith('https://') || postedDaysAgo < 0 || postedDaysAgo > 60) return false
      if (isAvoided(job, avoidedCompanies)) return false
      if (preferences.jobType && job.jobType !== preferences.jobType) return false
      if (preferences.workPreferences.length > 0 && !preferences.workPreferences.includes(job.workPreference)) return false

      const remoteMatch = preferences.workPreferences.includes('Remote') && job.workPreference === 'Remote'
      return remoteMatch || Boolean(matchesCity(job, preferences.cities))
    })
    .map((job) => {
      const roleMatch = matchesRole(job, preferences.roles)
      const skillMatches = matchingSkills(job, preferenceSkills)
      const cityMatch = matchesCity(job, preferences.cities)
      const remoteMatch = preferences.workPreferences.includes('Remote') && job.workPreference === 'Remote'
      const experienceMatch = preferences.experience >= parseMinimumExperience(job.experienceRequired)
      const isRelatedMatch = !roleMatch

      let matchScore = 0
      if (roleMatch) matchScore += 48
      matchScore += Math.min(skillMatches.length, 3) * 8
      if (cityMatch || remoteMatch) matchScore += 14
      if (preferences.workPreferences.includes(job.workPreference)) matchScore += 8
      if (preferences.jobType === job.jobType) matchScore += 8
      if (experienceMatch) matchScore += 6

      const reasons = []
      if (roleMatch) reasons.push(`Matches ${roleMatch}`)
      if (cityMatch) reasons.push(`Based in ${cityMatch}`)
      if (remoteMatch) reasons.push('Remote role')
      if (skillMatches.length > 0) reasons.push(`Skills: ${skillMatches.slice(0, 2).join(', ')}`)
      if (reasons.length === 0) reasons.push('Matches your selected work style and job type')

      return {
        ...job,
        matchScore: Math.min(matchScore, 100),
        matchReason: reasons.slice(0, 2).join(' · '),
        isRelatedMatch,
      }
    })
    .sort((first, second) => {
      if (first.isRelatedMatch !== second.isRelatedMatch) return Number(first.isRelatedMatch) - Number(second.isRelatedMatch)
      if (second.matchScore !== first.matchScore) return second.matchScore - first.matchScore
      return Date.parse(second.postedDate) - Date.parse(first.postedDate)
    })
    .slice(0, 10)
}
