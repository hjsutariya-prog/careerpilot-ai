import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { sampleJobs, sampleSnapshotLabel } from './data/sampleJobs'
import { getSuggestedJobs } from './jobMatching'
import { getUndecidedJobs } from './trackerJobs'
import { findCompanyConnections } from './connectionMatching'

type JobActionStatus = 'Apply' | 'Reject' | 'On Hold'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00.000Z`))
}

function matchLabel(score: number, isRelatedMatch: boolean) {
  if (isRelatedMatch) return 'Related role'
  if (score >= 80) return 'Strong fit'
  if (score >= 60) return 'Good fit'
  return 'Potential fit'
}

export function ResultsScreen({ onBack, onEditPreferences, onOpenTracker, onOpenConnections }: { onBack: () => void; onEditPreferences: () => void; onOpenTracker: () => void; onOpenConnections: () => void }) {
  const preferences = useQuery(api.preferences.mine)
  const savedActions = useQuery(api.jobActions.mine)
  const savedConnections = useQuery(api.connections.mine)
  const saveAction = useMutation(api.jobActions.save)
  const [savingJobId, setSavingJobId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  if (preferences === undefined || savedActions === undefined || savedConnections === undefined) {
    return <main className="results-shell"><header className="preference-topbar results-topbar"><button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button><a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a></header><section className="results-loading" aria-live="polite"><span className="loading-orbit" aria-hidden="true" /><p>Preparing your job brief…</p></section></main>
  }

  if (!preferences) {
    return <main className="results-shell"><header className="preference-topbar results-topbar"><button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button><a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a></header><section className="results-empty"><p className="eyebrow">YOUR JOB BRIEF</p><h1>Set your preferences first.</h1><p>We need your role, skills, location, and work style before we can shape a brief around you.</p><button className="results-primary" onClick={onEditPreferences} type="button">Set job preferences <span aria-hidden="true">→</span></button></section></main>
  }

  const rankedJobs = getSuggestedJobs({
    roles: preferences.roles,
    skills: preferences.skills,
    experience: preferences.experience,
    cities: preferences.cities ?? (preferences.city ? [preferences.city] : []),
    workPreferences: preferences.workPreferences ?? (preferences.workPreference ? [preferences.workPreference] : []),
    jobType: preferences.jobType,
    companiesToAvoid: preferences.companiesToAvoid,
  }, sampleJobs)
  const jobs = getUndecidedJobs(rankedJobs, savedActions)

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

  return (
    <main className="results-shell">
      <header className="preference-topbar results-topbar">
        <button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button>
        <a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a>
      </header>

      <section className="results-content" aria-labelledby="results-heading">
        <div className="results-heading">
          <div><p className="eyebrow">YOUR JOB BRIEF</p><h1 id="results-heading">A smaller list.<br /><em>Better next moves.</em></h1><p>Roles picked from your saved preferences, with the strongest fits at the front.</p></div>
          <div className="results-heading-actions"><button className="my-tracker" onClick={onOpenTracker} type="button">My tracker <span aria-hidden="true">↗</span></button><button className="my-connections" onClick={onOpenConnections} type="button">Connections <span aria-hidden="true">↗</span></button><button className="edit-preferences" onClick={onEditPreferences} type="button">Edit preferences <span aria-hidden="true">↗</span></button></div>
        </div>

        <div className="brief-signal"><div><span aria-hidden="true">●</span><p><strong>{sampleSnapshotLabel}</strong><small>Every role shows the date its original link was last checked.</small></p></div><p><b>{jobs.length}</b> roles selected<br />for this brief</p></div>

        {jobs.length === 0 ? (
          savedActions.length > 0 && rankedJobs.length > 0 ? <section className="results-empty results-empty-inline"><h2>You have decided on every job in this brief.</h2><p>Your choices are saved privately in your tracker. We will not show the same roles again here.</p><div className="results-empty-actions"><button className="results-primary" onClick={onOpenTracker} type="button">Open my tracker <span aria-hidden="true">→</span></button><button className="results-secondary" onClick={onEditPreferences} type="button">Edit preferences</button></div></section> : <section className="results-empty results-empty-inline"><h2>No matching snapshot jobs right now.</h2><p>Try adjusting your target roles, city, work preference, or job type. We will not fill this list with unrelated roles.</p><button className="results-primary" onClick={onEditPreferences} type="button">Edit job preferences <span aria-hidden="true">→</span></button></section>
        ) : (
          <>
            <div className="results-count"><p>Your strongest matches first</p><span>Up to 10 results</span></div>
            <div className="job-results-list">
              {jobs.map((job, index) => {
                const isSaving = savingJobId === job.id
                const label = matchLabel(job.matchScore, job.isRelatedMatch)
                const matchingConnections = findCompanyConnections(job.companyName, savedConnections.connections)
                return <article className={index === 0 ? 'result-job top-pick' : 'result-job'} key={job.id}>
                  <div className="result-job-index" aria-hidden="true"><span>{String(index + 1).padStart(2, '0')}</span>{index === 0 && <i />}</div>
                  <div className="result-job-main">
                    {index === 0 && <p className="top-pick-label">First to open</p>}
                    <div className="result-job-title"><div className="company-monogram" aria-hidden="true">{job.companyName.slice(0, 1)}</div><div><h2>{job.title}</h2><p>{job.companyName}</p></div></div>
                    <div className="result-job-meta"><span>{job.cityLabel}</span><span>{job.workPreference}</span><span>{job.jobType}</span><span>{job.experienceRequired}</span></div>
                    <div className="match-evidence"><span className={job.isRelatedMatch ? 'fit-label related-match' : 'fit-label'}>{label}</span><p><b>Why it fits</b> {job.matchReason}</p></div>
                    {matchingConnections.length > 0 && <section className="job-connection-strip"><p><b>Connections at {job.companyName}</b></p><div>{matchingConnections.slice(0, 2).map((connection) => connection.profileUrl ? <a href={connection.profileUrl} key={`${connection.profileUrl}-${connection.firstName}-${connection.lastName}`} rel="noreferrer" target="_blank"><span aria-hidden="true">{`${connection.firstName.slice(0, 1)}${connection.lastName.slice(0, 1)}` || '•'}</span>{[connection.firstName, connection.lastName].filter(Boolean).join(' ')} <i aria-hidden="true">↗</i></a> : <span className="connection-name" key={`${connection.firstName}-${connection.lastName}-${connection.company}`}><span aria-hidden="true">{`${connection.firstName.slice(0, 1)}${connection.lastName.slice(0, 1)}` || '•'}</span>{[connection.firstName, connection.lastName].filter(Boolean).join(' ')}</span>)}</div>{matchingConnections.length > 2 && <small>+{matchingConnections.length - 2} more in Role details</small>}</section>}
                  <details className="result-job-details"><summary>Role details <span aria-hidden="true">↓</span></summary><p>{job.description}</p><div>{job.skills.slice(0, 6).map((skill) => <span key={skill}>{skill}</span>)}</div>{matchingConnections.length > 2 && <section className="job-connections"><p><b>More connections at {job.companyName}</b></p><div>{matchingConnections.slice(2, 5).map((connection) => <article key={`${connection.profileUrl}-${connection.firstName}-${connection.lastName}`}><span aria-hidden="true">{`${connection.firstName.slice(0, 1)}${connection.lastName.slice(0, 1)}` || '•'}</span><p><strong>{[connection.firstName, connection.lastName].filter(Boolean).join(' ')}</strong><small>{connection.position || 'Position not listed'}</small></p>{connection.profileUrl && <a href={connection.profileUrl} rel="noreferrer" target="_blank">View profile ↗</a>}</article>)}</div>{matchingConnections.length > 5 && <small className="more-connections">+{matchingConnections.length - 5} more connection{matchingConnections.length - 5 === 1 ? '' : 's'}</small>}</section>}</details>
                  </div>
                  <aside className="result-job-action">
                    <div className="match-meter"><strong>{job.matchScore}</strong><span>Match strength</span></div>
                    <div className="freshness-copy"><p className="freshness-label">Posted {formatDate(job.postedDate)}</p><p className="checked-label">Checked {formatDate(job.lastCheckedDate)}</p></div>
                    <div className="job-action-buttons">
                      <a aria-disabled={isSaving} className="job-apply" href={job.applyUrl} onClick={() => void saveStatus(job.id, 'Apply')} rel="noreferrer" target="_blank">Apply <span aria-hidden="true">↗</span></a>
                      <button className="job-state" disabled={isSaving} onClick={() => void saveStatus(job.id, 'On Hold')} type="button">On Hold</button>
                      <button className="job-state reject" disabled={isSaving} onClick={() => void saveStatus(job.id, 'Reject')} type="button">Reject</button>
                    </div>
                  </aside>
                </article>
              })}
            </div>
          </>
        )}
        {actionError && <p className="field-error results-error" role="alert">{actionError}</p>}
      </section>
    </main>
  )
}
