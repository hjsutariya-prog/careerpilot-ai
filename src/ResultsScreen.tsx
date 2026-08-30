import { useState, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { findCompanyConnections } from './connectionMatching'
import { summarizeRoleDescription, toLiveJobCard } from './liveJobs'
import { getUndecidedJobs } from './trackerJobs'

type JobActionStatus = 'Apply' | 'Reject' | 'On Hold'

type ResultsScreenProps = {
  embedded?: boolean
  onBack: () => void
  onEditPreferences: () => void
  onOpenTracker: () => void
  onOpenConnections: () => void
}
function matchLabel(score: number, isRelatedMatch: boolean) {
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

export function ResultsScreen({ embedded = false, onBack, onEditPreferences, onOpenTracker, onOpenConnections }: ResultsScreenProps) {
  const brief = useQuery(api.searches.latestMine)
  const savedActions = useQuery(api.jobActions.mine)
  const savedConnections = useQuery(api.connections.mine)
  const saveAction = useMutation(api.jobActions.save)
  const requestFirstSearch = useMutation(api.searches.requestFirstSearch)
  const [savingJobId, setSavingJobId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [isStartingSearch, setIsStartingSearch] = useState(false)

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
                      <div className="job-tile-topline"><p>{index === 0 ? 'FIRST TO OPEN' : 'ROLE ' + String(index + 1).padStart(2, '0')}</p><div className="job-tile-score"><strong>{job.matchScore}</strong><span>{matchLabel(job.matchScore, job.isRelatedMatch)}</span></div></div>
                      <div className="job-tile-company"><div aria-hidden="true" className="workspace-company-mark">{job.companyName.slice(0, 1)}</div><div><h2>{job.title}</h2><p>{job.companyName}</p></div></div>
                      <div className="job-tile-meta"><span>{job.cityLabel}</span><span>{job.workPreference}</span></div>
                      <p className="job-tile-reason"><b>Why it fits</b> {job.matchReason}</p>
                      {matchingConnections.length > 0 && <section className="job-tile-connections"><p><b>Connections at {job.companyName}</b></p><div>{matchingConnections.slice(0, 2).map((connection) => connection.profileUrl ? <a href={connection.profileUrl} key={connection.profileUrl + connection.firstName + connection.lastName} rel="noreferrer" target="_blank"><span aria-hidden="true">{connection.firstName.slice(0, 1) + connection.lastName.slice(0, 1) || '•'}</span>{[connection.firstName, connection.lastName].filter(Boolean).join(' ')} <i aria-hidden="true">↗</i></a> : <span className="workspace-connection-name" key={connection.firstName + connection.lastName + connection.company}><span aria-hidden="true">{connection.firstName.slice(0, 1) + connection.lastName.slice(0, 1) || '•'}</span>{[connection.firstName, connection.lastName].filter(Boolean).join(' ')}</span>)}</div>{matchingConnections.length > 2 && <small>+{matchingConnections.length - 2} more in details</small>}</section>}
                      <details className="job-tile-details"><summary><span><b>Quick read</b><small>Role overview and key skills</small></span><i aria-hidden="true">↓</i></summary><div className="role-detail-panel"><section><p className="role-detail-label">About this role</p><p className="role-detail-summary">{summarizeRoleDescription(job.description)}</p></section>{job.skills.length > 0 && <section><p className="role-detail-label">Skills named in the listing</p><div className="role-skill-list">{job.skills.slice(0, 6).map((skill) => <span key={skill}>{skill}</span>)}</div></section>}<a href={job.applyUrl} rel="noreferrer" target="_blank">Read the full description on {job.companyName} <span aria-hidden="true">↗</span></a></div></details>
                      <footer className="job-tile-footer"><div><p>{job.freshnessLabel}</p><small>{job.checkedLabel}</small></div><div className="job-tile-actions"><a aria-disabled={isSaving} className="workspace-apply" href={job.applyUrl} onClick={() => void saveStatus(job.id, 'Apply')} rel="noreferrer" target="_blank">Apply <span aria-hidden="true">↗</span></a><button disabled={isSaving} onClick={() => void saveStatus(job.id, 'On Hold')} type="button">Hold</button><button className="reject" disabled={isSaving} onClick={() => void saveStatus(job.id, 'Reject')} type="button">Reject</button></div></footer>
                    </article>
                  })}
                </div>
              </>}
      {actionError && <p className="field-error workspace-error" role="alert">{actionError}</p>}
    </section>
  </WorkspaceFrame>
}
