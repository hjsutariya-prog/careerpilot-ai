import { useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const MAX_BYTES = 10 * 1024 * 1024
const allowed = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])

async function readableText(file: File) {
  if (file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    let text = ''
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await document.getPage(page).then((value) => value.getTextContent())
      text += content.items.map((item) => 'str' in item ? item.str : '').join(' ')
    }
    return text.trim()
  }
  const mammoth = await import('mammoth/mammoth.browser')
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.trim()
}

export function ResumeUpload({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const generateUploadUrl = useMutation(api.resumes.generateUploadUrl)
  const saveResume = useMutation(api.resumes.save)
  const removeResume = useMutation(api.resumes.removeMine)
  const savedResume = useQuery(api.resumes.mine)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null)

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!allowed.has(file.type)) return setMessage('Upload a PDF or DOCX file only.')
    if (file.size === 0) return setMessage('This file is empty. Choose a resume with content.')
    if (file.size > MAX_BYTES) return setMessage('This file is larger than 10 MB. Choose a smaller resume.')
    setBusy(true); setMessage('Checking that we can read your resume…')
    try {
      const text = await readableText(file)
      if (text.length < 40) throw new Error('Your resume has no readable text. Export it again as a text-based PDF or DOCX.')
      const uploadUrl = await generateUploadUrl()
      const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) throw new Error('We could not upload that file. Please try again.')
      const { storageId } = await response.json() as { storageId: string }
      await saveResume({ storageId: storageId as never, fileName: file.name, mimeType: file.type, sizeBytes: file.size, extractedTextLength: text.length })
      setUploadedFile({ name: file.name, size: file.size })
      setMessage('Resume saved privately. Now set the details for your daily brief.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'We could not read that file. Try another PDF or DOCX.') }
    finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    setMessage('')
    try {
      await removeResume()
      setUploadedFile(null)
      setMessage('Resume removed. You can upload another one below.')
    } catch {
      setMessage('We could not remove your resume. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const displayFile = uploadedFile ?? (savedResume ? { name: savedResume.fileName, size: savedResume.sizeBytes } : null)
  const success = Boolean(displayFile)

  return <main className="resume-shell">
    <header className="preference-topbar resume-topbar">
      <button className="back-home" onClick={onBack} type="button">← Home</button>
      <span className="brand">CareerPilot<span>.AI</span></span>
      <span className="preference-stage">01 / Resume</span>
    </header>
    <section className="resume-panel">
      <p className="eyebrow">YOUR EXPERIENCE</p>
      <h1>Bring your experience.<br /><em>We’ll carry the rest.</em></h1>
      <p>Upload one resume and CareerPilot will keep it private to this account.</p>
      {!displayFile ? <label className="resume-drop">
        <input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={upload} type="file" />
        <span className="resume-mark" aria-hidden="true">↥</span>
        <strong>{busy ? 'Reading your resume…' : 'Upload your resume'}</strong>
        <small>PDF or DOCX · Up to 10 MB · Text must be readable</small>
        <span className="resume-upload-cta">{busy ? 'Uploading…' : 'Choose file'}</span>
      </label> : <section className="resume-saved" aria-label="Saved resume">
        <div className="saved-file-heading"><span className="resume-mark" aria-hidden="true">✓</span><div><strong>Resume added</strong><small>Saved privately to this account</small></div></div>
        <div className="saved-file-name"><span className="file-badge">{displayFile.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'DOCX'}</span><strong>{displayFile.name}</strong><small>{Math.max(1, Math.round(displayFile.size / 1024))} KB</small></div>
        <div className="resume-file-actions">
          <label className="resume-replace"><input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={upload} type="file" />Choose a different file</label>
          <button className="resume-remove" disabled={busy} onClick={() => void remove()} type="button">Remove resume</button>
        </div>
      </section>}
      {message && <p className={message.startsWith('Resume saved') || message.startsWith('Resume removed') ? 'form-success' : 'field-error'} role="status">{message}</p>}
      {success && <button className="save-preferences" onClick={onContinue} type="button">Continue to preferences <span>→</span></button>}
    </section>
  </main>
}
