import { mutation } from './_generated/server'
import { requireOwner } from './owner'

function isLegacyOwner(ownerId: string, stableOwnerId: string) {
  return ownerId.startsWith(stableOwnerId + '|')
}

export const recoverMine = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before restoring your saved data.')

    const preferences = (await ctx.db.query('preferences').collect()).filter((item) => item.ownerId === ownerId || isLegacyOwner(item.ownerId, ownerId))
    const latestPreference = preferences.toSorted((first, second) => second.updatedAt - first.updatedAt)[0]
    for (const preference of preferences) {
      if (preference._id === latestPreference?._id) await ctx.db.patch(preference._id, { ownerId })
      else await ctx.db.delete(preference._id)
    }

    const actions = (await ctx.db.query('jobActions').collect()).filter((item) => item.ownerId === ownerId || isLegacyOwner(item.ownerId, ownerId))
    const latestActionByJob = new Map<string, typeof actions[number]>()
    for (const action of actions) {
      const current = latestActionByJob.get(action.jobId)
      if (!current || action.updatedAt > current.updatedAt) latestActionByJob.set(action.jobId, action)
    }
    for (const action of actions) {
      if (latestActionByJob.get(action.jobId)?._id === action._id) await ctx.db.patch(action._id, { ownerId })
      else await ctx.db.delete(action._id)
    }

    const schedules = (await ctx.db.query('searchSchedules').collect()).filter((item) => item.ownerId === ownerId || isLegacyOwner(item.ownerId, ownerId))
    const latestSchedule = schedules.toSorted((first, second) => second.updatedAt - first.updatedAt)[0]
    for (const schedule of schedules) {
      if (schedule._id === latestSchedule?._id) await ctx.db.patch(schedule._id, { ownerId })
      else await ctx.db.delete(schedule._id)
    }

    const records = await Promise.all([
      ctx.db.query('resumes').collect(),
      ctx.db.query('connectionImports').collect(),
      ctx.db.query('connections').collect(),
      ctx.db.query('searchRuns').collect(),
      ctx.db.query('jobSuggestions').collect(),
    ])
    let movedRecords = 0
    for (const collection of records) {
      for (const record of collection) {
        if (isLegacyOwner(record.ownerId, ownerId)) {
          await ctx.db.patch(record._id, { ownerId })
          movedRecords += 1
        }
      }
    }

    return { movedRecords, keptPreference: Boolean(latestPreference), keptSchedule: Boolean(latestSchedule) }
  },
})
