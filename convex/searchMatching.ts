import type { PreferenceAlignment } from './professionalFit'

export type LiveSearchPreferences = {
  roles: string[];
  skills: string;
  cities: string[];
  workPreferences: string[];
  companiesToAvoid: string;
};

export type SearchableLiveJob = {
  id: string;
  title: string;
  companyName: string;
  cities: string[];
  locationLabel: string;
  skills: string[];
  description: string;
  lastUpdatedAt: number;
};

export type LiveSuggestion = SearchableLiveJob & {
  rank: number;
  matchScore: number;
  matchExplanation: string;
  isRelatedMatch: boolean;
  preferenceAlignment: PreferenceAlignment;
};

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function list(value: string) {
  return value.split(",").map(normalise).filter(Boolean);
}

function includesRole(job: SearchableLiveJob, roles: string[]) {
  const title = normalise(job.title);
  return roles.find((role) => {
    const target = normalise(role);
    return title.includes(target) || target.includes(title);
  });
}

function matchingSkills(job: SearchableLiveJob, preferenceSkills: string[]) {
  const searchable = normalise(`${job.title} ${job.skills.join(" ")} ${job.description}`);
  return preferenceSkills.filter((skill) => searchable.includes(skill));
}

function matchingCity(job: SearchableLiveJob, cities: string[]) {
  const preferred = cities.map(normalise);
  return job.cities.find((city) => preferred.includes(normalise(city)));
}

function isRemote(job: SearchableLiveJob) {
  return /\bremote\b/i.test(job.locationLabel);
}

function preferenceAlignment(job: SearchableLiveJob, preferences: LiveSearchPreferences, city: string | undefined, remoteMatch: boolean): PreferenceAlignment {
  const workStyle = preferences.workPreferences.length === 0 ? 'not_set' : remoteMatch || (!isRemote(job) && preferences.workPreferences.some((preference) => preference === 'Hybrid' || preference === 'On-site')) ? 'aligned' : 'mismatch'
  const location = preferences.cities.length === 0 || isRemote(job) ? 'not_set' : city ? 'aligned' : 'mismatch'
  return { location, workStyle, salary: 'unknown' }
}

export function getLiveSuggestions(preferences: LiveSearchPreferences, jobs: readonly SearchableLiveJob[]) {
  const preferenceSkills = list(preferences.skills);
  const avoidedCompanies = list(preferences.companiesToAvoid);

  const suggestions = jobs
    .filter((job) => {
      if (avoidedCompanies.includes(normalise(job.companyName))) return false;
      const remoteMatch = isRemote(job) && preferences.workPreferences.includes("Remote");
      const officeStyleAllowed = !isRemote(job) && preferences.workPreferences.some((preference) => preference === "Hybrid" || preference === "On-site");
      return remoteMatch || officeStyleAllowed;
    })
    .map((job) => {
      const role = includesRole(job, preferences.roles);
      const skills = matchingSkills(job, preferenceSkills);
      const city = matchingCity(job, preferences.cities);
      const remoteMatch = isRemote(job) && preferences.workPreferences.includes("Remote");
      const isRelatedMatch = !role;
      const score = Math.min(100, (role ? 56 : 14) + Math.min(skills.length, 3) * 10 + (city || remoteMatch ? 2 : 0) + (remoteMatch ? 6 : 4));
      // This is only a temporary pre-resume explanation. It must not frame search preferences as professional evidence.
      const reasons = ['Professional resume evidence is being prepared.'];

      return { ...job, matchScore: score, matchExplanation: reasons[0], isRelatedMatch, preferenceAlignment: preferenceAlignment(job, preferences, city, remoteMatch) };
    })
    .sort((first, second) => {
      if (first.isRelatedMatch !== second.isRelatedMatch) return Number(first.isRelatedMatch) - Number(second.isRelatedMatch);
      if (second.matchScore !== first.matchScore) return second.matchScore - first.matchScore;
      return second.lastUpdatedAt - first.lastUpdatedAt;
    })
    .slice(0, 10);

  return suggestions.map((suggestion, index) => ({ ...suggestion, rank: index + 1 }));
}
