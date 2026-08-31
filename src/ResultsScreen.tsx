import { useEffect, useState, type ReactNode } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { findCompanyConnections } from './connectionMatching'
import { toLiveJobCard } from './liveJobs'
import { createRoleBrief } from './roleBrief'
import { FormattedJobDescription } from './FormattedJobDescription'
import { getUndecidedJobs } from './trackerJobs'
import { downloadResumeBlob } from './tailoredResumeDownload'
import './ApplicationKit.css'
import { createResumeBlocksFromDocxSlots, describeTemplateChanges, extractDocxSlots, patchDocxTemplate } from './docxTemplate'

type JobActionStatus = 'Apply' | 'Reject' | 'On Hold'
type JobCard = NonNullable<ReturnType<typeof toLiveJobCard>>

type ResultsScreenProps = {
  embedded?: boolean
  onBack: () => void
  onEditPreferences: () => void
  onOpenTracker: () => void
  onOpenConnections: () => void
}
function matchLabel(score: number, isRelatedMatch: boolean, source: 'preferences' | 'resume' = 'preferences') {
  if (source === 'preferences') return 'Preferences match'
  if (isRelatedMatch) return 'Related role'
  if (score >= 80) return 'Strong fit'
  if (score >= 60) return 'Good fit'
  return 'Potential fit'
}

function BriefSidebar({ jobCount, onBack, onEditPreferences, onOpenConnections, onOpenTracker }: ResultsScreenProps & { jobCount: number }) {
  return <aside className="brief-sidebar">
    <button aria-label="Return home" className="brief-sidebar-brand" onClick={onBack} type="button">CareerPilot<span>.AI</span></button>
    <nav aria-label="Job workspace navigation" className="brief-sidebar-nav">
      <p>Workspace</p>
      <button aria-current="page" className="workspace-nav-item active" type="button"><span aria-hidden="true">A</span>Apply <b>{jobCount}</b></button>
      <button className="workspace-nav-item" onClick={onOpenTracker} type="button"><span aria-hidden="true">T</span>Tracker</button>
      <button className="workspace-nav-item" onClick={onOpenConnections} type="button"><span aria-hidden="true">C</span>Connections</button>
      <button className="workspace-nav-item" onClick={onEditPreferences} type="button"><span aria-hidden="true">P</span>Preferences</button>
    </nav>
    <p className="brief-sidebar-note"><i aria-hidden="true" />One thoughtful list, every day.</p>
  </aside>
}

