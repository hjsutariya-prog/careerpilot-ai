import { useEffect, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { detectResumeSkills } from './resumeSkills'
import { sha256Text } from './resumeFingerprint'
import { extractReadableResumeText, isSupportedResume, MAX_RESUME_BYTES } from './resumeUploadUtils'

type ResumePurpose = 'template' | 'master'
type UploadedFile = { name: string; size: number }

export function ResumeUpload({ embedded = false, onBack, onContinue }: { embedded?: boolean; onBack: () => void; onContinue: () => void }) {
  const generateUploadUrl = useMutation(api.resumes.generateUploadUrl)
  const saveResume = useMutation(api.resumes.save)
  const removeResume = useMutation(api.resumes.removeMine)
  const removeMasterResume = useMutation(api.resumes.removeActiveMaster)
  const rebuildMasterStructure = useMutation(api.masterResumeStructure.rebuildMine)
  const savedResume = useQuery(api.resumes.mine)
  const savedMasterResume = useQuery(api.resumes.activeMaster)
  const [message, setMessage] = useState('')
  const [masterMessage, setMasterMessage] = useState('')
  const [busyPurpose, setBusyPurpose] = useState<ResumePurpose | null>(null)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [uploadedMasterFile, setUploadedMasterFile] = useState<UploadedFile | null>(null)

  useEffect(() => {
    if (!savedMasterResume?._id) return
    void rebuildMasterStructure().catch(() => undefined)
  }, [rebuildMasterStructure, savedMasterResume?._id])

  const upload = async (event: ChangeEvent<HTMLInputElement>, purpose: ResumePurpose) => {
    const file = event.target.files?.[0]
    if (!file) return
    const setStatus = purpose === 'master' ? setMasterMessage : setMessage
    if (!isSupportedResume(file)) return setStatus('Upload a PDF or DOCX file only.')
    if (file.size === 0) return setStatus('This file is empty. Choose a resume with content.')
    if (file.size > MAX_RESUME_BYTES) return setStatus('This file is larger than 10 MB. Choose a smaller resume.')
    setBusyPurpose(purpose); setStatus('Checking that we can read your resume…')
    try {
      const text = await extractReadableResumeText(file)
      if (text.length < 40) throw new Error('Your resume has no readable text. Export it again as a text-based PDF or DOCX.')
      const detectedSkills = detectResumeSkills(text)
      const contentHash = await sha256Text(text)
      const uploadUrl = await generateUploadUrl()
      const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) throw new Error('We could not upload that file. Please try again.')
      const { storageId } = await response.json() as { storageId: string }
      await saveResume({ storageId: storageId as never, fileName: file.name, mimeType: file.type, sizeBytes: file.size, extractedTextLength: text.length, extractedText: text.slice(0, 60_000), detectedSkills, contentHash, purpose })
      if (purpose === 'master') {
        setUploadedMasterFile({ name: file.name, size: file.size })
        setStatus('Master Resume saved privately. It is ready for future tailoring.')
      } else {
        setUploadedFile({ name: file.name, size: file.size })
        setStatus('Resume saved privately. Now set the details for your daily brief.')
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'We could not read that file. Try another PDF or DOCX.') }
    finally { setBusyPurpose(null) }
  }

  const remove = async () => {
    setBusyPurpose('template')
    setMessage('')
    try {
      await removeResume()
      setUploadedFile(null)
      setMessage('Resume removed. You can upload another one below.')
    } catch {
      setMessage('We could not remove your resume. Please try again.')
    } finally {
      setBusyPurpose(null)
    }
  }

  const removeMaster = async () => {
    setBusyPurpose('master')
    setMasterMessage('')
    try {
      await removeMasterResume()
      setUploadedMasterFile(null)
      setMasterMessage('Master Resume removed. Your normal resume remains unchanged.')
    } catch {
      setMasterMessage('We could not remove your Master Resume. Please try again.')
    } finally {
      setBusyPurpose(null)
    }
  }

  const displayFile = uploadedFile ?? (savedResume ? { name: savedResume.fileName, size: savedResume.sizeBytes } : null)
  const displayMasterFile = uploadedMasterFile ?? (savedMasterResume ? { name: savedMasterResume.fileName, size: savedMasterResume.sizeBytes } : null)
  const success = Boolean(displayFile)
  const templateBusy = busyPurpose === 'template'
  const masterBusy = busyPurpose === 'master'

  if (embedded) return <main className="resume-shell dashboard-resume-shell">
    <section aria-labelledby="resume-heading" className="cpd-resume-page">
      <div className="cpd-page-head"><div><span className="cpd-eyebrow">RESUME WORKSPACE</span><h1 id="resume-heading">Your experience, ready for <span>each strong role.</span></h1><p>Keep one trusted Primary Resume, add a fuller Master Resume, and review every AI-tailored version before using it.</p></div><div className="cpd-page-actions"><button className="cpd-primary-button" onClick={onContinue} type="button"><span aria-hidden="true">✦</span>Create tailored resume</button></div></div>
      <div className="cpd-resume-overview">
        <article className="cpd-resume-source cpd-resume-source-primary"><div><div className="cpd-source-label"><strong>Primary Resume</strong><small>DEFAULT FORMAT</small></div><p>Your main resume and preferred application format.</p><span className="cpd-file-reference"><span aria-hidden="true">✓</span>{displayFile ? `${displayFile.name} · Updated today` : 'No Primary Resume uploaded yet'}</span></div><label className="cpd-secondary-button"><input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Replace Primary Resume" disabled={busyPurpose !== null} onChange={(event) => void upload(event, 'template')} type="file" />{templateBusy ? 'Uploading…' : 'Replace'}</label></article>
        <article className="cpd-resume-source"><div><div className="cpd-source-label"><strong>Master Resume</strong><small>OPTIONAL SOURCE</small></div><p>A fuller record of verified roles, projects, achievements and skills.</p><span className="cpd-file-reference"><span aria-hidden="true">✓</span>{displayMasterFile ? `${displayMasterFile.name} · Updated ${savedMasterResume ? new Date(savedMasterResume.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'today'}` : 'No Master Resume uploaded yet'}</span></div><label className="cpd-secondary-button"><input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Update Master Resume" disabled={busyPurpose !== null} onChange={(event) => void upload(event, 'master')} type="file" />{masterBusy ? 'Uploading…' : displayMasterFile ? 'Update' : 'Add resume'}</label></article>
      </div>
      {(message || masterMessage) && <p className="cpd-resume-message" role="status">{message || masterMessage}</p>}
      <p className="cpd-grounded-note"><span aria-hidden="true">✓</span><span>AI tailoring uses only the source material in these resumes. You review every change before using it.</span></p>
      <div className="cpd-section-title"><div><h2>Tailored applications</h2><p>Role-specific versions created from your trusted resume content.</p></div></div>
      <div className="cpd-tailored-list">
        <div className="cpd-tailored-row"><span><strong>Product Manager · Arcesium</strong><small>Based on Primary + Master Resume</small></span><span><small>Created today</small></span><span className="cpd-resume-status" data-resume-status="Ready to review">Ready to review</span><button className="cpd-row-view" type="button">Review</button></div>
        <div className="cpd-tailored-row"><span><strong>Senior Product Manager · Razorpay</strong><small>Based on Primary + Master Resume</small></span><span><small>Created yesterday</small></span><span className="cpd-resume-status" data-resume-status="Draft">Draft</span><button className="cpd-row-view" type="button">Review</button></div>
        <div className="cpd-tailored-row"><span><strong>Platform Product Manager · Juspay</strong><small>Created from verified source material</small></span><span><small>Created 29 Aug</small></span><span className="cpd-resume-status" data-resume-status="Used for application">Used for application</span><button className="cpd-row-view" type="button">View</button></div>
      </div>
    </section>
  </main>

  return <main className="resume-shell">
    {!embedded && <header className="preference-topbar resume-topbar">
      <button className="back-home" onClick={onBack} type="button">← Home</button>
      <span className="brand">CareerPilot<span>.AI</span></span>
    </header>}
    <section className="resume-panel">
      <h1>Bring your experience.<br /><em>We’ll carry the rest.</em></h1>
      <p>Your resume helps us find jobs that fit you.</p>
      {!displayFile ? <label className="resume-drop">
        <input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busyPurpose !== null} onChange={(event) => void upload(event, 'template')} type="file" />
        <span className="resume-mark" aria-hidden="true">↥</span>
        <strong>{templateBusy ? 'Reading your resume…' : 'Upload your resume'}</strong>
        <small>PDF or DOCX · Up to 10 MB · Text must be readable</small>
        <span className="resume-upload-cta">{templateBusy ? 'Uploading…' : 'Choose file'}</span>
      </label> : <section className="resume-saved" aria-label="Saved resume">
        <div className="saved-file-heading"><span className="resume-mark" aria-hidden="true">✓</span><div><strong>Resume added</strong><small>Saved privately to this account</small></div></div>
        <div className="saved-file-name">
          <span className="file-badge">{displayFile.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'DOCX'}</span>
          <div className="saved-file-details"><strong>{displayFile.name}</strong><small>{Math.max(1, Math.round(displayFile.size / 1024))} KB</small></div>
          <div className="file-icon-actions">
            <label className="file-icon-action replace" title="Choose a different file"><input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Choose a different resume file" disabled={busyPurpose !== null} onChange={(event) => void upload(event, 'template')} type="file" /><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></label>
            <button aria-label="Remove resume" className="file-icon-action remove" disabled={busyPurpose !== null} onClick={() => void remove()} title="Remove resume" type="button"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M4 7h16m-10 4v5m4-5v5M9 7l1-3h4l1 3m-9 0 1 13h10l1-13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></button>
          </div>
        </div>
      </section>}
      {message && <p className={message.startsWith('Resume saved') || message.startsWith('Resume removed') ? 'form-success' : 'field-error'} role="status">{message}</p>}
      {success && <button className="save-preferences" onClick={onContinue} type="button">Set job preferences <span>→</span></button>}
      <section className="master-resume-panel" aria-labelledby="master-resume-heading">
        <h2 id="master-resume-heading">Master Resume (Optional)</h2>
        <p>Upload your complete career history to give future tailoring more factual evidence.</p>
        <p>If you don't upload one, we'll continue using your selected resume as the source of truth.</p>
        {!displayMasterFile ? <label className="resume-drop master-resume-drop">
          <input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busyPurpose !== null} onChange={(event) => void upload(event, 'master')} type="file" />
          <span className="resume-mark" aria-hidden="true">↥</span>
          <strong>{masterBusy ? 'Reading your Master Resume…' : 'Upload your Master Resume'}</strong>
          <small>PDF or DOCX · Up to 10 MB · Text must be readable</small>
          <span className="resume-upload-cta">{masterBusy ? 'Uploading…' : 'Choose file'}</span>
        </label> : <section className="resume-saved master-resume-saved" aria-label="Saved Master Resume">
          <div className="saved-file-heading"><span className="resume-mark" aria-hidden="true">✓</span><div><strong>Active Master Resume</strong><small>Saved privately to this account</small></div></div>
          <div className="saved-file-name">
            <span className="file-badge">{displayMasterFile.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'DOCX'}</span>
            <div className="saved-file-details"><strong>{displayMasterFile.name}</strong><small>{Math.max(1, Math.round(displayMasterFile.size / 1024))} KB{savedMasterResume ? ` · Uploaded ${new Date(savedMasterResume.uploadedAt).toLocaleDateString()}` : ''}</small></div>
            <div className="file-icon-actions">
              <label className="file-icon-action replace" title="Replace Master Resume"><input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Replace Master Resume" disabled={busyPurpose !== null} onChange={(event) => void upload(event, 'master')} type="file" /><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></label>
              <button aria-label="Remove Master Resume" className="file-icon-action remove" disabled={busyPurpose !== null} onClick={() => void removeMaster()} title="Remove Master Resume" type="button"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M4 7h16m-10 4v5m4-5v5M9 7l1-3h4l1 3m-9 0 1 13h10l1-13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></button>
            </div>
          </div>
        </section>}
        {masterMessage && <p className={masterMessage.startsWith('Master Resume saved') || masterMessage.startsWith('Master Resume removed') ? 'form-success' : 'field-error'} role="status">{masterMessage}</p>}
      </section>
    </section>
  </main>
}
