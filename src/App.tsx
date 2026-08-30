import './App.css'

function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CareerPilot home">
          CareerPilot<span>.AI</span>
        </a>
        <p className="topbar-note">For Indian IT job seekers</p>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="eyebrow">A calmer way to change jobs</p>
          <h1 id="hero-heading">Your next role, before it closes.</h1>
          <p className="hero-summary">
            CareerPilot turns your resume and preferences into a focused daily brief of active IT roles—so you spend less time searching and more time choosing.
          </p>
          <a className="primary-action" href="#how-it-works">
            See how it works <span aria-hidden="true">→</span>
          </a>
          <p className="action-note">You always review a job before opening its application page.</p>
        </div>

        <aside className="signal-panel" aria-label="CareerPilot search promise">
          <div className="panel-heading">
            <p>Daily role brief</p>
            <span>India time</span>
          </div>
          <div className="signal-line">
            <span className="signal-number">01</span>
            <div>
              <strong>Read the resume</strong>
              <p>PDF or DOCX, with clear feedback if it cannot be read.</p>
            </div>
          </div>
          <div className="signal-line">
            <span className="signal-number">02</span>
            <div>
              <strong>Check active roles</strong>
              <p>Newer, open IT jobs come first. Stale links stay out.</p>
            </div>
          </div>
          <div className="signal-line">
            <span className="signal-number">03</span>
            <div>
              <strong>Make the next move</strong>
              <p>Apply, reject, hold, or see a connection at the company.</p>
            </div>
          </div>
        </aside>
      </section>

      <section className="how-it-works" id="how-it-works" aria-labelledby="how-heading">
        <div>
          <p className="eyebrow">The first flow</p>
          <h2 id="how-heading">A short setup. A useful brief.</h2>
        </div>
        <ol className="steps">
          <li>
            <span>01</span>
            <p>Upload your resume.</p>
          </li>
          <li>
            <span>02</span>
            <p>Tell us the role, salary, location, and schedule you want.</p>
          </li>
          <li>
            <span>03</span>
            <p>Review up to 10 active roles and decide what to do next.</p>
          </li>
        </ol>
      </section>
    </main>
  )
}

export default App
