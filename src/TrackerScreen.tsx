import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { JobActionStatus } from './trackerJobs'

type TrackedItem = NonNullable<ReturnType<typeof useQuery<typeof api.searches.trackedJobsMine>>>[number]
type TrackerFilter = 'Needs attention' | 'Active' | 'On hold' | 'Closed'
type TrackerStatus = 'All' | 'Applied' | 'Shortlisted' | 'Interview' | 'Offer' | 'On Hold' | 'Not Interested' | 'Employer Rejection'

function BriefSparkleIcon() {
  return <svg aria-hidden="true" height="14" viewBox="0 0 24 24" width="14" fill="none"><path d="M12 2.5 13.8 10l7.7 2-7.7 2L12 21.5 10.2 14l-7.7-2 7.7-2L12 2.5Z" fill="currentColor" /></svg>
}

function formatSavedDate(value: number) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function displayStatus(status: JobActionStatus): Exclude<TrackerStatus, 'All' | 'Offer' | 'Employer Rejection'> {
  if (status === 'Apply') return 'Applied'
  if (status === 'Resume shortlisted') return 'Shortlisted'
  if (status === 'Reject') return 'Not Interested'
  return status
}

function nextAction(status: JobActionStatus) {
  if (status === 'Apply') return 'Follow up in 5 days'
  if (status === 'Resume shortlisted') return 'Waiting for response'
  if (status === 'Interview') return 'Prepare for interview'
  if (status === 'On Hold') return 'Saved for later'
  return 'No action needed'
}

function matchesTrackerFilter(item: TrackedItem, filter: TrackerFilter) {
  if (filter === 'Active') return ['Apply', 'Resume shortlisted', 'Interview'].includes(item.action.status)
  if (filter === 'On hold') return item.action.status === 'On Hold'
  if (filter === 'Closed') return item.action.status === 'Reject'
  return ['Apply', 'Resume shortlisted', 'Interview'].includes(item.action.status)
}

function TrackerJobRow({ item }: { item: TrackedItem }) {
  const { action, job } = item
  const status = displayStatus(action.status)

  return <article className="cpd-tracker-row">
    <div className="cpd-tracker-role"><strong>{job.title} · {job.companyName}</strong><small>Saved {formatSavedDate(action.updatedAt)}</small></div>
    <span className="cpd-status" data-status={status}>{status}</span>
    <div className="cpd-tracker-action"><small>NEXT ACTION</small><span>{nextAction(action.status)}</span></div>
    <button className="cpd-row-view" type="button">View details</button>
  </article>
}

export function TrackerScreen({ embedded = false, onBack, onOpenBrief }: { embedded?: boolean; onBack: () => void; onOpenBrief: () => void }) {
  const trackedJobs = useQuery(api.searches.trackedJobsMine)
  const [activeFilter, setActiveFilter] = useState<TrackerFilter>('Needs attention')
  const [exactStatus, setExactStatus] = useState<TrackerStatus>('All')

  if (trackedJobs === undefined) return <main className={embedded ? 'tracker-shell dashboard-tracker-shell' : 'tracker-shell'}>{!embedded && <header className="preference-topbar results-topbar"><button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button><a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a></header>}<section aria-live="polite" className="results-loading"><span className="loading-orbit" /><p>Opening your tracker…</p></section></main>

  const visibleJobs = trackedJobs.filter((item) => matchesTrackerFilter(item, activeFilter) && (exactStatus === 'All' || displayStatus(item.action.status) === exactStatus))

  return <main className={embedded ? 'tracker-shell dashboard-tracker-shell' : 'tracker-shell'}>
    {!embedded && <header className="preference-topbar results-topbar"><button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button><a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a><button className="tracker-open-brief" onClick={onOpenBrief} type="button">Open job brief <span aria-hidden="true">↗</span></button></header>}
    <section aria-labelledby="tracker-heading" className="cpd-tracker-page">
      <div className="cpd-page-head"><div><span className="cpd-eyebrow">APPLICATION TRACKER</span><h1 id="tracker-heading">Know what needs your <span>attention next.</span></h1><p>Every role keeps its current status, recent activity and next useful action in one clear place.</p></div><div className="cpd-page-actions"><button className="cpd-secondary-button" onClick={onOpenBrief} type="button"><BriefSparkleIcon />Back to Daily Brief</button></div></div>
      <div className="cpd-tracker-tools">
        <div aria-label="Filter application tracker by attention" className="cpd-tracker-filters">{(['Needs attention', 'Active', 'On hold', 'Closed'] as TrackerFilter[]).map((filter) => <button aria-pressed={activeFilter === filter} className="cpd-tracker-filter" key={filter} onClick={() => setActiveFilter(filter)} type="button">{filter}</button>)}</div>
        <label className="cpd-status-filter-label"><span className="cpd-live">Exact status</span><select aria-label="Filter by exact application status" className="cpd-status-filter" onChange={(event) => setExactStatus(event.target.value as TrackerStatus)} value={exactStatus}><option value="All">All statuses</option><option>Applied</option><option>Shortlisted</option><option>Interview</option><option>Offer</option><option>On Hold</option><option>Not Interested</option><option>Employer Rejection</option></select></label>
      </div>
      {trackedJobs.length === 0 ? <section className="cpd-empty"><h3>No applications in this status.</h3><p>Choose Apply, On Hold, or Reject from your Daily Brief to add a role here.</p><button className="cpd-secondary-button" onClick={onOpenBrief} type="button">Back to Daily Brief</button></section> : visibleJobs.length === 0 ? <section className="cpd-empty"><h3>No applications in this status.</h3><p>Choose another status to see the rest of your tracker.</p></section> : <div className="cpd-tracker-list">{visibleJobs.map((item) => <TrackerJobRow item={item} key={String(item.job._id)} />)}</div>}
    </section>
  </main>
}
