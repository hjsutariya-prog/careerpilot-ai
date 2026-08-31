export type ResumePurpose = 'template' | 'master'

type ResumeRecord = {
  purpose?: ResumePurpose
  isActiveMaster?: boolean
  ownerId?: string
}

type ResumeUploadFields = {
  purpose?: ResumePurpose
  extractedText: string
}

/** Records are expected in newest-first order, matching the Convex query order. */
export function isMasterResume(resume: ResumeRecord) {
  return resume.purpose === 'master'
}

/** Existing records without a purpose predate Master Resumes and remain templates. */
export function isTemplateResume(resume: ResumeRecord) {
  return !isMasterResume(resume)
}

export function selectLatestTemplateResume<T extends ResumeRecord>(resumes: T[]) {
  return resumes.find(isTemplateResume) ?? null
}

export function selectActiveMaster<T extends ResumeRecord>(resumes: T[]) {
  return resumes.find((resume) => isMasterResume(resume) && resume.isActiveMaster === true) ?? null
}

export function activeMastersToDeactivate<T extends ResumeRecord>(resumes: T[]) {
  return resumes.filter((resume) => isMasterResume(resume) && resume.isActiveMaster === true)
}

export function createResumeRecord<T extends ResumeUploadFields>(args: T, ownerId: string, uploadedAt: number) {
  const purpose = args.purpose ?? 'template'
  return { ...args, purpose, ...(purpose === 'master' ? { isActiveMaster: true } : {}), ownerId, uploadedAt }
}

export function isOwnedResume<T extends ResumeRecord>(resume: T | null | undefined, ownerId: string) {
  return resume?.ownerId === ownerId
}
