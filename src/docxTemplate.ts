import { createResumeBlocks, type ResumeBlock, type ResumeBlockKind, type ResumeBlockSource } from '../convex/ai/resumeBlocks'
import type { TailoringMerge, TailoringReorder } from '../convex/ai/tailoringSchema'

export type DocxSlot = { index: number; text: string; editable: boolean; isBullet?: boolean }

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

function isSectionHeading(text: string) {
  return /^[A-Z][A-Z &/]{2,}$/.test(text.trim())
}

function isExperienceSectionHeading(text: string) {
  return /^(?:PROFESSIONAL |WORK )?EXPERIENCE$/i.test(text.trim())
}

function isExperienceHeader(text: string) {
  const value = text.trim()
  const hasDateRange = /\b(?:19|20)\d{2}\s*(?:[-–—]|to)\s*(?:(?:19|20)\d{2}|present|current)\b/i.test(value)
  const hasRoleCompanySeparator = /[|•·]|\bat\b|\s[-–—]\s/i.test(value)
  return hasDateRange && hasRoleCompanySeparator
}

function isBulletSlot(slot: DocxSlot) {
  return Boolean(slot.isBullet) || /^\s*(?:[•●▪◦‣⁃*-]|\d+[.)])\s+/.test(slot.text)
}

function isSkillsLine(text: string) {
  return /^\s*(?:technical\s+)?(?:skills|technologies|tools)\s*:/i.test(text)
}

function withExperienceMetadata(slots: DocxSlot[]): ResumeBlockSource[] {
  let isInExperienceSection = false
  let currentExperienceId: string | null = null
  let nextExperienceIndex = 0
  const nextBulletIndex = new Map<string, number>()

  return slots.map((slot) => {
    const text = slot.text.trim()
    let kind: ResumeBlockKind = 'other'

    if (isSectionHeading(text)) {
      isInExperienceSection = isExperienceSectionHeading(text)
      currentExperienceId = null
      kind = 'heading'
      return { text: slot.text, editable: slot.editable, kind }
    }

    if (isInExperienceSection && isExperienceHeader(text)) {
      currentExperienceId = `experience_${nextExperienceIndex++}`
      nextBulletIndex.set(currentExperienceId, 0)
      return { text: slot.text, editable: false, kind: 'experience_header', experienceId: currentExperienceId }
    }

    // A protected paragraph must never be represented as an editable experience
    // bullet. Keep it ungrouped instead, so an unusual DOCX cannot make the
    // complete tailoring request fail its block-integrity check.
    if (isInExperienceSection && currentExperienceId && slot.editable && isBulletSlot(slot)) {
      const bulletIndex = nextBulletIndex.get(currentExperienceId) ?? 0
      nextBulletIndex.set(currentExperienceId, bulletIndex + 1)
      return { text: slot.text, editable: slot.editable, kind: 'experience_bullet', experienceId: currentExperienceId, bulletIndex }
    }

    if (isSkillsLine(text)) kind = 'skills'
    return { text: slot.text, editable: slot.editable, kind }
  })
}

export function extractSlotsFromDocumentXml(xml: string): DocxSlot[] {
  const paragraphs = xml.match(paragraphPattern) ?? []
  return paragraphs.map((paragraph, index) => {
    const text = [...paragraph.matchAll(textPattern)].map((match) => decodeXml(match[1])).join('')
    const isBullet = /<w:numPr(?:\s[^>]*)?>/.test(paragraph)
    return { index, text, editable: !isFixedSlot(text, index), ...(isBullet ? { isBullet: true } : {}) }
  }).filter((slot) => slot.text.trim().length > 0)
}

export function createResumeBlocksFromDocxSlots(slots: DocxSlot[]): ResumeBlock[] {
  return createResumeBlocks(withExperienceMetadata(slots))
}

