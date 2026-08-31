export type ResumeBlockKind =
  | 'heading'
  | 'experience_header'
  | 'experience_bullet'
  | 'skills'
  | 'summary'
  | 'other'

export type ResumeBlock = {
  blockId: string
  index: number
  text: string
  editable: boolean
  kind?: ResumeBlockKind
  experienceId?: string
  bulletIndex?: number
}

export type ResumeBlockSource = Pick<ResumeBlock, 'text' | 'editable' | 'kind' | 'experienceId' | 'bulletIndex'>

const resumeBlockKinds = new Set<ResumeBlockKind>([
  'heading',
  'experience_header',
  'experience_bullet',
  'skills',
  'summary',
  'other',
])

const experienceIdPattern = /^experience_(0|[1-9]\d*)$/

export function resumeBlockId(index: number) {
  return `paragraph_${index}`
}

export function createResumeBlocks(slots: ResumeBlockSource[]): ResumeBlock[] {
  return slots.map((slot, index) => ({
    blockId: resumeBlockId(index),
    index,
    text: slot.text,
    editable: slot.editable,
    ...(slot.kind ? { kind: slot.kind } : {}),
    ...(slot.experienceId ? { experienceId: slot.experienceId } : {}),
    ...(slot.bulletIndex !== undefined ? { bulletIndex: slot.bulletIndex } : {}),
  }))
}

export function areResumeBlocksConsistent(blocks: ResumeBlock[]) {
  const blockIds = new Set<string>()
  const experienceHeaders = new Map<string, number>()
  const experienceBullets = new Map<string, Array<{ index: number; bulletIndex: number }>>()
  const blocksAreValid = blocks.every((block, position) => {
    if (!Number.isInteger(block.index) || block.index !== position || block.blockId !== resumeBlockId(block.index) || blockIds.has(block.blockId)) return false
    blockIds.add(block.blockId)

    if (block.kind !== undefined && !resumeBlockKinds.has(block.kind)) return false
    const hasExperienceId = block.experienceId !== undefined
    const hasBulletIndex = block.bulletIndex !== undefined
    if (hasExperienceId && !experienceIdPattern.test(block.experienceId!)) return false
    if (hasBulletIndex && (!Number.isInteger(block.bulletIndex) || block.bulletIndex! < 0)) return false

    if (block.kind === 'experience_header') {
      if (block.editable || !hasExperienceId || hasBulletIndex || experienceHeaders.has(block.experienceId!)) return false
      experienceHeaders.set(block.experienceId!, block.index)
    } else if (block.kind === 'experience_bullet') {
      if (!block.editable || !hasExperienceId || !hasBulletIndex) return false
      const bullets = experienceBullets.get(block.experienceId!) ?? []
      bullets.push({ index: block.index, bulletIndex: block.bulletIndex! })
      experienceBullets.set(block.experienceId!, bullets)
    } else if (hasExperienceId || hasBulletIndex) {
      return false
    }

    return true
  })
  if (!blocksAreValid) return false

  const orderedHeaders = [...experienceHeaders.entries()].sort(([, firstIndex], [, secondIndex]) => firstIndex - secondIndex)
  if (!orderedHeaders.every(([experienceId], index) => experienceId === `experience_${index}`)) return false

  return orderedHeaders.every(([experienceId, headerIndex], experiencePosition) => {
    const bullets = experienceBullets.get(experienceId) ?? []
    const nextHeaderIndex = orderedHeaders[experiencePosition + 1]?.[1] ?? Number.POSITIVE_INFINITY
    if (bullets.some((bullet) => bullet.index <= headerIndex || bullet.index >= nextHeaderIndex)) return false
    return bullets.every((bullet, index) => bullet.bulletIndex === index && (index === 0 || bullets[index - 1].index < bullet.index))
  }) && [...experienceBullets.entries()].every(([experienceId, bullets]) => {
    const headerIndex = experienceHeaders.get(experienceId)
    if (headerIndex === undefined || bullets.some((bullet) => bullet.index <= headerIndex)) return false
    return bullets.every((bullet, index) => bullet.bulletIndex === index && (index === 0 || bullets[index - 1].index < bullet.index))
  })
}
