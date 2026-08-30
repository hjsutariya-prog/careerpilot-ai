import type { ReactNode } from 'react'
import type { DashboardScreen } from './dashboardRouting'

const navigation: Array<{ id: DashboardScreen; label: string; glyph: string; adminOnly?: boolean }> = [
  { id: 'apply', label: 'Apply', glyph: 'A' },
  { id: 'resume', label: 'Resume', glyph: 'R' },
  { id: 'tracker', label: 'Tracker', glyph: 'T' },
  { id: 'connections', label: 'Connections', glyph: 'C' },
  { id: 'preferences', label: 'Preferences', glyph: 'P' },
  { id: 'source-health', label: 'Source health', glyph: 'S', adminOnly: true },
]

export function DashboardShell({ active, children, isAdmin = false, onHome, onNavigate, onSignOut }: { active: DashboardScreen; children: ReactNode; isAdmin?: boolean; onHome: () => void; onNavigate: (screen: DashboardScreen) => void; onSignOut: () => void }) {
  return <main className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <button aria-label="Return home" className="dashboard-brand" onClick={onHome} type="button">CareerPilot<span>.AI</span></button>
      <nav aria-label="Dashboard navigation" className="dashboard-nav">
        <p>Workspace</p>
        {navigation.filter((item) => !item.adminOnly || isAdmin).map((item) => <button aria-current={active === item.id ? 'page' : undefined} className={active === item.id ? 'dashboard-nav-item active' : 'dashboard-nav-item'} key={item.id} onClick={() => onNavigate(item.id)} type="button"><span aria-hidden="true">{item.glyph}</span>{item.label}</button>)}
      </nav>
      <button className="dashboard-sign-out" onClick={onSignOut} type="button">Sign out <span aria-hidden="true">→</span></button>
    </aside>
    <section className="dashboard-view">{children}</section>
  </main>
}
