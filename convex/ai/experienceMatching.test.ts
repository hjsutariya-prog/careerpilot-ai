import { describe, expect, it } from 'vitest'
import type { MasterExperience } from '../masterResumeStructure'
import { getMatchedMasterExperienceForTemplate, matchTemplateExperiencesToMaster, normalizeCompanyName, normalizeTitle, parseEmploymentRange, templateExperiencesFromBlocks, type TemplateExperience } from './experienceMatching'
import type { ResumeBlock } from './resumeBlocks'

const template = (experienceId: string, order: number, headerText: string): TemplateExperience => {
  const [title, company, dateText] = headerText.split('|').map((part) => part.trim())
  return { experienceId, order, headerText, title, company, dateText }
}

const master = (experienceId: string, order: number, headerText: string): MasterExperience => {
  const [title, company, dateText] = headerText.split('|').map((part) => part.trim())
  return { experienceId, order, headerText, title, company, dateText, blocks: [] }
}

describe('deterministic Template Resume to Master Resume experience matching', () => {
  it('matches exact company, title, and overlapping employment dates', () => {
    const result = matchTemplateExperiencesToMaster(
      [template('experience_0', 0, 'Senior Business Analyst | Company A | Jan 2022 – Present'), template('experience_1', 1, 'Business Analyst | Company B | 2019–2022')],
      [master('master_experience_0', 0, 'Senior Business Analyst | Company A Pvt Ltd | 2022–Present'), master('master_experience_1', 1, 'Business Analyst | Company B | 2019–2022')],
    )
    expect(result.matches).toEqual([
      expect.objectContaining({ templateExperienceId: 'experience_0', masterExperienceId: 'master_experience_0', matchedBy: expect.arrayContaining(['company', 'date_overlap', 'title']) }),
      expect.objectContaining({ templateExperienceId: 'experience_1', masterExperienceId: 'master_experience_1' }),
    ])
  })

  it('normalises only safe company legal suffixes and Sr/Senior titles', () => {
    expect(normalizeCompanyName('ABC Technologies Pvt. Ltd.')).toBe('abc technologies')
    expect(normalizeCompanyName('ABC Consulting')).not.toBe(normalizeCompanyName('ABC'))
    expect(normalizeTitle('Sr. Business Analyst')).toBe(normalizeTitle('Senior Business Analyst'))
  })

  it('does not falsely match the same company when parseable employment dates do not overlap', () => {
    const result = matchTemplateExperiencesToMaster(
      [template('experience_0', 0, 'Business Analyst | Company A | 2019–2020')],
      [master('master_experience_0', 0, 'Business Analyst | Company A | 2022–Present')],
    )
    expect(result.matches).toEqual([])
    expect(result.unmatchedTemplateExperienceIds).toEqual(['experience_0'])
  })

  it('uses exact title and dates to distinguish two roles at the same company', () => {
    const result = matchTemplateExperiencesToMaster(
      [template('experience_0', 0, 'Senior Business Analyst | Company A | 2022–Present'), template('experience_1', 1, 'Business Analyst | Company A | 2019–2022')],
      [master('master_experience_0', 0, 'Senior Business Analyst | Company A Ltd | 2022–Present'), master('master_experience_1', 1, 'Business Analyst | Company A | 2019–2022')],
    )
    expect(result.matches.map((match) => [match.templateExperienceId, match.masterExperienceId])).toEqual([
      ['experience_0', 'master_experience_0'],
      ['experience_1', 'master_experience_1'],
    ])
  })

  it('does not create a match for unrelated companies or chronology alone', () => {
    const result = matchTemplateExperiencesToMaster(
      [template('experience_0', 0, 'Business Analyst | Company A | 2022–Present')],
      [master('master_experience_0', 0, 'Business Analyst | Company B | 2022–Present')],
    )
    expect(result.matches).toEqual([])
  })

  it('leaves ambiguous candidates unmatched and keeps matching one-to-one', () => {
    const result = matchTemplateExperiencesToMaster(
      [template('experience_0', 0, 'Business Analyst | Company A | 2022–Present'), template('experience_1', 1, 'Business Analyst | Company A | 2022–Present')],
      [master('master_experience_0', 0, 'Business Analyst | Company A | 2022–Present')],
    )
    expect(result.matches).toEqual([])
    expect(result.unmatchedTemplateExperienceIds).toEqual(['experience_0', 'experience_1'])
    expect(result.unmatchedMasterExperienceIds).toEqual(['master_experience_0'])
  })

  it('derives template identities only from locked experience headers and keeps IDs independent', () => {
    const blocks: ResumeBlock[] = [
      { blockId: 'paragraph_0', index: 0, text: 'EXPERIENCE', editable: false, kind: 'heading' },
      { blockId: 'paragraph_1', index: 1, text: 'Product Owner | Company A | 2022–Present', editable: false, kind: 'experience_header', experienceId: 'experience_0' },
      { blockId: 'paragraph_2', index: 2, text: '• Prioritized backlog', editable: true, kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 },
    ]
    expect(templateExperiencesFromBlocks(blocks)).toEqual([expect.objectContaining({ experienceId: 'experience_0', company: 'Company A', title: 'Product Owner' })])
  })

  it('treats no Master Resume as a normal zero-match result and exposes only the matched experience', () => {
    const templates = [template('experience_0', 0, 'Business Analyst | Company A | 2022–Present')]
    const noMaster = matchTemplateExperiencesToMaster(templates, [])
    expect(noMaster).toEqual({ matches: [], unmatchedTemplateExperienceIds: ['experience_0'], unmatchedMasterExperienceIds: [] })

    const masterExperience = master('master_experience_0', 0, 'Business Analyst | Company A | 2022–Present')
    const result = matchTemplateExperiencesToMaster(templates, [masterExperience])
    expect(getMatchedMasterExperienceForTemplate(result, 'experience_0', [masterExperience])).toBe(masterExperience)
    expect(getMatchedMasterExperienceForTemplate(result, 'experience_1', [masterExperience])).toBeNull()
  })

  it('derives the current result from the active Master structure without retaining a stale replacement', () => {
    const templates = [template('experience_0', 0, 'Business Analyst | Company A | 2022–Present')]
    const previousMaster = [master('master_experience_0', 0, 'Business Analyst | Company B | 2022–Present')]
    const replacementMaster = [master('master_experience_0', 0, 'Business Analyst | Company A Ltd | 2022–Present')]
    expect(matchTemplateExperiencesToMaster(templates, previousMaster).matches).toEqual([])
    expect(matchTemplateExperiencesToMaster(templates, replacementMaster).matches).toEqual([
      expect.objectContaining({ templateExperienceId: 'experience_0', masterExperienceId: 'master_experience_0' }),
    ])
  })

  it('parses years and months conservatively for date-overlap checks', () => {
    expect(parseEmploymentRange('Jan 2022 – Present')).toEqual({ startMonth: 2022 * 12, endMonth: 9999 * 12 + 11 })
    expect(parseEmploymentRange('experience since 2022')).toBeNull()
  })
})
