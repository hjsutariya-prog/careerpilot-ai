import { useState } from 'react'
import './App.css'

function App() {
  const [briefReady, setBriefReady] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const [authIntent, setAuthIntent] = useState<'signIn' | 'signUp'>('signIn')
  const [jobAction, setJobAction] = useState('On Hold')

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CareerPilot home">CareerPilot<span>.AI</span></a>
        <nav aria-label="Landing page navigation" className="topbar-actions">
          <button className="sign-in" onClick={() => { setAuthIntent('signIn'); setSignInOpen(true) }} type="button">Sign in</button>
          <button className="get-started" onClick={() => { setAuthIntent('signUp'); setSignInOpen(true) }} type="button">Get started</button>
        </nav>
      </header>

      <section className="workbench" aria-labelledby="hero-heading">
        <div className="brief-builder">
          <h1 id="hero-heading">The right tech roles,<span className="headline-tail"><em>without</em> the endless search.</span></h1>
          <p className="intro">CareerPilot turns your resume and preferences into one daily brief of active roles worth opening.</p>

          <div className="hero-actions">
            <button className="build-brief" onClick={() => setBriefReady(true)} type="button">
              {briefReady ? 'Your brief is ready to start' : 'Build my daily brief'} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      <section className="story" id="how-it-works" aria-labelledby="story-heading">
        <div className="story-intro">
          <p className="eyebrow">One daily search. A clear next step.</p>
          <h2 id="story-heading">The work around job hunting is the work we remove.</h2>
        </div>

        <article className="story-chapter resume-chapter">
          <div className="chapter-copy">
            <p className="chapter-number">01 / YOUR EXPERIENCE</p>
            <h3>Start from the work you have already done.</h3>
            <p>Upload one readable PDF or DOCX resume. CareerPilot uses your roles, skills and experience with the preferences you set.</p>
          </div>
          <div className="resume-paper" aria-label="Resume upload example">
            <div className="document-tab">RESUME</div>
            <p className="resume-file">rakesh_resume.pdf</p>
            <p className="resume-meta">Readable · 6 years experience</p>
            <div className="resume-lines" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="skill-signals"><span>React</span><span>TypeScript</span><span>APIs</span></div>
            <p className="paper-note">The useful signals, without asking you to type your CV again.</p>
          </div>
        </article>

        <article className="story-chapter freshness-chapter">
          <div className="chapter-copy">
            <p className="chapter-number">02 / FRESH ROLES ONLY</p>
            <h3>Open roles get the front row.</h3>
            <p>Each brief shows up to 10 India IT roles. Newer open listings come first; related roles appear only when stronger matches run short.</p>
          </div>
          <div className="freshness-board" aria-label="Freshness rules example">
            <p className="board-label">WHAT MAKES THE LIST</p>
            <div className="freshness-rule"><span className="rule-dot lime" /><div><strong>Still open</strong><small>The original application link must work.</small></div></div>
            <div className="freshness-rule"><span className="rule-dot teal" /><div><strong>Posted within 60 days</strong><small>Older roles stay out of your brief.</small></div></div>
            <div className="freshness-rule"><span className="rule-dot coral" /><div><strong>Checked again</strong><small>Every result shows when it was last checked.</small></div></div>
          </div>
        </article>

        <article className="story-chapter actions-chapter">
          <div className="chapter-copy">
            <p className="chapter-number">03 / MAKE A MOVE</p>
            <h3>Keep your decision visible, even when it is “not now.”</h3>
            <p>Apply opens the company’s own application page. Reject and On Hold keep the decision with the job so you do not rediscover the same role later.</p>
          </div>
          <div className="action-playground" aria-live="polite">
            <p className="playground-label">SAMPLE ROLE · FRONTEND ENGINEER</p>
            <h4>What do you want to do with this one?</h4>
            <div className="action-options">
              {['Apply', 'On Hold', 'Reject'].map((action) => (
                <button aria-pressed={jobAction === action} className={jobAction === action ? `job-action ${action.toLowerCase().replace(' ', '-') } chosen` : `job-action ${action.toLowerCase().replace(' ', '-') }`} key={action} onClick={() => setJobAction(action)} type="button">
                  {action}
                </button>
              ))}
            </div>
            <p className="action-result"><span aria-hidden="true">●</span> {jobAction === 'Apply' ? 'Ready to open the company’s application page.' : jobAction === 'Reject' ? 'Marked as not for you. It will stay out of your active list.' : 'Saved for a better time. You can return to it in your tracker.'}</p>
          </div>
        </article>

        <article className="story-chapter connections-chapter">
          <div className="chapter-copy">
            <p className="chapter-number">04 / FIND A FAMILIAR NAME</p>
            <h3>See connections where the role is.</h3>
            <p>Import your LinkedIn connections CSV. CareerPilot matches people only when their current company is the company hiring.</p>
          </div>
          <div className="connection-scene" aria-label="Company connection match example">
            <div className="csv-slip"><span>CSV</span><p>My Connections</p><small>842 contacts imported</small></div>
            <div className="company-orbit">
              <p>NovaCart</p><span>Hiring company</span>
              <i className="person person-one">A</i><i className="person person-two">K</i><i className="person person-three">M</i>
            </div>
            <p className="connection-result">3 people at NovaCart</p>
          </div>
        </article>
      </section>

      <section className="closing-call" aria-labelledby="closing-heading">
        <p className="eyebrow">CareerPilot.AI</p>
        <h2 id="closing-heading">Your next job search deserves a smaller to-do list.</h2>
        <a className="closing-link" href="#top">Build my job brief <span aria-hidden="true">↑</span></a>
      </section>

      {signInOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSignInOpen(false)}>
          <section aria-labelledby="sign-in-title" className="sign-in-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button aria-label="Close sign in" className="close-button" onClick={() => setSignInOpen(false)} type="button">×</button>
            <p className="eyebrow">{authIntent === 'signUp' ? 'Start your search' : 'Welcome back'}</p>
            <h2 id="sign-in-title">{authIntent === 'signUp' ? 'Create your CareerPilot account.' : 'Sign in to CareerPilot.'}</h2>
            <p>Google and email account access are part of Milestone 6. This entry point is ready for that real flow.</p>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
