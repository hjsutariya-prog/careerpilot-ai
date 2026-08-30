import type { GreenhouseSource } from "./greenhouseSources";

export type GreenhouseApiJob = {
  id: number | string;
  title: string;
  updated_at: string;
  absolute_url: string;
  location?: { name?: string | null } | null;
  content?: string | null;
};

export type NormalizedGreenhouseJob = {
  sourceToken: string;
  externalJobId: string;
  title: string;
  companyName: string;
  normalizedCompany: string;
  locationLabel: string;
  cities: string[];
  description: string;
  skills: string[];
  applyUrl: string;
  lastUpdatedAt: number;
  lastSeenAt: number;
  isIndiaItRole: true;
};

const indiaPattern = /\bindia\b|\bbengaluru\b|\bbangalore\b|\bhyderabad\b|\bpune\b|\bmumbai\b|\bchennai\b|\bkolkata\b|\bahmedabad\b|\bdelhi\b|\bgurugram\b|\bgurgaon\b|\bnoida\b/i;
const itRolePattern = /\b(engineer|engineering|developer|software|data|product|analyst|designer|design|devops|cloud|security|qa|sdet|technical|machine learning|artificial intelligence|ai)\b/i;
const excludedRolePattern = /\b(recruiter|recruiting|talent|human resources|hr|sales|marketing|finance|legal|procurement|account executive|customer success)\b/i;
const skillCandidates = ["TypeScript", "JavaScript", "React", "Node.js", "Python", "Java", "Go", "SQL", "AWS", "Azure", "GCP", "Kubernetes", "Docker", "Terraform", "Machine Learning", "Data Engineering", "Product Management", "Figma", "Tableau"];

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stripHtml(value: string) {
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decoded
      .replace(/&nbsp;/gi, " ")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&");
  }
  return decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function citiesFromLocation(location: string) {
  const cityMatches: Array<[RegExp, string]> = [
    [/\bbengaluru\b|\bbangalore\b/i, "Bengaluru"],
    [/\bmumbai\b/i, "Mumbai"],
    [/\bhyderabad\b/i, "Hyderabad"],
    [/\bchennai\b/i, "Chennai"],
    [/\bpune\b/i, "Pune"],
    [/\bkolkata\b/i, "Kolkata"],
    [/\bahmedabad\b/i, "Ahmedabad"],
    [/\bdelhi\b|\bgurugram\b|\bgurgaon\b|\bnoida\b/i, "Delhi NCR"],
  ];
  return cityMatches.filter(([pattern]) => pattern.test(location)).map(([, city]) => city);
}

function skillsFromText(value: string) {
  const searchable = normalise(value);
  return skillCandidates.filter((skill) => searchable.includes(normalise(skill)));
}

export function normalizeGreenhouseJob(source: GreenhouseSource, job: GreenhouseApiJob, observedAt: number): NormalizedGreenhouseJob | null {
  const locationLabel = job.location?.name?.trim() ?? "";
  const description = stripHtml(job.content ?? "");
  const lastUpdatedAt = Date.parse(job.updated_at);

  if (!job.title.trim() || !locationLabel || !indiaPattern.test(locationLabel)) return null;
  if (!itRolePattern.test(job.title) || excludedRolePattern.test(job.title)) return null;
  if (!job.absolute_url.startsWith("https://") || !Number.isFinite(lastUpdatedAt)) return null;

  return {
    sourceToken: source.token,
    externalJobId: String(job.id),
    title: job.title.trim(),
    companyName: source.companyName,
    normalizedCompany: normalise(source.companyName),
    locationLabel,
    cities: citiesFromLocation(locationLabel),
    description,
    skills: skillsFromText(`${job.title} ${description}`),
    applyUrl: job.absolute_url,
    lastUpdatedAt,
    lastSeenAt: observedAt,
    isIndiaItRole: true,
  };
}
