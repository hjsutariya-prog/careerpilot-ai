import { useState, type ReactNode } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { findCompanyConnections } from './connectionMatching'
import { toLiveJobCard } from './liveJobs'
import { FormattedJobDescription } from './FormattedJobDescription'
import { getUndecidedJobs } from './trackerJobs'
import { downloadResumeBlob } from './tailoredResumeDownload'
import { tailoringOutcomeMessage } from './tailoringMessages'
import './ApplicationKit.css'
import { createResumeBlocksFromDocxSlots, extractDocxSlots, patchDocxTemplate, type DocxSlot } from './docxTemplate'
import type { TailoringMatchPreview } from '../convex/tailoredResumes'
import type { TailoringMerge, TailoringReorder } from '../convex/ai/tailoringSchema'

type JobActionStatus = 'Apply' | 'Reject' | 'On Hold'
type JobCard = NonNullable<ReturnType<typeof toLiveJobCard>>
type TailoringPreviewState = {
  source: ArrayBuffer
  slots: DocxSlot[]
  result: {
    fileName: string
    replacements: string[]
    reorders?: TailoringReorder[]
    merges?: TailoringMerge[]
    reservationId?: string
    preview: TailoringMatchPreview
  }
}

type ResultsScreenProps = {
  embedded?: boolean
  onBack: () => void
  onEditPreferences: () => void
  onOpenTracker: () => void
  onOpenConnections: () => void
}
function matchLabel(score: number, isRelatedMatch: boolean, _matchSource?: string) {
  if (isRelatedMatch) return 'Good fit'
  if (score >= 80) return 'Strong fit'
  if (score >= 60) return 'Good fit'
  return 'Stretch'
}

function JobMetaIcon({ name }: { name: 'location' | 'work' | 'date' }) {
  return <svg aria-hidden="true" className="job-meta-icon" fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width="13">{name === 'location' ? <><path d="M20 10.5c0 5-8 10-8 10s-8-5-8-10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10.5" r="2.5" /></> : name === 'work' ? <><rect height="14" rx="2" width="18" x="3" y="6" /><path d="M9 6V4h6v2M3 11h18M10 11v2h4v-2" /></> : <><rect height="17" rx="2" width="18" x="3" y="4" /><path d="M16 2v4M8 2v4M3 9h18" /></>}</svg>
}

function companyMarkFromName(companyName: string) {
  const words = companyName.match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)/g) ?? [companyName]
  return words.length > 1 ? words.map((word) => word[0]).join('').slice(0, 2).toUpperCase() : companyName.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase()
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

