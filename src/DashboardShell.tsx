import { useState, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { DashboardScreen } from './dashboardRouting'
import './DashboardDesign.css'

const navigation: Array<{ id: DashboardScreen; label: string; icon: 'brief' | 'tracker' | 'resume' | 'connections' | 'preferences' | 'source'; adminOnly?: boolean }> = [
  { id: 'apply', label: 'Daily Brief', icon: 'brief' },
  { id: 'tracker', label: 'Tracker', icon: 'tracker' },
  { id: 'resume', label: 'Resume', icon: 'resume' },
  { id: 'connections', label: 'Connections', icon: 'connections' },
  { id: 'preferences', label: 'Preferences', icon: 'preferences' },
  { id: 'source-health', label: 'Source health', icon: 'source', adminOnly: true },
]

function DashboardIcon({ name }: { name: (typeof navigation)[number]['icon'] }) {
  const paths = {
    brief: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="m19 15 .5 1.5L21 17l-1.5.5L19 19l-.5-1.5L17 17l1.5-.5L19 15Z" /></>,
    tracker: <><rect height="14" rx="1.5" width="4" x="4" y="5" /><rect height="14" rx="1.5" width="4" x="10" y="5" /><rect height="14" rx="1.5" width="4" x="16" y="5" /></>,
    resume: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15h6M9 18h4" /></>,
    connections: <><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="10" r="2.5" /><path d="M3.5 19.5c.7-3.1 2.7-4.7 5.5-4.7s4.9 1.6 5.5 4.7M14.5 16.3c2.7.2 4.5 1.3 5.1 3.2" /></>,
    preferences: <><path d="M4 7h16M4 17h16" /><path d="M8 5v4M16 15v4" /></>,
    source: <><path d="M5 5.5h14v13H5z" /><path d="m8 12 2.2 2.2L16 8.5" /></>,
  } as const
  return <svg aria-hidden="true" className="dashboard-nav-icon" fill="none" height="19" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24" width="19">{paths[name]}</svg>
}

export function DashboardShell({ active, children, isAdmin = false, onHome, onNavigate, onSignOut }: { active: DashboardScreen; children: ReactNode; isAdmin?: boolean; onHome: () => void; onNavigate: (screen: DashboardScreen) => void; onSignOut: () => void }) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false)
  const latestBrief = useQuery(api.searches.latestMine)
  const savedActions = useQuery(api.jobActions.mine)
  const trackedJobs = useQuery(api.searches.trackedJobsMine)
  const decidedJobIds = new Set((savedActions ?? []).map((action) => String(action.jobId)))
  const dailyBriefCount = latestBrief && savedActions
    ? latestBrief.suggestions.filter((suggestion) => suggestion.job && !decidedJobIds.has(String(suggestion.job._id))).length
    : undefined
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return <main className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <button aria-label="Return home" className="dashboard-brand" onClick={onHome} type="button"><span>Career</span><span className="dashboard-brand-pilot">Pil<span className="dashboard-brand-o" aria-hidden="true" />t</span></button>
      <nav aria-label="Dashboard navigation" className="dashboard-nav">
        <p>YOUR SEARCH</p>
        {navigation.filter((item) => !item.adminOnly || isAdmin).map((item) => <button aria-current={active === item.id ? 'page' : undefined} className={active === item.id ? 'dashboard-nav-item active' : 'dashboard-nav-item'} key={item.id} onClick={() => onNavigate(item.id)} type="button"><DashboardIcon name={item.icon} />{item.label}{item.id === 'apply' && dailyBriefCount !== undefined ? <span className="dashboard-nav-count" aria-label={`${dailyBriefCount} live jobs`}>{dailyBriefCount}</span> : item.id === 'tracker' && trackedJobs?.length ? <span className="dashboard-nav-count" aria-label={`${trackedJobs.length} tracked jobs`}>{trackedJobs.length}</span> : null}</button>)}
      </nav>
      <div className="dashboard-sidebar-footer"><button aria-controls="dashboard-account-menu" aria-expanded={accountMenuOpen} aria-label="Open account menu" className="dashboard-account" onClick={() => setAccountMenuOpen((current) => !current)} type="button"><span className="dashboard-avatar">HS</span><span><strong>Harshal Sutariya</strong><small>Product Manager</small></span><span aria-hidden="true" className="dashboard-account-chevron">›</span></button>{accountMenuOpen && <div className="dashboard-account-menu" id="dashboard-account-menu"><div className={accountDetailsOpen ? 'dashboard-account-details' : 'dashboard-account-details hidden'}><strong>Harshal Sutariya</strong><small>Product Manager</small></div><button onClick={() => setAccountDetailsOpen((current) => !current)} type="button"><span aria-hidden="true">♙</span>{accountDetailsOpen ? 'Hide account details' : 'Account details'}</button><button className="dashboard-menu-sign-out" onClick={onSignOut} type="button"><span aria-hidden="true">↪</span>Sign out</button></div>}</div>
    </aside>
    <section className={active === 'apply' ? 'dashboard-view daily-brief-view' : active === 'tracker' ? 'dashboard-view tracker-view' : active === 'resume' ? 'dashboard-view resume-view' : active === 'connections' ? 'dashboard-view connections-view' : active === 'preferences' ? 'dashboard-view preferences-view' : 'dashboard-view'}><header className="dashboard-topbar"><p>{today}</p>{active !== 'source-health' ? <button className="dashboard-topbar-action" onClick={() => onNavigate('preferences')} type="button"><DashboardIcon name="preferences" />Search preferences</button> : <div><span className="dashboard-status-dot" aria-hidden="true" />Private workspace</div>}</header>{children}</section>
  </main>
}
