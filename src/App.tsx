import { useState } from 'react'
import './App.css'

const roles = ['Frontend engineer', 'Backend engineer', 'Data analyst', 'QA engineer']
const workStyles = ['Remote first', 'Hybrid', 'On-site']
const salaryBands = ['₹10–16L', '₹16–24L', '₹24L+']

const rolesPreview = {
  'Frontend engineer': [
    ['Senior Frontend Engineer', 'NovaCart', 'React · TypeScript · 5–7 years', '92%', 'Posted 3h ago'],
    ['UI Platform Engineer', 'Metric Loop', 'Design systems · React · Remote', '88%', 'Posted today'],
    ['Frontend Developer', 'Bright Grid', 'JavaScript · APIs · Product team', '83%', 'Posted yesterday'],
  ],
  'Backend engineer': [
    ['Senior Backend Engineer', 'NovaCart', 'Node.js · PostgreSQL · APIs', '93%', 'Posted 2h ago'],
    ['Platform Engineer', 'Metric Loop', 'Java · Cloud · Remote', '87%', 'Posted today'],
    ['Backend Developer', 'Bright Grid', 'Python · Services · Product team', '82%', 'Posted yesterday'],
  ],
  'Data analyst': [
    ['Senior Data Analyst', 'NovaCart', 'SQL · Power BI · Product data', '91%', 'Posted 4h ago'],
    ['Analytics Specialist', 'Metric Loop', 'Python · Metrics · Remote', '86%', 'Posted today'],
    ['Business Data Analyst', 'Bright Grid', 'SQL · Dashboards · Stakeholders', '81%', 'Posted yesterday'],
  ],
  'QA engineer': [
    ['Senior QA Engineer', 'NovaCart', 'Automation · APIs · Playwright', '90%', 'Posted 3h ago'],
    ['Quality Engineer', 'Metric Loop', 'SDET · CI/CD · Remote', '85%', 'Posted today'],
    ['QA Automation Engineer', 'Bright Grid', 'Java · Selenium · Product team', '80%', 'Posted yesterday'],
  ],
} as const

function ChoiceRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (option: string) => void }) {
  return (
    <fieldset className="choice-row">
      <legend>{label}</legend>
      <div className="choice-options">
        {options.map((option) => (
          <button className={option === value ? 'choice selected' : 'choice'} key={option} onClick={() => onChange(option)} type="button">
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function App() {
  const [role, setRole] = useState(roles[0])
  const [workStyle, setWorkStyle] = useState(workStyles[0])
  const [salary, setSalary] = useState(salaryBands[1])
  const [briefReady, setBriefReady] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const examples = rolesPreview[role as keyof typeof rolesPreview]

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CareerPilot home">CareerPilot<span>.AI</span></a>
        <div className="topbar-actions">
          <span className="availability">India IT roles</span>
          <button className="sign-in" onClick={() => setSignInOpen(true)} type="button">Sign in</button>
        </div>
      </header>

      <section className="workbench" id="top" aria-labelledby="hero-heading">
        <div className="brief-builder">
          <p className="eyebrow">The daily brief, tuned to you</p>
          <h1 id="hero-heading">Jobs worth<br />opening.</h1>
          <p className="intro">A few clear preferences turn an endless feed into a small set of active roles you can act on with confidence.</p>

          <div className="choice-stack">
            <ChoiceRow label="Target role" onChange={setRole} options={roles} value={role} />
            <ChoiceRow label="Work style" onChange={setWorkStyle} options={workStyles} value={workStyle} />
            <ChoiceRow label="Expected salary" onChange={setSalary} options={salaryBands} value={salary} />
          </div>

          <button className="build-brief" onClick={() => setBriefReady(true)} type="button">
            {briefReady ? 'Brief ready for your resume' : 'Show my kind of roles'} <span aria-hidden="true">→</span>
          </button>
          <p className="small-print">Your resume upload comes next. CareerPilot never applies without your review.</p>
        </div>

        <aside className={briefReady ? 'match-preview ready' : 'match-preview'} aria-live="polite" aria-label="Example daily job brief">
          <div className="preview-head">
            <div>
              <p className="eyebrow">Example daily brief</p>
              <h2>Here is what<br />better looks like.</h2>
            </div>
            <span className="preview-tag">Preview only</span>
          </div>

          <div className="signal-summary">
            <span><i /> Tuned for {role}</span>
            <p>{workStyle} · {salary}</p>
          </div>

          <div className="job-stack">
            {examples.map(([title, company, detail, score, freshness], index) => (
              <article className={`job-card job-card-${index + 1}`} key={title}>
                <div className="job-card-top">
                  <span className="company-mark" aria-hidden="true">{company.slice(0, 1)}</span>
                  <span className="freshness">{freshness}</span>
                </div>
                <h3>{title}</h3>
                <p className="company-name">{company}</p>
                <p className="job-detail">{detail}</p>
                <footer>
                  <span className="match-score">{score} match</span>
                  <span>Why it fits ↗</span>
                </footer>
              </article>
            ))}
          </div>

          <div className="preview-footer">
            <p>{briefReady ? 'Next: upload your resume. CareerPilot will rank real open roles against your experience.' : 'Change the signals on the left—the brief responds before you even upload a resume.'}</p>
            <span>{briefReady ? 'READY' : 'TUNING'}</span>
          </div>
        </aside>
      </section>

      {signInOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSignInOpen(false)}>
          <section aria-labelledby="sign-in-title" className="sign-in-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button aria-label="Close sign in" className="close-button" onClick={() => setSignInOpen(false)} type="button">×</button>
            <p className="eyebrow">Welcome back</p>
            <h2 id="sign-in-title">Sign in arrives with account setup.</h2>
            <p>Google and email sign-in are part of Milestone 6. This entry point is ready for that real flow.</p>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
