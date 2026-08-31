import { action, internalMutation, internalQuery, mutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { requireOwner } from './owner'
import type { Id } from './_generated/dataModel'

export type ResumeDocumentStatus = 'uploading' | 'converting' | 'ready_pdf' | 'failed'

export function nextDocumentStatus(status: ResumeDocumentStatus, event: 'upload_complete' | 'conversion_succeeded' | 'conversion_failed') {
  if (status === 'uploading' && event === 'upload_complete') return 'converting' as const
  if (status === 'converting' && event === 'conversion_succeeded') return 'ready_pdf' as const
  if ((status === 'uploading' || status === 'converting') && event === 'conversion_failed') return 'failed' as const
  return status
}

export function canDownload(status: ResumeDocumentStatus) {
  return status === 'ready_pdf'
}

function pdfFileName(fileName: string) {
  return `${fileName.replace(/\.[^.]+$/, '')}.pdf`
}

export const createUpload = mutation({
  args: { jobId: v.id('jobs'), reservationId: v.id('creditLedger'), fileName: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx, 'Please sign in before creating a PDF resume.')
    const reservation = await ctx.db.get(args.reservationId)
    if (!reservation || reservation.ownerId !== ownerId || reservation.status !== 'reserved' || reservation.kind !== 'tailored_resume') throw new Error('This tailoring request is no longer available.')
    const documentId = await ctx.db.insert('generatedResumeDocuments', { ownerId, jobId: args.jobId, reservationId: args.reservationId, fileName: pdfFileName(args.fileName), status: 'uploading', createdAt: Date.now(), updatedAt: Date.now() })
    return { documentId, uploadUrl: await ctx.storage.generateUploadUrl() }
  },
})

export const inputForPdf = internalQuery({
  args: { documentId: v.id('generatedResumeDocuments'), ownerId: v.string() },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId)
    if (!document || document.ownerId !== args.ownerId || document.status !== 'uploading') return null
    const reservation = await ctx.db.get(document.reservationId)
    if (!reservation || reservation.ownerId !== args.ownerId || reservation.status !== 'reserved') return null
    return { document, reservation }
  },
})

export const startConversion = internalMutation({
  args: { documentId: v.id('generatedResumeDocuments'), sourceDocxStorageId: v.id('_storage') },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId)
    if (!document || document.status !== 'uploading') return false
    await ctx.db.patch(args.documentId, { status: 'converting', sourceDocxStorageId: args.sourceDocxStorageId, updatedAt: Date.now() })
    return true
  },
})

export const finishConversion = internalMutation({
  args: { documentId: v.id('generatedResumeDocuments'), pdfStorageId: v.optional(v.id('_storage')), failureMessage: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId)
    if (!document) return null
    if (args.pdfStorageId) {
      await ctx.db.patch(args.documentId, { status: 'ready_pdf', pdfStorageId: args.pdfStorageId, failureMessage: undefined, updatedAt: Date.now() })
      return document.reservationId
    }
    await ctx.db.patch(args.documentId, { status: 'failed', failureMessage: args.failureMessage ?? 'We could not convert this resume to PDF.', updatedAt: Date.now() })
    return document.reservationId
  },
})

function exportUrlFromJob(body: unknown) {
  const tasks = (body as { data?: { tasks?: unknown[] } })?.data?.tasks
  if (!Array.isArray(tasks)) return null
  const exportTask = tasks.find((task) => (task as { name?: unknown }).name === 'export_pdf' || (task as { operation?: unknown }).operation === 'export/url') as { result?: { files?: { url?: unknown }[] } } | undefined
  const url = exportTask?.result?.files?.[0]?.url
  return typeof url === 'string' ? url : null
}

export const convertToPdf = action({
  args: { documentId: v.id('generatedResumeDocuments'), sourceDocxStorageId: v.id('_storage') },
  handler: async (ctx, args): Promise<{ fileName: string; downloadUrl: string }> => {
    const ownerId = await requireOwner(ctx, 'Please sign in before converting a resume to PDF.')
    const input = await ctx.runQuery(internal.resumeDocuments.inputForPdf, { documentId: args.documentId, ownerId }) as { document: { fileName: string; reservationId: Id<'creditLedger'> }; reservation: { _id: Id<'creditLedger'> } } | null
    if (!input) throw new Error('This PDF request is no longer available.')
    const started = await ctx.runMutation(internal.resumeDocuments.startConversion, args)
    if (!started) throw new Error('This PDF request is already being processed.')
    try {
      const key = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CLOUDCONVERT_API_KEY
      if (!key) throw new Error('PDF conversion is not configured.')
      const sourceUrl = await ctx.storage.getUrl(args.sourceDocxStorageId)
      if (!sourceUrl) throw new Error('The generated DOCX is unavailable.')
      const jobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: { import_docx: { operation: 'import/url', url: sourceUrl }, convert_pdf: { operation: 'convert', input: 'import_docx', input_format: 'docx', output_format: 'pdf' }, export_pdf: { operation: 'export/url', input: 'convert_pdf' } }, tag: String(args.documentId) }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!jobResponse.ok) throw new Error('The PDF converter did not accept this resume.')
      const created = await jobResponse.json()
      const jobId = (created as { data?: { id?: unknown } })?.data?.id
      if (typeof jobId !== 'string') throw new Error('The PDF converter did not return a job.')
      let completed: unknown = null
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) })
        if (!statusResponse.ok) throw new Error('The PDF converter could not report its status.')
        completed = await statusResponse.json()
        const status = (completed as { data?: { status?: unknown } })?.data?.status
        if (status === 'finished') break
        if (status === 'error') throw new Error('The PDF converter could not process this resume.')
      }
      const pdfUrl = exportUrlFromJob(completed)
      if (!pdfUrl) throw new Error('The PDF converter timed out.')
      const pdfResponse = await fetch(pdfUrl, { signal: AbortSignal.timeout(30_000) })
      const contentType = pdfResponse.headers.get('content-type') ?? ''
      const contentLength = Number(pdfResponse.headers.get('content-length') ?? '0')
      if (!pdfResponse.ok || !contentType.startsWith('application/pdf') || (contentLength && contentLength > 10 * 1024 * 1024)) throw new Error('The PDF converter returned an invalid file.')
      const blob = await pdfResponse.blob()
      if (blob.size > 10 * 1024 * 1024) throw new Error('The converted PDF is too large.')
      const pdfStorageId = await ctx.storage.store(blob)
      const reservationId = await ctx.runMutation(internal.resumeDocuments.finishConversion, { documentId: args.documentId, pdfStorageId })
      if (!reservationId || !await ctx.runMutation(internal.credits.complete, { reservationId })) throw new Error('The PDF was created, but its credit reservation expired.')
      const downloadUrl = await ctx.storage.getUrl(pdfStorageId)
      if (!downloadUrl) throw new Error('The PDF is ready, but its download link is unavailable.')
      return { fileName: input.document.fileName, downloadUrl }
    } catch (error) {
      const reservationId = await ctx.runMutation(internal.resumeDocuments.finishConversion, { documentId: args.documentId, failureMessage: 'We could not convert this resume to PDF. No credits were used.' })
      if (reservationId) await ctx.runMutation(internal.credits.release, { reservationId })
      throw error
    }
  },
})
