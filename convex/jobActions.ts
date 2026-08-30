import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireOwner } from './owner'

const statusValidator = v.union(v.literal('Apply'), v.literal('Reject'), v.literal('On Hold'), v.literal('Resume shortlisted'), v.literal('Interview'))

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before updating a job action.')
    return await ctx.db
      .query('jobActions')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .collect()
  },
})

export const save = mutation({
  args: { jobId: v.string(), status: statusValidator },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before updating a job action.')
    const existing = await ctx.db
      .query('jobActions')
      .withIndex('by_owner_job', (q) => q.eq('ownerId', ownerId).eq('jobId', args.jobId))
      .unique()
    const record = { ...args, ownerId, updatedAt: Date.now() }

    if (existing) {
      await ctx.db.patch(existing._id, record)
      return existing._id
    }

    return await ctx.db.insert('jobActions', record)
  },
})
