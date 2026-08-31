import { v } from 'convex/values'
import { query } from './_generated/server'
import { requireOwner } from './owner'
import { selectActiveMaster, selectLatestTemplateResume } from './resumeRecords'
import { areResumeBlocksConsistent, type ResumeBlock } from './ai/resumeBlocks'
import { matchTemplateExperiencesToMaster, templateExperiencesFromBlocks } from './ai/experienceMatching'

const resumeBlockValidator = v.object({
  blockId: v.string(),
  index: v.number(),
  text: v.string(),
  editable: v.boolean(),
  kind: v.optional(v.union(v.literal('heading'), v.literal('experience_header'), v.literal('experience_bullet'), v.literal('skills'), v.literal('summary'), v.literal('other'))),
  experienceId: v.optional(v.string()),
  bulletIndex: v.optional(v.number()),
})

/**
 * Derives matching on demand instead of caching it. The input blocks are the current template's
 * structural metadata, while the only Master structure loaded is the authenticated user's active one.
 */
export const matchMine = query({
  args: { templateBlocks: v.array(resumeBlockValidator) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before matching resume experience.')
    const blocks = args.templateBlocks as ResumeBlock[]
    if (!areResumeBlocksConsistent(blocks)) throw new Error('The resume blocks are invalid. Please refresh and try again.')

    const resumes = await ctx.db.query('resumes').withIndex('by_owner', (query) => query.eq('ownerId', ownerId)).order('desc').collect()
    // This confirms there is a current template owned by the caller. The caller-provided blocks only
    // describe that template's DOCX structure; they cannot select another user's source resume.
    if (!selectLatestTemplateResume(resumes)) throw new Error('Please upload a template resume before matching experience.')
    const templateExperiences = templateExperiencesFromBlocks(blocks)
    const master = selectActiveMaster(resumes)
    if (!master) return matchTemplateExperiencesToMaster(templateExperiences, [])

    const record = await ctx.db
      .query('masterResumeStructures')
      .withIndex('by_owner_resume', (query) => query.eq('ownerId', ownerId).eq('sourceResumeId', master._id))
      .first()

    return matchTemplateExperiencesToMaster(templateExperiences, record?.structure.experiences ?? [])
  },
})
