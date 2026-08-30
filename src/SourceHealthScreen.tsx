import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'

function dateTime(value: number | undefined) {
  if (!value) return 'Not checked yet'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
}

export function SourceHealthScreen({ embedded = false, onBack }: { embedded?: boolean; onBack: () => void }) {
  const health = useQuery(api.sourceHealth.mine)

  return <main className={embedded ? 'source-health-shell dashboard-source-health-shell' : 'source-health-shell'}>
    {!embedded && <header className="source-health-topbar"><button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Back to Apply</button></header>}
    <section className="source-health-content" aria-labelledby="source-health-title">
      <div className="source-health-heading">
        <p className="eyebrow">PRIVATE ADMIN VIEW</p>
        <h1 id="source-health-title">Source health</h1>
        <p>Check whether each approved Greenhouse job board refreshed successfully. This view never shows another user’s job search data.</p>
      </div>

      {health === undefined && <p className="source-health-loading">Loading source checks…</p>}
      {health && <div className="source-health-list">
        {health.map(({ source, run }) => {
          const isSuccess = run?.status === 'success'
          return <article className={isSuccess ? 'source-health-row is-success' : 'source-health-row is-attention'} key={source.token}>
            <div>
              <p className="source-health-company">{source.companyName}</p>
              <p className="source-health-board">Greenhouse board · {source.token}</p>
            </div>
            <div className="source-health-status">
              <span className={isSuccess ? 'source-status success' : 'source-status attention'}>{isSuccess ? 'Healthy' : run?.status === 'failed' ? 'Needs attention' : 'Not checked'}</span>
              <p>{dateTime(run?.completedAt)}</p>
              {isSuccess && <small>{run?.activeRetained ?? 0} India IT roles available</small>}
              {run?.status === 'failed' && <small>Refresh did not complete. The earlier job list stays available.</small>}
            </div>
          </article>
        })}
      </div>}
    </section>
  </main>
}