function WorkspaceFrame({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return <main className={embedded ? 'brief-workspace dashboard-apply-screen' : 'brief-workspace'}>{children}</main>
}

function ResultsLoading({ embedded, onBack }: Pick<ResultsScreenProps, 'embedded' | 'onBack'>) {
  if (embedded) return <WorkspaceFrame embedded><section aria-live="polite" className="brief-canvas results-loading"><span aria-hidden="true" className="loading-orbit" /><p>Opening your live job brief…</p></section></WorkspaceFrame>
  return <main className="results-shell"><header className="preference-topbar results-topbar"><button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button><a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a></header><section aria-live="polite" className="results-loading"><span aria-hidden="true" className="loading-orbit" /><p>Opening your live job brief…</p></section></main>
}

function FocusedRoleView({ embedded, job, isSaving, onBack, onSave }: { embedded: boolean; job: JobCard; isSaving: boolean; onBack: () => void; onSave: (jobId: string, status: JobActionStatus) => void }) {
  const brief = createRoleBrief(job.description)
  const aiSummary = useQuery(api.roleSummaries.mine, { jobId: job.id as Id<'jobs'> })
  const savedResume = useQuery(api.resumes.mine)
  const requestAiSummary = useMutation(api.roleSummaries.request)
  const generateTailoredResume = useAction(api.tailoredResumes.generate)
  const completeTailoredResume = useMutation(api.tailoredResumes.complete)
  const createPdfUpload = useMutation(api.resumeDocuments.createUpload)
  const convertToPdf = useAction(api.resumeDocuments.convertToPdf)
  const credits = useQuery(api.credits.balanceMine)
  const [summaryRequestError, setSummaryRequestError] = useState('')
  const [tailoringJobId, setTailoringJobId] = useState<string | null>(null)
  const [tailorMessage, setTailorMessage] = useState<{ tone: 'error' | 'status'; text: string } | null>(null)
  const [tailorChanges, setTailorChanges] = useState<{ before: string; after: string }[]>([])
  const [resumeFormat, setResumeFormat] = useState<'docx' | 'pdf'>('docx')

  useEffect(() => {
    void requestAiSummary({ jobId: job.id as Id<'jobs'> }).catch(() => setSummaryRequestError('We could not start the AI summary. Showing the listing-based summary instead.'))
  }, [job.id, requestAiSummary])

  const summary = aiSummary?.status === 'ready' ? aiSummary.summary : brief.summary
  const responsibilities = aiSummary?.status === 'ready' ? aiSummary.responsibilities ?? [] : brief.responsibilities
  const summaryNote = aiSummary?.status === 'ready'
    ? 'AI summary based on the company listing'
    : aiSummary?.status === 'queued' || aiSummary?.status === 'generating'
      ? 'Preparing an AI summary. The original listing is ready below.'
      : aiSummary?.status === 'failed'
        ? aiSummary.failureMessage ?? 'Showing the listing-based summary instead.'
        : summaryRequestError || 'Listing-based summary'

  const tailorResume = async () => {
    if (credits && credits.available < credits.tailoringCost) {
      setTailorMessage({ tone: 'error', text: `You need ${credits.tailoringCost} CareerPilot credits to tailor a resume.` })
      return
    }
    if (!savedResume || savedResume.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || !savedResume.downloadUrl) {
      setTailorMessage({ tone: 'error', text: 'Upload your original DOCX resume to keep its formatting and two-page limit.' })
      return
    }
    setTailorMessage(null)
    setTailorChanges([])
    setTailoringJobId(job.id)
    try {
      const sourceResponse = await fetch(savedResume.downloadUrl)
      if (!sourceResponse.ok) throw new Error('We could not open your original DOCX. Upload it again and try once more.')
      const source = await sourceResponse.arrayBuffer()
      const slots = await extractDocxSlots(source)
      const templateSlots = createResumeBlocksFromDocxSlots(slots)
      const result = await generateTailoredResume({ jobId: job.id as Id<'jobs'>, templateSlots })
      if (result.mode === 'layout_protected' || !result.replacements) {
        setTailorMessage({ tone: 'error', text: 'We could not make safe changes to this resume. No credits were used.' })
        return
      }
      const tailoredDocx = await patchDocxTemplate(source, slots, result.replacements)
      if (resumeFormat === 'pdf') {
        if (!result.reservationId) throw new Error('A PDF requires a successful AI tailoring request.')
        setTailorMessage({ tone: 'status', text: 'Converting your tailored DOCX to PDF…' })
        const upload = await createPdfUpload({ jobId: job.id as Id<'jobs'>, reservationId: result.reservationId as Id<'creditLedger'>, fileName: result.fileName })
        const uploadResponse = await fetch(upload.uploadUrl, { method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body: tailoredDocx })
        if (!uploadResponse.ok) throw new Error('We could not prepare your DOCX for PDF conversion.')
        const { storageId } = await uploadResponse.json() as { storageId: string }
        const pdf = await convertToPdf({ documentId: upload.documentId, sourceDocxStorageId: storageId as Id<'_storage'> })
        const pdfResponse = await fetch(pdf.downloadUrl)
        if (!pdfResponse.ok) throw new Error('We could not download your converted PDF.')
        downloadResumeBlob(pdf.fileName, await pdfResponse.blob())
      } else {
        if (result.reservationId) await completeTailoredResume({ reservationId: result.reservationId as Id<'creditLedger'> })
        downloadResumeBlob(result.fileName, tailoredDocx)
      }
      setTailorChanges(describeTemplateChanges(slots, result.replacements))
      setTailorMessage({ tone: 'status', text: result.mode === 'reordered' ? 'AI could not safely rewrite this resume, so matching skills were reordered inside your original Word layout.' : 'Original Word formatting preserved. Replacements were limited to your existing text slots.' })
    } catch (error) {
      const message = error instanceof Error && error.message.includes('Please re-upload your resume before tailoring it.')
        ? 'This earlier resume needs to be uploaded once more before we can tailor it. Your original file stays in your account.'
        : 'We could not tailor your resume right now. Please try again.'
      setTailorMessage({ tone: 'error', text: message })
    } finally {
      setTailoringJobId(null)
    }
  }

  return <WorkspaceFrame embedded={embedded}>
    <section className="role-focus-view" aria-labelledby="focused-role-title">
      <header className="role-focus-header"><button className="role-focus-back" onClick={onBack} type="button"><span aria-hidden="true">←</span> Back to jobs</button><p>{job.freshnessLabel}</p></header>
      <div className="role-focus-hero"><p className="eyebrow">ROLE OVERVIEW</p><div><div aria-hidden="true" className="workspace-company-mark">{job.companyName.slice(0, 1)}</div><p>{job.companyName}</p></div><h1 id="focused-role-title">{job.title}</h1><div className="role-focus-meta"><span>{job.cityLabel}</span><span>{job.workPreference}</span><span><b>{job.matchScore}</b> {matchLabel(job.matchScore, job.isRelatedMatch, job.matchSource)}</span></div></div>
      <div className="role-focus-layout"><section className="role-focus-main"><div className="role-focus-section"><p className="role-detail-label">Role summary</p>{summary ? <p className="role-focus-summary">{summary}</p> : <p className="role-focus-summary unavailable">This listing does not provide a separate role overview. The full company description is available below.</p>}<p className="role-summary-source" role={aiSummary?.status === 'queued' || aiSummary?.status === 'generating' ? 'status' : undefined}>{summaryNote}</p></div>{responsibilities.length > 0 && <div className="role-focus-section"><p className="role-detail-label">What you will work on</p><ol className="role-focus-responsibilities">{responsibilities.map((responsibility) => <li key={responsibility}>{responsibility}</li>)}</ol></div>}{aiSummary?.status === 'ready' && aiSummary.suitableFor && <div className="role-focus-section role-focus-suitable"><p className="role-detail-label">Best suited to</p><p>{aiSummary.suitableFor}</p></div>}<details className="role-focus-original"><summary>Open the original job description <span aria-hidden="true">↓</span></summary><FormattedJobDescription fallback={job.description} html={job.descriptionHtml} /></details></section><aside className="role-focus-side"><section><p className="role-detail-label">Why it fits</p><p>{job.matchReason}</p></section>{(aiSummary?.status === 'ready' ? aiSummary.skills ?? [] : job.skills).length > 0 && <section><p className="role-detail-label">Skills in this role</p><div className="role-skill-list">{(aiSummary?.status === 'ready' ? aiSummary.skills ?? [] : job.skills).slice(0, 8).map((skill) => <span key={skill}>{skill}</span>)}</div></section>}<section className="application-kit" aria-labelledby="application-kit-title"><div className="application-kit-heading"><p className="role-detail-label">Application kit</p><span aria-hidden="true">↳</span></div><h2 id="application-kit-title">Tailor your original Word resume</h2><p>Uses your DOCX as a locked template. It keeps your layout and sections, with shorter replacements to protect a two-page resume.</p><label className="application-kit-format">{credits ? `${credits.tailoringCost} credits` : 'Checking credits…'}<select aria-label="Resume download format" onChange={(event) => setResumeFormat(event.target.value as 'docx' | 'pdf')} value={resumeFormat}><option value="docx">DOCX</option><option value="pdf">PDF</option></select></label><button className="tailor-resume application-kit-action" disabled={tailoringJobId === job.id || savedResume === undefined || credits === undefined || (credits !== null && credits.available < credits.tailoringCost)} onClick={() => void tailorResume()} type="button">{tailoringJobId === job.id ? (resumeFormat === 'pdf' ? 'Preparing PDF…' : 'Preparing resume…') : `Tailor as ${resumeFormat.toUpperCase()}`} <span aria-hidden="true">↓</span></button>{tailorMessage && <p className={tailorMessage.tone === 'error' ? 'application-kit-message error' : 'application-kit-message'} role={tailorMessage.tone === 'error' ? 'alert' : 'status'}>{tailorMessage.text}</p>}{tailorChanges.length > 0 && <section className="application-kit-changes" aria-labelledby="tailoring-summary-title"><p className="role-detail-label" id="tailoring-summary-title">What changed</p><ol>{tailorChanges.map((change) => <li key={change.before + change.after}><s>{change.before}</s><strong>{change.after}</strong></li>)}</ol></section>}</section><a aria-disabled={isSaving} className="workspace-apply role-focus-apply" href={job.applyUrl} onClick={() => void onSave(job.id, 'Apply')} rel="noreferrer" target="_blank">Apply on {job.companyName} <span aria-hidden="true">↗</span></a><div className="role-focus-actions"><button disabled={isSaving} onClick={() => void onSave(job.id, 'On Hold')} type="button">Hold this role</button><button className="reject" disabled={isSaving} onClick={() => void onSave(job.id, 'Reject')} type="button">Reject</button></div></aside></div>
    </section>
  </WorkspaceFrame>
}

export function ResultsScreen({ embedded = false, onBack, onEditPreferences, onOpenTracker, onOpenConnections }: ResultsScreenProps) {
  const brief = useQuery(api.searches.latestMine)
  const savedActions = useQuery(api.jobActions.mine)
  const savedConnections = useQuery(api.connections.mine)
  const saveAction = useMutation(api.jobActions.save)
  const requestFirstSearch = useMutation(api.searches.requestFirstSearch)
  const [savingJobId, setSavingJobId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [isStartingSearch, setIsStartingSearch] = useState(false)
  const [focusedJob, setFocusedJob] = useState<JobCard | null>(null)

  if (brief === undefined || savedActions === undefined || savedConnections === undefined) return <ResultsLoading embedded={embedded} onBack={onBack} />

  const startSearch = async () => {
    setActionError('')
    setIsStartingSearch(true)
    try {
      await requestFirstSearch({})
    } catch {
      setActionError('We could not start your job search. Check your resume and preferences, then try again.')
    } finally {
      setIsStartingSearch(false)
    }
  }

  const saveStatus = async (jobId: string, status: JobActionStatus) => {
    setActionError('')
    setSavingJobId(jobId)
    try {
      await saveAction({ jobId, status })
    } catch {
      setActionError('We could not save that job action. Please try again.')
    } finally {
      setSavingJobId(null)
    }
  }

  const search = brief.search
  const cards = brief.suggestions.map((suggestion) => toLiveJobCard({ ...suggestion, job: suggestion.job ? { ...suggestion.job, _id: String(suggestion.job._id) } : null })).filter((job): job is NonNullable<typeof job> => job !== null)
  const jobs = getUndecidedJobs(cards, savedActions)
  const sourceFailures = brief.sourceHealth.filter((source) => source.status === 'failed')
  const checkedAt = search?.completedAt ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(search.completedAt)) : 'Results arrive within 15 minutes'

  if (focusedJob) return <FocusedRoleView embedded={embedded} isSaving={savingJobId === focusedJob.id} job={focusedJob} onBack={() => setFocusedJob(null)} onSave={saveStatus} />

  return <WorkspaceFrame embedded={embedded}>
    {!embedded && <BriefSidebar jobCount={jobs.length} onBack={onBack} onEditPreferences={onEditPreferences} onOpenConnections={onOpenConnections} onOpenTracker={onOpenTracker} />}
    <section aria-labelledby="results-heading" className="brief-canvas">
      <header className="brief-workspace-header">
        <div><p className="eyebrow">TODAY’S LIVE JOBS</p><h1 id="results-heading">Your next move,<br /><em>in view.</em></h1><p>Fresh roles from approved company career pages, shaped around your preferences.</p></div>
        <div className="brief-workspace-signal"><span aria-hidden="true">●</span><p><strong>{search?.completedAt ? 'Greenhouse checked' : 'Live search'}</strong><small>{checkedAt}</small></p></div>
      </header>

      {!search ? <section className="workspace-empty"><p className="eyebrow">READY TO SEARCH</p><h2>Build your first live job brief.</h2><p>Once your resume and preferences are saved, we will check approved company sources and keep the results private to you.</p><button className="workspace-primary" disabled={isStartingSearch} onClick={() => void startSearch()} type="button">{isStartingSearch ? 'Starting search…' : 'Find my jobs'} <span aria-hidden="true">→</span></button></section>
        : search.status === 'queued' || search.status === 'fetching' || search.status === 'matching' ? <section aria-live="polite" className="workspace-empty"><p className="eyebrow">LIVE SEARCH RUNNING</p><h2>Checking active roles for you.</h2><p>We are reading approved company job boards, removing older listings, and matching what remains to your preferences. This can take up to 15 minutes.</p></section>
          : search.status === 'failed' ? <section className="workspace-empty"><p className="eyebrow">SOURCE CHECK NEEDED</p><h2>We could not build a live brief this time.</h2><p>{search.error ?? 'The approved company sources could not be reached. No sample jobs are shown in their place.'}</p><button className="workspace-primary" disabled={isStartingSearch} onClick={() => void startSearch()} type="button">Try live search again <span aria-hidden="true">→</span></button></section>
            : jobs.length === 0 ? (savedActions.length > 0 && cards.length > 0 ? <section className="workspace-empty"><p className="eyebrow">ALL CAUGHT UP</p><h2>You have decided on every job in this brief.</h2><p>Your choices are waiting in Tracker. We will not show the same roles here again.</p><button className="workspace-primary" onClick={onOpenTracker} type="button">Open Tracker <span aria-hidden="true">→</span></button></section> : <section className="workspace-empty"><p className="eyebrow">NO MATCHES YET</p><h2>No live roles match this brief right now.</h2><p>Try widening your target role, city, or work preference. We will not fill this space with unrelated jobs.</p><button className="workspace-primary" onClick={onEditPreferences} type="button">Edit preferences <span aria-hidden="true">→</span></button></section>)
              : <>
                {search.sourceWarning && <p className="workspace-source-warning" role="status">{search.sourceWarning}</p>}
                {sourceFailures.length > 0 && !search.sourceWarning && <p className="workspace-source-warning" role="status">{sourceFailures.length} source{sourceFailures.length === 1 ? ' is' : 's are'} temporarily unavailable. These results use the other approved sources.</p>}
                <div className="brief-workspace-summary"><p><b>{jobs.length}</b> roles ready to review</p><span>Strongest matches first</span></div>
                <div className="job-tile-grid">
                  {jobs.map((job, index) => {
                    const isSaving = savingJobId === job.id
                    const matchingConnections = findCompanyConnections(job.companyName, savedConnections.connections)
                    return <article className={index === 0 ? 'job-tile top-pick' : 'job-tile'} key={job.id}>
                      <div className="job-tile-topline"><p>{index === 0 ? 'FIRST TO OPEN' : 'ROLE ' + String(index + 1).padStart(2, '0')}</p><div className="job-tile-score"><strong>{job.matchScore}</strong><span>{matchLabel(job.matchScore, job.isRelatedMatch, job.matchSource)}</span></div></div>
                      <div className="job-tile-company"><div aria-hidden="true" className="workspace-company-mark">{job.companyName.slice(0, 1)}</div><div><h2>{job.title}</h2><p>{job.companyName}</p></div></div>
                      <div className="job-tile-meta"><span>{job.cityLabel}</span><span>{job.workPreference}</span></div>
                      <p className="job-tile-reason"><b>Why it fits</b> {job.matchReason}</p>
                      {matchingConnections.length > 0 && <section className="job-tile-connections"><p><b>Connections at {job.companyName}</b></p><div>{matchingConnections.slice(0, 2).map((connection) => connection.profileUrl ? <a href={connection.profileUrl} key={connection.profileUrl + connection.firstName + connection.lastName} rel="noreferrer" target="_blank"><span aria-hidden="true">{connection.firstName.slice(0, 1) + connection.lastName.slice(0, 1) || '•'}</span>{[connection.firstName, connection.lastName].filter(Boolean).join(' ')} <i aria-hidden="true">↗</i></a> : <span className="workspace-connection-name" key={connection.firstName + connection.lastName + connection.company}><span aria-hidden="true">{connection.firstName.slice(0, 1) + connection.lastName.slice(0, 1) || '•'}</span>{[connection.firstName, connection.lastName].filter(Boolean).join(' ')}</span>)}</div>{matchingConnections.length > 2 && <small>+{matchingConnections.length - 2} more in details</small>}</section>}
                      <section className="job-tile-summary"><p className="role-detail-label">Role summary</p><p>{createRoleBrief(job.description).summary ?? 'Open the role view for a structured summary and the full original description.'}</p><button onClick={() => setFocusedJob(job)} type="button">Open full role view <span aria-hidden="true">→</span></button></section>
                      <footer className="job-tile-footer"><div><p>{job.freshnessLabel}</p><small>{job.checkedLabel}</small></div><div className="job-tile-actions"><a aria-disabled={isSaving} className="workspace-apply" href={job.applyUrl} onClick={() => void saveStatus(job.id, 'Apply')} rel="noreferrer" target="_blank">Apply <span aria-hidden="true">↗</span></a><button disabled={isSaving} onClick={() => void saveStatus(job.id, 'On Hold')} type="button">Hold</button><button className="reject" disabled={isSaving} onClick={() => void saveStatus(job.id, 'Reject')} type="button">Reject</button></div></footer>
                    </article>
                  })}
                </div>
              </>}
      {actionError && <p className="field-error workspace-error" role="alert">{actionError}</p>}
    </section>
  </WorkspaceFrame>
}
