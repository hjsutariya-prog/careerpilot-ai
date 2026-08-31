export type ResumeBlock = {
  blockId: string
  index: number
  text: string
  editable: boolean
}

type ResumeBlockSource = Pick<ResumeBlock, 'text' | 'editable'>

export function resumeBlockId(index: number) {
  return `paragraph_${index}`
}

export function createResumeBlocks(slots: ResumeBlockSource[]): ResumeBlock[] {
  return slots.map((slot, index) => ({ blockId: resumeBlockId(index), index, text: slot.text, editable: slot.editable }))
}

export function areResumeBlocksConsistent(blocks: ResumeBlock[]) {
  const blockIds = new Set<string>()
  return blocks.every((block, position) => {
    if (!Number.isInteger(block.index) || block.index !== position || block.blockId !== resumeBlockId(block.index) || blockIds.has(block.blockId)) return false
    blockIds.add(block.blockId)
    return true
  })
}
