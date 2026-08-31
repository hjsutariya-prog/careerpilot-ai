import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { getNextTrackerStatuses, type JobActionStatus } from './trackerJobs'
type TrackedItem = NonNullable<ReturnType<typeof useQuery<typeof api.searches.trackedJobsMine>>>[number]

function formatSavedDate(value: number) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}
function TrackerJobRow({ item, savingJobId, onSave }: { item: TrackedItem; savingJobId: string | null; onSave: (jobId: string, status: JobActionStatus) => void }) {
  const { action, job } = item
  const jobId = String(job._id)
  const isSaving = savingJobId === jobId
  const alternateActions = getNextTrackerStatuses(action.status)

  return <article className="tracker-job">
    <div className="tracker-job-main">
      <div className="tracker-job-title"><div aria-hidden="true" className="company-monogram">{job.companyName.slice(0, 1)}</div><div><h3>{job.title}</h3><p>{job.companyName}</p></div></div>
      <div className="tracker-job-meta"><span>{job.locationLabel}</span><span>{/\bremote\b/i.test(job.locationLabel) ? 'Remote' : 'India office'}</span><span>Saved {formatSavedDate(action.updatedAt)}</span></div>
    </div>
    <div className="tracker-job-actions">
      {action.status === 'Apply' && <a className="tracker-open-link" href={job.applyUrl} rel="noreferrer" target="_blank">Open application <span aria-hidden="true">↗</span></a>}
      <div className="tracker-state-actions">{alternateActions.map((status) => <button className={status === 'Reject' ? 'tracker-state reject' : 'tracker-state'} disabled={isSaving} key={status} onClick={() => onSave(jobId, status)} type="button">{status}</button>)}</div>
    </div>
  </article>
}

function TrackerSection({ title, items, savingJobId, onSave }: { title: 'Applied' | 'Resume shortlisted' | 'Interview' | 'On Hold' | 'Rejected'; items: TrackedItem[]; savingJobId: string | null; onSave: (jobId: string, status: JobActionStatus) => void }) {
  return <section aria-labelledby={'tracker-' + title.toLowerCase().replace(' ', '-')} className={'tracker-section ' + title.toLowerCase().replace(' ', '-')}>
    <div className="tracker-section-heading"><h2 id={'tracker-' + title.toLowerCase().replace(' ', '-')}>{title}</h2><span>{items.length}</span></div>
    {items.length === 0 ? <p className="tracker-section-empty">No roles here yet.</p> : <div>{items.map((item) => <TrackerJobRow item={item} key={String(item.job._id)} onSave={onSave} savingJobId={savingJobId} />)}</div>}
  </section>
}

export function TrackerScreen({ embedded = false, onBack, onOpenBrief }: { embedded?: boolean; onBack: () => void; onOpenBrief: () => void }) {
  const trackedJobs = useQuery(api.searches.trackedJobsMine)
  const saveAction = useMutation(api.jobActions.save)
  const [savingJobId, setSavingJobId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const saveStatus = async (jobId: string, status: JobActionStatus) => {
    setError('')
    setSavingJobId(jobId)
    try {
      await saveAction({ jobId, status })
    } catch {
      setError('We could not save that update. Please try again.')
    } finally {
      setSavingJobId(null)
    }
  }

  if (trackedJobs === undefined) return <main className={embedded ? 'tracker-shell dashboard-tracker-shell' : 'tracker-shell'}>{!embedded && <header className="preference-topbar results-topbar"><button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button><a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a></header>}<section aria-live="polite" className="results-loading"><span aria-hidden="true" className="loading-orbit" /><p>Opening your tracker…</p></section></main>

  const applied = trackedJobs.filter((item) => item.action.status === 'Apply')
  const shortlisted = trackedJobs.filter((item) => item.action.status === 'Resume shortlisted')
  const interview = trackedJobs.filter((item) => item.action.status === 'Interview')
  const onHold = trackedJobs.filter((item) => item.action.status === 'On Hold')
  const rejected = trackedJobs.filter((item) => item.action.status === 'Reject')
  const totalDecisions = trackedJobs.length

  return <main className={embedded ? 'tracker-shell dashboard-tracker-shell' : 'tracker-shell'}>
    {!embedded && <header className="preference-topbar results-topbar"><button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button><a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a><button className="tracker-open-brief" onClick={onOpenBrief} type="button">Open job brief <span aria-hidden="true">↗</span></button></header>}
    <section aria-labelledby="tracker-heading" className="tracker-content">
      <div className="tracker-heading"><div><p className="eyebrow">YOUR JOB TRACKER</p><h1 id="tracker-heading">Your decisions,<br /><em>in one place.</em></h1><p>Every role you act on moves out of your live brief and stays private to this account.</p></div><p className="tracker-total"><b>{totalDecisions}</b> decision{totalDecisions === 1 ? '' : 's'} saved</p></div>
      {totalDecisions === 0 ? <section className="results-empty tracker-empty"><h2>No decisions saved yet.</h2><p>Choose Apply, On Hold, or Reject from a role in your live job brief. It will appear here and leave the brief.</p><button className="results-primary" onClick={onOpenBrief} type="button">Return to my job brief <span aria-hidden="true">→</span></button></section> : <div className="tracker-sections"><TrackerSection items={applied} onSave={saveStatus} savingJobId={savingJobId} title="Applied" /><TrackerSection items={shortlisted} onSave={saveStatus} savingJobId={savingJobId} title="Resume shortlisted" /><TrackerSection items={interview} onSave={saveStatus} savingJobId={savingJobId} title="Interview" /><TrackerSection items={onHold} onSave={saveStatus} savingJobId={savingJobId} title="On Hold" /><TrackerSection items={rejected} onSave={saveStatus} savingJobId={savingJobId} title="Rejected" /></div>}
      {error && <p className="field-error results-error" role="alert">{error}</p>}
    </section>
  </main>
}
