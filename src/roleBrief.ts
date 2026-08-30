export type RoleBrief = {
  summary: string | null
  responsibilities: string[]
}

const overviewMarkers = [
  'an overview of this role',
  'about the role',
  'role overview',
  'position summary',
  'the opportunity',
  'the role',
]

const responsibilityMarkers = [
  "what you'll do",
  'what you will do',
  'responsibilities',
  'key responsibilities',
  'your impact',
]

const sectionEndMarkers = [
  "what you'll bring",
  'what you will bring',
  'requirements',
  'qualifications',
  'who you are',
  'about you',
  'benefits',
]

function compact(value: string) {
  return value.replace(/\s+/g, ' ').replace(/[\u2018\u2019]/g, "'").trim()
}

function markerIndex(value: string, markers: readonly string[], from = 0) {
  const lower = value.toLowerCase()
  return markers.reduce<number | null>((nearest, marker) => {
    const index = lower.indexOf(marker, from)
    if (index < 0 || (nearest !== null && index >= nearest)) return nearest
    return index
  }, null)
}

function sentences(value: string, maximum = 3) {
  return compact(value)
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30)
    .slice(0, maximum)
}

export function createRoleBrief(description: string): RoleBrief {
  const content = compact(description)
  const overviewStart = markerIndex(content, overviewMarkers)
  const responsibilitiesStart = markerIndex(content, responsibilityMarkers)
  const overviewEnd = responsibilitiesStart ?? content.length
  const summarySource = overviewStart === null ? '' : content.slice(overviewStart + overviewMarkers.find((marker) => content.toLowerCase().indexOf(marker, overviewStart) === overviewStart)!.length, overviewEnd)
  const responsibilityEnd = responsibilitiesStart === null ? null : markerIndex(content, sectionEndMarkers, responsibilitiesStart + 1)
  const responsibilitySource = responsibilitiesStart === null ? '' : content.slice(responsibilitiesStart + responsibilityMarkers.find((marker) => content.toLowerCase().indexOf(marker, responsibilitiesStart) === responsibilitiesStart)!.length, responsibilityEnd ?? content.length)
  const summary = sentences(summarySource, 3).join(' ')

  return {
    summary: summary || null,
    responsibilities: sentences(responsibilitySource, 4),
  }
}
