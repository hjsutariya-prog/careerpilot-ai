import { describe, expect, it } from 'vitest'
import { applyReplacementsToDocumentXml, describeTemplateChanges, extractSlotsFromDocumentXml, replacementsAreBounded } from './docxTemplate'

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
})