function FocusedRoleView({ embedded, job, isSaving, onBack, onOpenConnections, onSave }: { embedded: boolean; job: JobCard; isSaving: boolean; onBack: () => void; onOpenConnections: () => void; onSave: (jobId: string, status: JobActionStatus) => void }) {
  const savedResume = useQuery(api.resumes.mine)
  const savedConnections = useQuery(api.connections.mine)
  const generateTailoredResume = useAction(api.tailoredResumes.generate)
  const completeTailoredResume = useMutation(api.tailoredResumes.complete)
  const createPdfUpload = useMutation(api.resumeDocuments.createUpload)
  const convertToPdf = useAction(api.resumeDocuments.convertToPdf)
  const credits = useQuery(api.credits.balanceMine)
  const [tailoringJobId, setTailoringJobId] = useState<string | null>(null)
  const [tailorMessage, setTailorMessage] = useState<{ tone: 'error' | 'status'; text: string } | null>(null)
  const [tailoringPreview, setTailoringPreview] = useState<TailoringPreviewState | null>(null)
  const resumeFormat = 'docx' as 'docx' | 'pdf'

  const previewTailoring = async () => {
    if (credits && credits.available < credits.tailoringCost) {
      setTailorMessage({ tone: 'error', text: `You need ${credits.tailoringCost} CareerPilot credits to tailor a resume.` })
      return
    }
    if (!savedResume || savedResume.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || !savedResume.downloadUrl) {
      setTailorMessage({ tone: 'error', text: 'Upload your original DOCX resume to keep its formatting and two-page limit.' })
      return
    }
    setTailorMessage(null)
    setTailoringPreview(null)
    setTailoringJobId(job.id)
    try {
      const sourceResponse = await fetch(savedResume.downloadUrl)
      if (!sourceResponse.ok) throw new Error('We could not open your original DOCX. Upload it again and try once more.')
      const source = await sourceResponse.arrayBuffer()
      const slots = await extractDocxSlots(source)
      const templateSlots = createResumeBlocksFromDocxSlots(slots)
      const result = await generateTailoredResume({ jobId: job.id as Id<'jobs'>, templateSlots })
      if (result.mode === 'provider_unavailable' || result.mode === 'ai_response_invalid') {
        setTailorMessage(tailoringOutcomeMessage(result.mode, result.failureCode))
        return
      }
      if (result.mode === 'no_meaningful_changes') {
        setTailorMessage(tailoringOutcomeMessage(result.mode))
        return
      }
      if (result.mode === 'no_safe_changes') {
        setTailorMessage(tailoringOutcomeMessage(result.mode))
        return
      }
      if (result.mode === 'layout_protected' || !result.replacements || !result.preview) {
        setTailorMessage(tailoringOutcomeMessage('layout_protected'))
        return
      }
      setTailoringPreview({ source, slots, result: { fileName: result.fileName, replacements: result.replacements, reorders: result.reorders, merges: result.merges, reservationId: result.reservationId, preview: result.preview } })
      setTailorMessage({ tone: 'status', text: 'Review the evidence-backed changes and estimated match movement before generating your file.' })
    } catch (error) {
      const message = error instanceof Error && error.message.includes('Please re-upload your resume before tailoring it.')
        ? 'This earlier resume needs to be uploaded once more before we can tailor it. Your original file stays in your account.'
        : 'We could not prepare a tailoring preview right now. Please try again.'
      setTailorMessage({ tone: 'error', text: message })
    } finally {
      setTailoringJobId(null)
    }
  }

  const generateTailoredFile = async () => {
    if (!tailoringPreview) return
    setTailorMessage(null)
    setTailoringJobId(job.id)
    try {
      const { source, slots, result } = tailoringPreview
      const tailoredDocx = await patchDocxTemplate(source, slots, result.replacements, result.reorders, result.merges)
      if (resumeFormat === 'pdf') {
        if (!result.reservationId) throw new Error('A PDF needs an AI tailoring preview. Choose DOCX for this safe reorder.')
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
      setTailorMessage({ tone: 'status', text: 'Original Word formatting preserved. Replacements were limited to your existing text slots.' })
    } catch (error) {
      setTailorMessage({ tone: 'error', text: 'We could not generate your tailored file right now. Please try again.' })
    } finally {
      setTailoringJobId(null)
    }
  }

  const saveStatus = onSave
  const matchingConnections = findCompanyConnections(job.companyName, savedConnections?.connections ?? [])
  const companyMark = companyMarkFromName(job.companyName)
  const fitPointValues = job.strengths.length > 0 ? job.strengths.slice(0, 4).map((strength) => strength.requirement) : [job.fitSummary]
  const fitPoints = [...new Map(fitPointValues.map((point) => [point.trim().toLowerCase(), point.trim()])).values()]

  return <WorkspaceFrame embedded={embedded}>
    <div className="role-detail-overlay" role="presentation">
      <div className="role-detail-overlay-dismiss" onClick={onBack} />
      <aside className="role-detail-drawer" aria-labelledby="focused-role-title" role="dialog" aria-modal="true">
        <div className="role-detail-drawer-head"><span>JOB DETAILS</span><button aria-label="Close job details" className="role-detail-close" onClick={onBack} type="button">×</button></div>
        <div className="role-detail-company"><span className="role-detail-company-mark">{companyMark}</span><span><strong>{job.companyName}</strong><small>{job.freshnessLabel}</small></span></div>
        <h2 id="focused-role-title">{job.title}</h2>
        <div className="role-detail-meta">{job.cityLabel && <span className="role-detail-location"><JobMetaIcon name="location" />{job.cityLabel}</span>}<span className="role-detail-work-mode"><JobMetaIcon name="work" />{job.workPreference}</span><span><JobMetaIcon name="date" />{job.freshnessLabel}</span></div>
        <div className="role-detail-fit"><strong>{matchLabel(job.matchScore, job.isRelatedMatch, job.matchSource)}</strong><p>{job.fitSummary}</p></div>
        <section className="role-detail-section"><h3>Why it fits</h3><ul>{fitPoints.map((point) => <li key={point}>{point}</li>)}</ul></section>
        {job.cautions.length > 0 && <section className="role-detail-section"><h3>Worth noting</h3><ul className="role-detail-cautions">{job.cautions.slice(0, 3).map((caution) => <li key={caution}>{caution}</li>)}</ul></section>}
        {job.requirements.length > 0 && <section className="role-detail-section"><h3>What they’re looking for</h3><ul>{job.requirements.slice(0, 6).map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></section>}
        <section className="role-detail-section"><h3>People you know</h3>{matchingConnections.length > 0 ? <div className="role-detail-connection-row"><span><strong>{matchingConnections.length} connection{matchingConnections.length === 1 ? '' : 's'} work here</strong><small>From your uploaded LinkedIn connections</small></span><button className="role-detail-link" onClick={onOpenConnections} type="button">View connections</button></div> : <p>No imported connections found at this company.</p>}</section>
        <section className="role-detail-section"><h3>Prepare your application</h3><div className="role-detail-resume-row"><span><strong>Primary Resume</strong><small>{savedResume ? 'Use AI to tailor it from your verified experience.' : 'Upload your resume to tailor it for this role.'}</small></span><button className="role-detail-secondary" disabled={tailoringJobId === job.id || !savedResume} onClick={() => void previewTailoring()} type="button">Tailor resume with AI</button></div>{tailoringPreview && <div className="role-detail-tailor-status"><strong>Preview ready: {tailoringPreview.result.preview.projectedScore}% estimated match</strong><button className="role-detail-secondary" disabled={tailoringJobId === job.id} onClick={() => void generateTailoredFile()} type="button">Generate {resumeFormat.toUpperCase()}</button></div>}{tailorMessage && <p className={tailorMessage.tone === 'error' ? 'role-detail-message error' : 'role-detail-message'} role={tailorMessage.tone === 'error' ? 'alert' : 'status'}>{tailorMessage.text}</p>}</section>
        <details className="role-detail-original"><summary>Open original job description <span>↓</span></summary><FormattedJobDescription fallback={job.description} html={job.descriptionHtml} /></details>
        <div className="role-detail-actions"><a className="role-detail-primary" href={job.applyUrl} onClick={() => void onSave(job.id, 'Apply')} rel="noreferrer" target="_blank">Apply on company site <span>↗</span></a><button className="role-detail-secondary" disabled={isSaving} onClick={() => void saveStatus(job.id, 'On Hold')} type="button">Save for later</button><button className="role-detail-quiet" disabled={isSaving} onClick={() => void saveStatus(job.id, 'Reject')} type="button">Not interested</button></div>
      </aside>
    </div>
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
  const jobs = getUndecidedJobs(cards, savedActions).sort((first, second) => {
    if (first.isRelatedMatch !== second.isRelatedMatch) return Number(first.isRelatedMatch) - Number(second.isRelatedMatch)
    return second.matchScore - first.matchScore
  })
  const strongFitCount = jobs.filter((job) => !job.isRelatedMatch && job.matchScore >= 80).length

  return <WorkspaceFrame embedded={embedded}>
    {!embedded && <BriefSidebar jobCount={jobs.length} onBack={onBack} onEditPreferences={onEditPreferences} onOpenConnections={onOpenConnections} onOpenTracker={onOpenTracker} />}
    <section aria-labelledby="results-heading" className="brief-canvas">
      <section className="cpd-intro" aria-labelledby="results-heading">
        <div><span className="cpd-eyebrow">YOUR DAILY BRIEF</span><h1 id="results-heading">Your Daily Brief is <span>ready.</span></h1><p>Start with the roles that fit best, understand the tradeoffs, then choose one clear next action.</p></div>
        <div className="cpd-brief-count"><strong>{jobs.length}</strong><span>roles worth your attention</span></div>
      </section>

      {!search ? <section className="workspace-empty"><p className="eyebrow">READY TO SEARCH</p><h2>Build your first live job brief.</h2><p>Once your resume and preferences are saved, we will check approved company sources and keep the results private to you.</p><button className="workspace-primary" disabled={isStartingSearch} onClick={() => void startSearch()} type="button">{isStartingSearch ? 'Starting search…' : 'Find my jobs'} <span aria-hidden="true">→</span></button></section>
        : search.status === 'queued' || search.status === 'fetching' || search.status === 'matching' ? <section aria-live="polite" className="workspace-empty"><p className="eyebrow">LIVE SEARCH RUNNING</p><h2>Checking active roles for you.</h2><p>We are reading approved company job boards, removing older listings, and matching what remains to your preferences. This can take up to 15 minutes.</p></section>
          : search.status === 'failed' ? <section className="workspace-empty"><p className="eyebrow">SOURCE CHECK NEEDED</p><h2>We could not build a live brief this time.</h2><p>{search.error ?? 'The approved company sources could not be reached. No sample jobs are shown in their place.'}</p><button className="workspace-primary" disabled={isStartingSearch} onClick={() => void startSearch()} type="button">Try live search again <span aria-hidden="true">→</span></button></section>
            : jobs.length === 0 ? (savedActions.length > 0 && cards.length > 0 ? <section className="workspace-empty"><p className="eyebrow">ALL CAUGHT UP</p><h2>You have decided on every job in this brief.</h2><p>Your choices are waiting in Tracker. We will not show the same roles here again.</p><button className="workspace-primary" onClick={onOpenTracker} type="button">Open Tracker <span aria-hidden="true">→</span></button></section> : <section className="workspace-empty"><p className="eyebrow">NO MATCHES YET</p><h2>No live roles match this brief right now.</h2><p>Try widening your target role, city, or work preference. We will not fill this space with unrelated jobs.</p><button className="workspace-primary" onClick={onEditPreferences} type="button">Edit preferences <span aria-hidden="true">→</span></button></section>)
              : <>
                {search.sourceWarning && <p className="workspace-source-warning" role="status">{search.sourceWarning}</p>}
                <aside className="cpd-sherpa-brief"><span aria-hidden="true" className="cpd-sherpa-mark">S</span><div><strong>{strongFitCount} strong fit{strongFitCount === 1 ? '' : 's'} stand out today.</strong><p>These roles are ordered by the evidence already in your resume and the preferences you set. Start with the strongest match for your next clear action.</p></div></aside>
                <div className="brief-workspace-summary"><p><b>{jobs.length}</b> roles ready to review</p><span>Strongest matches first</span></div>
                <div className="cpd-job-list">
                  {jobs.map((job) => {
                    const isSaving = savingJobId === job.id
                    const matchingConnections = findCompanyConnections(job.companyName, savedConnections.connections)
                    const match = matchLabel(job.matchScore, job.isRelatedMatch)
                  return <article className="cpd-job" key={job.id}>
                    <div className="cpd-job-main">
                      <span aria-hidden="true" className="cpd-company-mark">{companyMarkFromName(job.companyName)}</span>
                      <div>
                        <div className="cpd-job-title-row"><h3>{job.title}</h3><span className="cpd-match" data-fit={match}>{match}</span></div>
                        <p className="cpd-company-line">{job.companyName}</p>
                        <div className="cpd-meta">{job.cityLabel && <span className="role-detail-location"><JobMetaIcon name="location" />{job.cityLabel}</span>}<span className="role-detail-work-mode"><JobMetaIcon name="work" />{job.workPreference}</span><span className="role-detail-date"><JobMetaIcon name="date" />{job.freshnessLabel}</span>{matchingConnections.length > 0 && <span>{matchingConnections.length} connection{matchingConnections.length === 1 ? '' : 's'}</span>}</div>
                      </div>
                    </div>
                    <div className="cpd-job-fit">
                      <strong>WHY IT FITS</strong>
                      <p>{job.fitSummary}</p>
                    </div>
                    <div className="cpd-job-actions"><button className="cpd-primary-button" onClick={() => setFocusedJob(job)} type="button">View details</button><button className="cpd-quiet-button cpd-danger" disabled={isSaving} onClick={() => void saveStatus(job.id, 'Reject')} type="button">Not interested</button></div>
                  </article>
                  })}
                </div>
              </>}
      {actionError && <p className="field-error workspace-error" role="alert">{actionError}</p>}
    </section>
    {focusedJob && <FocusedRoleView embedded={embedded} isSaving={savingJobId === focusedJob.id} job={focusedJob} onBack={() => setFocusedJob(null)} onOpenConnections={onOpenConnections} onSave={saveStatus} />}
  </WorkspaceFrame>
}
