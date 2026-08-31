import { createResumeBlocks, type ResumeBlock } from '../convex/ai/resumeBlocks'

export type DocxSlot = { index: number; text: string; editable: boolean }

const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g
const textPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g

function decodeXml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function isFixedSlot(text: string, index: number) {
  const value = text.trim()
  return index === 0 || !value || /^[A-Z][A-Z &/]{2,}$/.test(value) || /@|\b(?:linkedin|github|portfolio)\b|\+?\d[\d\s().-]{6,}/i.test(value)
}

export function extractSlotsFromDocumentXml(xml: string): DocxSlot[] {
  const paragraphs = xml.match(paragraphPattern) ?? []
  return paragraphs.map((paragraph, index) => {
    const text = [...paragraph.matchAll(textPattern)].map((match) => decodeXml(match[1])).join('')
    return { index, text, editable: !isFixedSlot(text, index) }
  }).filter((slot) => slot.text.trim().length > 0)
}

export function createResumeBlocksFromDocxSlots(slots: DocxSlot[]): ResumeBlock[] {
  return createResumeBlocks(slots)
}

export function replacementsAreBounded(slots: DocxSlot[], replacements: string[]) {
  if (slots.length !== replacements.length) return false
  const editableSourceLength = slots.filter((slot) => slot.editable).reduce((total, slot) => total + slot.text.length, 0)
  const editableReplacementLength = replacements.reduce((total, replacement, index) => total + (slots[index].editable ? replacement.trim().length : 0), 0)
  return replacements.every((replacement, index) => {
    const source = slots[index]
    const next = replacement.trim()
    return source.editable ? next.length > 0 && next.length <= source.text.length : next === source.text
  }) && editableReplacementLength <= editableSourceLength
}

export function describeTemplateChanges(slots: DocxSlot[], replacements: string[]) {
  return slots.flatMap((slot, index) => slot.text !== replacements[index] ? [{ before: slot.text, after: replacements[index] }] : []).slice(0, 8)
}

export function applyReplacementsToDocumentXml(xml: string, slots: DocxSlot[], replacements: string[]) {
  if (!replacementsAreBounded(slots, replacements)) throw new Error('The tailored resume could not fit safely into your original layout.')
  const replacementsByIndex = new Map(slots.map((slot, index) => [slot.index, replacements[index]]))
  let paragraphIndex = 0
  return xml.replace(paragraphPattern, (paragraph) => {
    const replacement = replacementsByIndex.get(paragraphIndex++)
    if (replacement === undefined) return paragraph
    let firstTextNode = true
    return paragraph.replace(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g, (_match, attributes = '') => {
      if (!firstTextNode) return `<w:t${attributes}></w:t>`
      firstTextNode = false
      const space = /^\s|\s$/.test(replacement) && !/xml:space=/.test(attributes) ? `${attributes} xml:space="preserve"` : attributes
      return `<w:t${space}>${escapeXml(replacement)}</w:t>`
    })
  })
}

export async function extractDocxSlots(source: ArrayBuffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(source)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('This DOCX file is missing its document content.')
  return extractSlotsFromDocumentXml(documentXml)
}

export async function patchDocxTemplate(source: ArrayBuffer, slots: DocxSlot[], replacements: string[]) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(source)
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) throw new Error('This DOCX file is missing its document content.')
  const documentXml = await documentFile.async('string')
  zip.file('word/document.xml', applyReplacementsToDocumentXml(documentXml, slots, replacements))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
