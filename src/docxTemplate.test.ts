import { describe, expect, it } from 'vitest'
import { applyReplacementsToDocumentXml, createResumeBlocksFromDocxSlots, describeTemplateChanges, extractSlotsFromDocumentXml, replacementsAreBounded } from './docxTemplate'

const xml = '<w:document><w:body><w:p><w:r><w:t>PRIYA SHAH</w:t></w:r></w:p><w:p><w:r><w:t>Built React dashboards</w:t></w:r></w:p><w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p></w:body></w:document>'

describe('DOCX template patching', () => {
  it('keeps headings fixed and replaces only text inside the existing paragraph', () => {
    const slots = extractSlotsFromDocumentXml(xml)
    expect(slots).toEqual([
      { index: 0, text: 'PRIYA SHAH', editable: false },
      { index: 1, text: 'Built React dashboards', editable: true },
      { index: 2, text: 'EXPERIENCE', editable: false },
    ])
    const patched = applyReplacementsToDocumentXml(xml, slots, ['PRIYA SHAH', 'Built React tools', 'EXPERIENCE'])
    expect(patched).toContain('<w:t>Built React tools</w:t>')
    expect((patched.match(/<w:p>/g) ?? [])).toHaveLength(3)
  })

  it('rejects a replacement that could expand the original layout', () => {
    const slots = extractSlotsFromDocumentXml(xml)
    expect(replacementsAreBounded(slots, ['PRIYA SHAH', 'Built React dashboards for a large enterprise platform', 'EXPERIENCE'])).toBe(false)
  })

  it('lists only the lines that changed for the private application summary', () => {
    const slots = extractSlotsFromDocumentXml(xml)
    expect(describeTemplateChanges(slots, ['PRIYA SHAH', 'Built React tools', 'EXPERIENCE'])).toEqual([{ before: 'Built React dashboards', after: 'Built React tools' }])
  })

  it('groups only confident bullets under deterministic experience headers', () => {
    const slots = [
      { index: 0, text: 'EXPERIENCE', editable: false },
      { index: 1, text: 'Product Owner | Company A | 2022–Present', editable: true },
      { index: 2, text: '• Prioritized product backlog', editable: true },
      { index: 3, text: '• Facilitated sprint planning', editable: true },
      { index: 4, text: '• Managed releases', editable: true },
      { index: 5, text: 'Business Analyst | Company B | 2019–2022', editable: true },
      { index: 6, text: '• Gathered business requirements', editable: true },
      { index: 7, text: '• Supported UAT', editable: true },
    ]

    const first = createResumeBlocksFromDocxSlots(slots)
    const second = createResumeBlocksFromDocxSlots(slots)

    expect(first).toEqual(second)
    expect(first.map((block) => block.blockId)).toEqual(['paragraph_0', 'paragraph_1', 'paragraph_2', 'paragraph_3', 'paragraph_4', 'paragraph_5', 'paragraph_6', 'paragraph_7'])
    expect(first[1]).toMatchObject({ kind: 'experience_header', experienceId: 'experience_0', editable: false })
    expect(first[5]).toMatchObject({ kind: 'experience_header', experienceId: 'experience_1', editable: false })
    expect(first.filter((block) => block.kind === 'experience_bullet')).toMatchObject([
      { blockId: 'paragraph_2', experienceId: 'experience_0', bulletIndex: 0 },
      { blockId: 'paragraph_3', experienceId: 'experience_0', bulletIndex: 1 },
      { blockId: 'paragraph_4', experienceId: 'experience_0', bulletIndex: 2 },
      { blockId: 'paragraph_6', experienceId: 'experience_1', bulletIndex: 0 },
      { blockId: 'paragraph_7', experienceId: 'experience_1', bulletIndex: 1 },
    ])
  })

  it('leaves uncertain paragraphs ungrouped', () => {
    const blocks = createResumeBlocksFromDocxSlots([
      { index: 0, text: 'EXPERIENCE', editable: false },
      { index: 1, text: 'Worked on business analysis initiatives', editable: true },
      { index: 2, text: '• Gathered business requirements', editable: true },
    ])

    expect(blocks).toMatchObject([
      { kind: 'heading', editable: false },
      { kind: 'other', editable: true },
      { kind: 'other', editable: true },
    ])
    expect(blocks.some((block) => block.experienceId !== undefined)).toBe(false)
  })

  it('recognizes Word numbered bullets without changing the extracted paragraph text', () => {
    const numberedXml = '<w:document><w:body><w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p><w:p><w:r><w:t>Product Owner | Company A | 2022–Present</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Prioritized product backlog</w:t></w:r></w:p></w:body></w:document>'
    const slots = extractSlotsFromDocumentXml(numberedXml)
    expect(slots[2]).toEqual({ index: 2, text: 'Prioritized product backlog', editable: true, isBullet: true })
    expect(createResumeBlocksFromDocxSlots(slots)[2]).toMatchObject({ kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 })
  })

  it('keeps protected bullet-like paragraphs ungrouped so they cannot invalidate tailoring blocks', () => {
    const blocks = createResumeBlocksFromDocxSlots([
      { index: 0, text: 'EXPERIENCE', editable: false },
      { index: 1, text: 'Product Owner | Company A | 2022–Present', editable: true },
      { index: 2, text: '• OWNED RELEASE MANAGEMENT', editable: false },
      { index: 3, text: '• Facilitated sprint planning', editable: true },
    ])

    expect(blocks[2]).toMatchObject({ kind: 'other', editable: false })
    expect(blocks[2]?.experienceId).toBeUndefined()
    expect(blocks[3]).toMatchObject({ kind: 'experience_bullet', experienceId: 'experience_0', bulletIndex: 0 })
  })

  it('moves complete existing bullet paragraphs without changing their formatting or text', () => {
    const bulletXml = '<w:document><w:body><w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p><w:p><w:r><w:t>Product Owner | Company A | 2022–Present</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Coordinated stakeholders</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>Managed releases</w:t></w:r></w:p></w:body></w:document>'
    const slots = extractSlotsFromDocumentXml(bulletXml)
    const reordered = applyReplacementsToDocumentXml(
      bulletXml,
      slots,
      slots.map((slot) => slot.text),
      [{ experienceId: 'experience_0', blockIds: ['paragraph_3', 'paragraph_2'] }],
    )

    expect(reordered.indexOf('Managed releases')).toBeLessThan(reordered.indexOf('Coordinated stakeholders'))
    expect(reordered).toContain('<w:rPr><w:i/></w:rPr><w:t>Managed releases</w:t>')
    expect(reordered).toContain('<w:rPr><w:b/></w:rPr><w:t>Coordinated stakeholders</w:t>')
    expect((reordered.match(/<w:numPr>/g) ?? [])).toHaveLength(2)
  })

  it('keeps target formatting and removes exactly one source paragraph for an accepted merge', () => {
    const mergeXml = '<w:document><w:body><w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p><w:p><w:r><w:t>Product Owner | Company A | 2022–Present</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Backlog planning</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>Release planning</w:t></w:r></w:p></w:body></w:document>'
    const slots = extractSlotsFromDocumentXml(mergeXml)
    const replacements = [...slots.map((slot) => slot.text)]
    replacements[2] = 'Backlog and release planning'
    const merged = applyReplacementsToDocumentXml(
      mergeXml,
      slots,
      replacements,
      [],
      [{ experienceId: 'experience_0', sourceBlockIds: ['paragraph_2', 'paragraph_3'], targetBlockId: 'paragraph_2', text: 'Backlog and release planning' }],
    )

    expect(merged).toContain('<w:rPr><w:b/></w:rPr><w:t>Backlog and release planning</w:t>')
    expect(merged).not.toContain('Release planning</w:t>')
    expect((merged.match(/<w:p>/g) ?? [])).toHaveLength(3)
  })
})
