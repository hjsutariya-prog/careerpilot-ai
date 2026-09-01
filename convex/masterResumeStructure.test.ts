import { describe, expect, it } from 'vitest'
import { masterStructureUpsertArgs, parseMasterResumeStructure, structureForActiveMaster } from './masterResumeStructure'

describe('Master Resume experience structure', () => {
  const source = `PROFILE
Product details that are not part of an experience.
EXPERIENCE
Product Owner | Company A | 2022–Present
• Prioritized product backlog
• Facilitated sprint planning
• Managed releases
Business Analyst | Company B | 2019–2022
• Gathered requirements
• Supported UAT
CERTIFICATIONS
AWS experience only`

  it('groups bullets under the correct Master Resume experience in document order', () => {
    const structure = parseMasterResumeStructure({ resumeId: 'master-resume' as never, text: source })
    expect(structure.experiences).toHaveLength(2)
    expect(structure.experiences[0]).toMatchObject({
      experienceId: 'master_experience_0',
      order: 0,
      headerText: 'Product Owner | Company A | 2022–Present',
      title: 'Product Owner',
      company: 'Company A',
      dateText: '2022–Present',
    })
    expect(structure.experiences[0].blocks).toEqual([
      { blockId: 'master_experience_0_block_0', text: '• Prioritized product backlog', kind: 'experience_bullet' },
      { blockId: 'master_experience_0_block_1', text: '• Facilitated sprint planning', kind: 'experience_bullet' },
      { blockId: 'master_experience_0_block_2', text: '• Managed releases', kind: 'experience_bullet' },
    ])
    expect(structure.experiences[1]).toMatchObject({ experienceId: 'master_experience_1', order: 1, company: 'Company B', title: 'Business Analyst', dateText: '2019–2022' })
    expect(structure.experiences[1].blocks.map((block) => block.text)).toEqual(['• Gathered requirements', '• Supported UAT'])
  })

  it('keeps IDs deterministic and preserves source text exactly', () => {
    const first = parseMasterResumeStructure({ resumeId: 'master-resume' as never, text: source })
    const second = parseMasterResumeStructure({ resumeId: 'master-resume' as never, text: source })
    expect(first).toEqual(second)
    expect(first.resumeId).toBe('master-resume')
    expect(first.experiences[0].blocks[0].text).toBe('• Prioritized product backlog')
  })

  it('leaves uncertain content ungrouped instead of attaching it to an experience', () => {
    const structure = parseMasterResumeStructure({ resumeId: 'master-resume' as never, text: source })
    expect(structure.ungroupedBlocks).toEqual(expect.arrayContaining([
      { blockId: 'master_ungrouped_block_0', text: 'PROFILE', kind: 'other' },
      { blockId: 'master_ungrouped_block_1', text: 'Product details that are not part of an experience.', kind: 'other' },
      { blockId: 'master_ungrouped_block_2', text: 'EXPERIENCE', kind: 'other' },
      { blockId: 'master_ungrouped_block_3', text: 'CERTIFICATIONS', kind: 'other' },
      { blockId: 'master_ungrouped_block_4', text: 'AWS experience only', kind: 'other' },
    ]))
  })

  it('does not manufacture experience metadata for an ambiguous header', () => {
    const structure = parseMasterResumeStructure({ resumeId: 'master-resume' as never, text: 'EXPERIENCE\nPlatform work from 2022 to Present\n• Built APIs' })
    expect(structure.experiences).toEqual([])
    expect(structure.ungroupedBlocks.map((block) => block.text)).toEqual(['EXPERIENCE', 'Platform work from 2022 to Present', '• Built APIs'])
  })

  it('parses separate role/date lines and unmarked DOCX paragraphs within a confirmed experience', () => {
    const structure = parseMasterResumeStructure({
      resumeId: 'master-resume' as never,
      text: 'PROFESSIONAL EXPERIENCE\nSenior Business Analyst | Company A\nApr 2022 - Present\nLed backlog prioritization and sprint planning.\nManaged releases across two platforms.',
    })

    expect(structure.experiences).toEqual([expect.objectContaining({
      experienceId: 'master_experience_0',
      title: 'Senior Business Analyst',
      company: 'Company A',
      dateText: 'Apr 2022 - Present',
      blocks: [
        { blockId: 'master_experience_0_block_0', text: 'Led backlog prioritization and sprint planning.', kind: 'experience_bullet' },
        { blockId: 'master_experience_0_block_1', text: 'Managed releases across two platforms.', kind: 'experience_bullet' },
      ],
    })])
  })

  it('treats no active Master Resume as valid and selects only the current owner’s active structure', () => {
    const structures = [
      { ownerId: 'owner-a', sourceResumeId: 'master-old' },
      { ownerId: 'owner-a', sourceResumeId: 'master-new' },
      { ownerId: 'owner-b', sourceResumeId: 'master-new' },
    ]
    expect(structureForActiveMaster(structures, 'owner-a', null)).toBeNull()
    expect(structureForActiveMaster(structures, 'owner-a', 'master-new')).toEqual(structures[1])
    expect(structureForActiveMaster(structures, 'owner-b', 'master-old')).toBeNull()
  })

  it('creates mutation arguments compatible with the persisted structure schema', () => {
    const resumeId = 'master-resume' as never
    const structure = parseMasterResumeStructure({ resumeId, text: source })
    const args = masterStructureUpsertArgs({ ownerId: 'owner-a', resumeId, sourceHash: 'hash', text: source }, structure)

    expect(args).toEqual({ ownerId: 'owner-a', resumeId, sourceHash: 'hash', structure })
    expect(args).not.toHaveProperty('text')
    expect(args.structure.experiences[0]?.blocks[0]).toEqual({ blockId: 'master_experience_0_block_0', text: '• Prioritized product backlog', kind: 'experience_bullet' })
  })
})
