import { describe, expect, it } from 'vitest'
import { canDownload, nextDocumentStatus } from './resumeDocuments'

describe('resume document status', () => {
  it('moves a DOCX upload through conversion to a private PDF', () => {
    expect(nextDocumentStatus('uploading', 'upload_complete')).toBe('converting')
    expect(nextDocumentStatus('converting', 'conversion_succeeded')).toBe('ready_pdf')
    expect(canDownload('ready_pdf')).toBe(true)
    expect(canDownload('converting')).toBe(false)
  })

  it('marks a failed conversion without exposing a download', () => {
    expect(nextDocumentStatus('converting', 'conversion_failed')).toBe('failed')
    expect(canDownload('failed')).toBe(false)
  })
})
