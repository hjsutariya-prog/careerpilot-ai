import type { ResumeBlock } from './resumeBlocks'
import type { TailoringReorder } from './tailoringSchema'

export type RejectedTailoringReorderReason =
  | 'unknown_experience'
  | 'unknown_reorder_block'
  | 'reorder_crosses_experiences'
  | 'reorder_contains_non_bullet'
  | 'reorder_duplicate_block'
  | 'reorder_missing_block'
  | 'reorder_extra_block'
  | 'reorder_is_noop'
  | 'duplicate_experience_reorder'

export type RejectedTailoringReorder = {
  experienceId: string
  blockIds: string[]
  reason: RejectedTailoringReorderReason
}

export type TailoringReorderValidationResult = {
  acceptedReorders: TailoringReorder[]
  rejectedReorders: RejectedTailoringReorder[]
}

export type TailoringReorderValidationInput = {
  reorders?: TailoringReorder[]
  resumeBlocks: ResumeBlock[]
}

function experienceBulletsById(blocks: ResumeBlock[]) {
  const groups = new Map<string, ResumeBlock[]>()
  for (const block of blocks) {
    if (block.kind !== 'experience_bullet' || !block.experienceId) continue
    const bullets = groups.get(block.experienceId) ?? []
    bullets.push(block)
    groups.set(block.experienceId, bullets)
  }
  for (const bullets of groups.values()) bullets.sort((first, second) => first.bulletIndex! - second.bulletIndex!)
  return groups
}

function sameOrder(first: string[], second: string[]) {
  return first.length === second.length && first.every((blockId, index) => blockId === second[index])
}

export function validateTailoringReorders(input: TailoringReorderValidationInput): TailoringReorderValidationResult {
  const blocksById = new Map(input.resumeBlocks.map((block) => [block.blockId, block]))
  const bulletsByExperience = experienceBulletsById(input.resumeBlocks)
  const seenExperienceIds = new Set<string>()
  const acceptedReorders: TailoringReorder[] = []
  const rejectedReorders: RejectedTailoringReorder[] = []

  for (const reorder of input.reorders ?? []) {
    const rejected = (reason: RejectedTailoringReorderReason) => {
      rejectedReorders.push({ experienceId: reorder.experienceId, blockIds: [...reorder.blockIds], reason })
    }

    if (seenExperienceIds.has(reorder.experienceId)) {
      rejected('duplicate_experience_reorder')
      continue
    }
    seenExperienceIds.add(reorder.experienceId)

    const expectedBullets = bulletsByExperience.get(reorder.experienceId)
    if (!expectedBullets?.length) {
      rejected('unknown_experience')
      continue
    }

    const providedBlockIds = new Set<string>()
    let invalid = false
    for (const blockId of reorder.blockIds) {
      if (providedBlockIds.has(blockId)) {
        rejected('reorder_duplicate_block')
        invalid = true
        break
      }
      providedBlockIds.add(blockId)
      const block = blocksById.get(blockId)
      if (!block) {
        rejected('unknown_reorder_block')
        invalid = true
        break
      }
      if (block.kind !== 'experience_bullet') {
        rejected('reorder_contains_non_bullet')
        invalid = true
        break
      }
      if (block.experienceId !== reorder.experienceId) {
        rejected('reorder_crosses_experiences')
        invalid = true
        break
      }
    }
    if (invalid) continue

    const expectedBlockIds = expectedBullets.map((block) => block.blockId)
    const expectedBlockIdSet = new Set(expectedBlockIds)
    if (reorder.blockIds.some((blockId) => !expectedBlockIdSet.has(blockId))) {
      rejected('reorder_extra_block')
      continue
    }
    if (expectedBlockIds.some((blockId) => !providedBlockIds.has(blockId))) {
      rejected('reorder_missing_block')
      continue
    }
    if (sameOrder(reorder.blockIds, expectedBlockIds)) {
      rejected('reorder_is_noop')
      continue
    }

    acceptedReorders.push({ experienceId: reorder.experienceId, blockIds: [...reorder.blockIds] })
  }

  return { acceptedReorders, rejectedReorders }
}
