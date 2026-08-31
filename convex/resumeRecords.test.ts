import { describe, expect, it } from 'vitest'
import { activeMastersToDeactivate, createResumeRecord, isMasterResume, isOwnedResume, isTemplateResume, selectActiveMaster, selectLatestTemplateResume } from './resumeRecords'

describe('resume record helpers', () => {
  const legacyTemplate = { _id: 'legacy', ownerId: 'owner-a' }
  const template = { _id: 'template', ownerId: 'owner-a', purpose: 'template' as const }
  const inactiveMaster = { _id: 'master-old', ownerId: 'owner-a', purpose: 'master' as const, isActiveMaster: false }
  const activeMaster = { _id: 'master-new', ownerId: 'owner-a', purpose: 'master' as const, isActiveMaster: true }

  it('keeps existing records without a purpose as normal templates', () => {
    expect(isTemplateResume(legacyTemplate)).toBe(true)
    expect(isMasterResume(legacyTemplate)).toBe(false)
  })

  it('selects a template even when a newer master resume exists', () => {
    expect(selectLatestTemplateResume([activeMaster, template, legacyTemplate])).toBe(template)
    expect(selectLatestTemplateResume([activeMaster])).toBeNull()
  })

  it('returns zero master state as valid and selects only the active master', () => {
    expect(selectActiveMaster([template, legacyTemplate])).toBeNull()
    expect(selectActiveMaster([activeMaster, inactiveMaster])).toBe(activeMaster)
  })

  it('models master replacement by leaving only the latest master active', () => {
    expect(selectActiveMaster([{ ...activeMaster, isActiveMaster: false }, inactiveMaster])).toBeNull()
    expect(selectActiveMaster([activeMaster, inactiveMaster])).toBe(activeMaster)
    expect(activeMastersToDeactivate([activeMaster, inactiveMaster])).toEqual([activeMaster])
  })

  it('stores extracted text and marks a Master Resume active at upload time', () => {
    expect(createResumeRecord({ purpose: 'master', extractedText: 'Complete career history' }, 'owner-a', 123)).toMatchObject({
      purpose: 'master',
      isActiveMaster: true,
      extractedText: 'Complete career history',
      ownerId: 'owner-a',
      uploadedAt: 123,
    })
  })

  it('keeps access scoped to the resume owner', () => {
    expect(isOwnedResume(activeMaster, 'owner-a')).toBe(true)
    expect(isOwnedResume(activeMaster, 'owner-b')).toBe(false)
    expect(isOwnedResume(null, 'owner-a')).toBe(false)
  })
})
