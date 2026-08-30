import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireOwner } from './owner'

const connectionValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  profileUrl: v.string(),
  email: v.string(),
  company: v.string(),
  normalizedCompany: v.string(),
  position: v.string(),
  connectedOn: v.string(),
})

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before importing connections.')
    const imports = await ctx.db.query('connectionImports').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).order('desc').collect()
    const latestImport = imports.find((item) => item.status === 'complete')
    if (!latestImport) return { import: null, connections: [] }
    const connections = await ctx.db.query('connections').withIndex('by_import', (q) => q.eq('importId', latestImport._id)).collect()
    return { import: latestImport, connections }
  },
})

export const startImport = mutation({
  args: {
    fileName: v.string(),
    totalRows: v.number(),
    errors: v.array(v.object({ rowNumber: v.number(), message: v.string() })),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before importing connections.')
    return await ctx.db.insert('connectionImports', { ...args, ownerId, importedRows: 0, status: 'uploading', importedAt: Date.now() })
  },
})

export const saveBatch = mutation({
  args: { importId: v.id('connectionImports'), connections: v.array(connectionValidator) },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before importing connections.')
    const importRecord = await ctx.db.get(args.importId)
    if (!importRecord || importRecord.ownerId !== ownerId || importRecord.status !== 'uploading') throw new Error('This connection import is no longer available.')

    for (const connection of args.connections) {
      await ctx.db.insert('connections', { ...connection, ownerId, importId: args.importId })
    }
  },
})

export const finishImport = mutation({
  args: { importId: v.id('connectionImports') },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before importing connections.')
    const importRecord = await ctx.db.get(args.importId)
    if (!importRecord || importRecord.ownerId !== ownerId || importRecord.status !== 'uploading') throw new Error('This connection import is no longer available.')
    const importedRows = (await ctx.db.query('connections').withIndex('by_import', (q) => q.eq('importId', args.importId)).collect()).length
    await ctx.db.patch(args.importId, { importedRows, status: 'complete' })
  },
})
