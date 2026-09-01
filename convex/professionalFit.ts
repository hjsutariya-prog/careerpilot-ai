export type EvidenceSource = 'primary' | 'master'

export type ProfessionalEvidence = {
  requirement: string
  resumeLine: number
  source: EvidenceSource
}

export type PreferenceAlignment = {
  location: 'aligned' | 'mismatch' | 'not_set'
  workStyle: 'aligned' | 'mismatch' | 'not_set'
  salary: 'unknown'
}

const preferenceRequirementPattern = /\b(remote|hybrid|on[ -]?site|work(?:ing)? (?:style|arrangement)|location|relocat(?:e|ion)|city|salary|compensation|ctc|notice period|availability)\b/i
const commonIndiaCityPattern = /^(?:ahmedabad|bengaluru|bangalore|bhopal|bhubaneswar|chandigarh|chennai|coimbatore|delhi|faridabad|gurugram|gurgaon|hyderabad|indore|jaipur|kochi|kolkata|mumbai|nagpur|navi mumbai|new delhi|noida|pune|surat|thane|trivandrum|vadodara|visakhapatnam)(?:,? india)?$/i

/** Professional requirements belong in fit strengths. Search preferences never do. */
export function isProfessionalRequirement(requirement: string) {
  return Boolean(requirement.trim()) && !preferenceRequirementPattern.test(requirement) && !commonIndiaCityPattern.test(requirement.trim())
}

export function professionalRequirements(requirements: string[]) {
  return [...new Set(requirements.map((item) => item.replace(/\s+/g, ' ').trim()).filter(isProfessionalRequirement))]
}

export function professionalEvidence(evidence: ProfessionalEvidence[]) {
  return evidence.filter((item) => isProfessionalRequirement(item.requirement))
}

export function buildProfessionalFitSummary(evidence: ProfessionalEvidence[]) {
  const strongest = professionalEvidence(evidence)[0]
  if (!strongest) return 'Professional resume evidence is being prepared for this role.'
  return `Your resume shows direct experience with ${strongest.requirement}, a core requirement for this role.`
}

export function preferenceCautions(alignment: PreferenceAlignment | undefined, locationLabel: string) {
  if (!alignment) return []
  const cautions: string[] = []
  if (alignment.location === 'mismatch') cautions.push(`This role is based in ${locationLabel}, outside your saved city preferences.`)
  if (alignment.workStyle === 'mismatch') cautions.push('This role’s work arrangement differs from your saved work preference.')
  return cautions
}
