import { query } from './_generated/server'
import { greenhouseSources } from './greenhouseSources'
import { isAllowedAdminEmail } from './adminAccess'

async function hasAdminAccess(ctx: { auth: { getUserIdentity: () => Promise<{ email?: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity()
  const environment = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  return isAllowedAdminEmail(identity?.email, environment.process?.env?.CAREERPILOT_ADMIN_EMAIL)
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    if (!await hasAdminAccess(ctx)) throw new Error('Admin access required.')
    const runs = await ctx.db.query('sourceRuns').collect()
    const latestBySource = new Map<string, typeof runs[number]>()
    for (const run of runs) {
      const current = latestBySource.get(run.sourceToken)
      if (!current || (run.completedAt ?? 0) > (current.completedAt ?? 0)) latestBySource.set(run.sourceToken, run)
    }
    return greenhouseSources.map((source) => ({ source, run: latestBySource.get(source.token) ?? null }))
  },
})

export const isAdmin = query({
  args: {},
  handler: async (ctx) => await hasAdminAccess(ctx),
})