export function replacementsAreBounded(slots: DocxSlot[], replacements: string[], merges: TailoringMerge[] = []) {
  if (slots.length !== replacements.length) return false
  const mergedTargets = new Map<number, number[]>()
  const removedMergeSources = new Set<number>()
  for (const merge of merges) {
    const targetIndex = blockIndex(merge.targetBlockId)
    const sourceIndexes = merge.sourceBlockIds.map(blockIndex)
    if (targetIndex === null || sourceIndexes.some((index) => index === null) || !sourceIndexes.includes(targetIndex)) return false
    const numericSourceIndexes = sourceIndexes as number[]
    const sourceSlots = numericSourceIndexes.map((index) => slots[index])
    if (sourceSlots.some((slot) => !slot?.editable)) return false
    mergedTargets.set(targetIndex, numericSourceIndexes)
    for (const sourceIndex of numericSourceIndexes) if (sourceIndex !== targetIndex) removedMergeSources.add(sourceIndex)
  }
  const editableSourceLength = slots.filter((slot) => slot.editable).reduce((total, slot) => total + slot.text.length, 0)
  const editableReplacementLength = replacements.reduce((total, replacement, index) => total + (slots[index].editable && !removedMergeSources.has(index) ? replacement.trim().length : 0), 0)
  return replacements.every((replacement, index) => {
    const source = slots[index]
    const next = replacement.trim()
    if (removedMergeSources.has(index)) return next === source.text
    const mergeSourceSlots = mergedTargets.get(index)?.map((sourceIndex) => slots[sourceIndex])
    const maximumLength = mergeSourceSlots ? mergeSourceSlots.reduce((total, slot) => total + slot.text.length, 0) : source.text.length
    return source.editable ? next.length > 0 && next.length <= maximumLength : next === source.text
  }) && editableReplacementLength <= editableSourceLength
}

export function describeTemplateChanges(slots: DocxSlot[], replacements: string[]) {
  return slots.flatMap((slot, index) => slot.text !== replacements[index] ? [{ before: slot.text, after: replacements[index] }] : []).slice(0, 8)
}

function blockIndex(blockId: string) {
  const match = blockId.match(/^paragraph_(\d+)$/)
  return match ? Number(match[1]) : null
}

function applyBulletParagraphReorders(xml: string, slots: DocxSlot[], reorders: TailoringReorder[]) {
  if (!reorders.length) return xml
  const paragraphsByIndex = new Map<number, string>()
  let paragraphIndex = 0
  xml.replace(paragraphPattern, (paragraph) => {
    paragraphsByIndex.set(paragraphIndex++, paragraph)
    return paragraph
  })

  const reorderedParagraphs = new Map<number, string>()
  for (const reorder of reorders) {
    const reorderedSlots = reorder.blockIds.map((blockId) => {
      const index = blockIndex(blockId)
      return index === null ? null : slots[index]
    })
    if (reorderedSlots.some((slot) => !slot)) continue
    const targetSlots = [...reorderedSlots].sort((first, second) => first!.index - second!.index)
    for (let index = 0; index < targetSlots.length; index += 1) {
      const sourceParagraph = paragraphsByIndex.get(reorderedSlots[index]!.index)
      if (sourceParagraph) reorderedParagraphs.set(targetSlots[index]!.index, sourceParagraph)
    }
  }

  paragraphIndex = 0
  return xml.replace(paragraphPattern, (paragraph) => reorderedParagraphs.get(paragraphIndex++) ?? paragraph)
}

function removeMergedBulletParagraphs(xml: string, slots: DocxSlot[], merges: TailoringMerge[]) {
  if (!merges.length) return xml
  const paragraphIndexesToRemove = new Set(merges.map((merge) => merge.sourceBlockIds.find((blockId) => blockId !== merge.targetBlockId)).map((blockId) => blockId ? blockIndex(blockId) : null).filter((index): index is number => index !== null).map((index) => slots[index]?.index).filter((index): index is number => index !== undefined))
  if (!paragraphIndexesToRemove.size) return xml
  let paragraphIndex = 0
  return xml.replace(paragraphPattern, (paragraph) => paragraphIndexesToRemove.has(paragraphIndex++) ? '' : paragraph)
}

export function applyReplacementsToDocumentXml(xml: string, slots: DocxSlot[], replacements: string[], reorders: TailoringReorder[] = [], merges: TailoringMerge[] = []) {
  if (!replacementsAreBounded(slots, replacements, merges)) throw new Error('The tailored resume could not fit safely into your original layout.')
  const replacementsByIndex = new Map(slots.map((slot, index) => [slot.index, replacements[index]]))
  let paragraphIndex = 0
  const replacedXml = xml.replace(paragraphPattern, (paragraph) => {
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
  return removeMergedBulletParagraphs(applyBulletParagraphReorders(replacedXml, slots, reorders), slots, merges)
}

export async function extractDocxSlots(source: ArrayBuffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(source)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('This DOCX file is missing its document content.')
  return extractSlotsFromDocumentXml(documentXml)
}

export async function patchDocxTemplate(source: ArrayBuffer, slots: DocxSlot[], replacements: string[], reorders: TailoringReorder[] = [], merges: TailoringMerge[] = []) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(source)
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) throw new Error('This DOCX file is missing its document content.')
  const documentXml = await documentFile.async('string')
  zip.file('word/document.xml', applyReplacementsToDocumentXml(documentXml, slots, replacements, reorders, merges))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
