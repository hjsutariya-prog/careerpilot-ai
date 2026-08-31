import { internalMutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireOwner } from './owner'

export const TAILORED_RESUME_CREDIT_COST = 20
export const CREDIT_RESERVATION_MS = 15 * 60 * 1000
export const WELCOME_CREDIT_AMOUNT = 40
export const WELCOME_CREDIT_REFERENCE = 'welcome-credits-v1'

export type CreditEntry = { amount: number; status: 'completed' | 'reserved' | 'released'; expiresAt?: number; referenceId?: string }

export function availableCredits(entries: readonly CreditEntry[], now = Date.now()) {
  return entries.reduce((total, entry) => total + (entry.status === 'released' || (entry.status === 'reserved' && entry.expiresAt !== undefined && entry.expiresAt <= now) ? 0 : entry.amount), 0)
}

export function canStartTailoring(entries: readonly CreditEntry[], now = Date.now()) {
  return availableCredits(entries, now) >= TAILORED_RESUME_CREDIT_COST
}

export function withWelcomeCredits(entries: readonly CreditEntry[]) {
  return entries.some((entry) => entry.referenceId === WELCOME_CREDIT_REFERENCE)
    ? [...entries]
    : [...entries, { amount: WELCOME_CREDIT_AMOUNT, status: 'completed' as const, referenceId: WELCOME_CREDIT_REFERENCE }]
}

async function releaseExpired(ctx: { db: any }, ownerId: string, now: number) {
  const entries = await ctx.db.query('creditLedger').withIndex('by_owner', (q: any) => q.eq('ownerId', ownerId)).collect()
  for (const entry of entries) {
    if (entry.status === 'reserved' && entry.expiresAt !== undefined && entry.expiresAt <= now) await ctx.db.patch(entry._id, { status: 'released' })
  }
  return entries
}

async function grantWelcomeCredits(ctx: { db: any }, ownerId: string, now: number, entries: any[]) {
  const existing = await ctx.db.query('creditLedger').withIndex('by_owner_reference', (q: any) => q.eq('ownerId', ownerId).eq('referenceId', WELCOME_CREDIT_REFERENCE)).first()
  if (existing) return entries
  await ctx.db.insert('creditLedger', { ownerId, amount: WELCOME_CREDIT_AMOUNT, kind: 'grant', status: 'completed', referenceId: WELCOME_CREDIT_REFERENCE, createdAt: now })
  return [...entries, { amount: WELCOME_CREDIT_AMOUNT, status: 'completed' as const, referenceId: WELCOME_CREDIT_REFERENCE }]
}

export const balanceMine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before viewing credits.')
    const entries = await ctx.db.query('creditLedger').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).collect()
    return { available: availableCredits(withWelcomeCredits(entries)), tailoringCost: TAILORED_RESUME_CREDIT_COST }
  },
})

export const reserve = internalMutation({
  args: { ownerId: v.string(), referenceId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now()
    const releasedEntries = await releaseExpired(ctx, args.ownerId, now)
    const entries = await grantWelcomeCredits(ctx, args.ownerId, now, releasedEntries)
    const current = await ctx.db.query('creditLedger').withIndex('by_owner_reference', (q) => q.eq('ownerId', args.ownerId).eq('referenceId', args.referenceId)).first()
    if (current && current.status !== 'released') return { reservationId: current._id, available: availableCredits(entries, now) }
    if (!canStartTailoring(entries, now)) throw new Error(`You need ${TAILORED_RESUME_CREDIT_COST} CareerPilot credits to tailor a resume.`)
    const reservationId = await ctx.db.insert('creditLedger', { ownerId: args.ownerId, amount: -TAILORED_RESUME_CREDIT_COST, kind: 'tailored_resume', status: 'reserved', referenceId: args.referenceId, expiresAt: now + CREDIT_RESERVATION_MS, createdAt: now })
    return { reservationId, available: availableCredits([...entries, { amount: -TAILORED_RESUME_CREDIT_COST, status: 'reserved', expiresAt: now + CREDIT_RESERVATION_MS }], now) }
  },
})

export const complete = internalMutation({
  args: { reservationId: v.id('creditLedger') },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.reservationId)
    if (!entry || entry.status !== 'reserved') return false
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      await ctx.db.patch(entry._id, { status: 'released' })
      return false
    }
    await ctx.db.patch(entry._id, { status: 'completed' })
    return true
  },
})

export const release = internalMutation({
  args: { reservationId: v.id('creditLedger') },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.reservationId)
    if (!entry || entry.status !== 'reserved') return false
    await ctx.db.patch(entry._id, { status: 'released' })
    return true
  },
})
