import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import './App.css'
import { ResumeUpload } from './ResumeUpload'
import { ResultsScreen } from './ResultsScreen'
import { TrackerScreen } from './TrackerScreen'
import { ConnectionsScreen } from './ConnectionsScreen'
import { SourceHealthScreen } from './SourceHealthScreen'
import { DashboardShell } from './DashboardShell'
import { getDashboardStartScreen, type DashboardScreen } from './dashboardRouting'

const popularRoleOptions = ['Product Manager', 'Business Analyst', 'Data Analyst', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer']
const roleOptions = [
  'Product Manager', 'Product Analyst', 'Business Analyst', 'Data Analyst', 'Data Scientist',
  'Data Engineer', 'Analytics Engineer', 'Machine Learning Engineer', 'AI / LLM Engineer',
  'Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Mobile Developer', 'QA Engineer', 'DevOps Engineer', 'Site Reliability Engineer',
  'Cloud Engineer', 'Cybersecurity Engineer', 'UI / UX Designer',
]
const workPreferenceOptions = ['Remote', 'Hybrid', 'On-site']
const jobTypes = ['Full-time', 'Contract', 'Internship']
const metroCities = ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad']

type PreferenceErrors = Partial<Record<'roles' | 'skills' | 'experience' | 'location' | 'workPreference' | 'salary' | 'jobType' | 'notice' | 'time' | 'form', string>>

type AuthMode = 'signIn' | 'signUp'

function AuthDialog({ initialMode, onClose }: { initialMode: AuthMode; onClose: () => void }) {
  const { signIn } = useAuthActions()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')

  const continueWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.')
      return
    }

    setError('')
    setIsWorking(true)
    try {
      await signIn('password', formData)
    } catch {
      setError(mode === 'signIn' ? 'We could not sign you in with those details.' : 'We could not create that account. Try a different email address.')
    } finally {
      setIsWorking(false)
    }
  }

  const continueWithGoogle = async () => {
    setError('')
    setIsWorking(true)
    try {
      await signIn('google')
    } catch {
      setError('Google sign-in could not start. Please try again.')
      setIsWorking(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section aria-labelledby="sign-in-title" className="sign-in-dialog real-auth-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button aria-label="Close sign in" className="close-button" onClick={onClose} type="button">×</button>
        <p className="eyebrow">{mode === 'signUp' ? 'PRIVATE FROM THE START' : 'WELCOME BACK'}</p>
        <h2 id="sign-in-title">{mode === 'signUp' ? 'Your job search stays yours.' : 'Sign in to your job search.'}</h2>
        <p className="auth-intro">Create an account before adding a resume. Each resume will belong only to its signed-in owner.</p>

        <button className="google-auth" disabled={isWorking} onClick={() => void continueWithGoogle()} type="button"><span aria-hidden="true">G</span> Continue with Google</button>
        <div className="auth-divider"><span>or use email</span></div>

        <form className="auth-form" noValidate onSubmit={(event) => void continueWithPassword(event)}>
          <label>Email<input autoComplete="email" name="email" placeholder="you@example.com" type="email" /></label>
          <label>Password<input autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} name="password" placeholder="At least 8 characters" type="password" /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <input name="flow" type="hidden" value={mode} />
          <button className="email-auth" disabled={isWorking} type="submit">{isWorking ? 'One moment…' : mode === 'signIn' ? 'Sign in with email' : 'Create my account'} <span aria-hidden="true">→</span></button>
        </form>

        <p className="auth-switch">{mode === 'signIn' ? 'New to CareerPilot?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError('') }} type="button">{mode === 'signIn' ? 'Create an account' : 'Sign in instead'}</button></p>
      </section>
    </div>
  )
}

function PreferencesScreen({ embedded = false, onBack, onViewResults }: { embedded?: boolean; onBack: () => void; onViewResults: () => void }) {
  const savedPreferences = useQuery(api.preferences.mine)
  const savedResume = useQuery(api.resumes.mine)
  const savePreferences = useMutation(api.preferences.save)
  const hasHydrated = useRef(false)
  const hasSuggestedSkills = useRef(false)
  const [roles, setRoles] = useState<string[]>([])
  const [roleSearch, setRoleSearch] = useState('')
  const [skills, setSkills] = useState('')
  const [experience, setExperience] = useState('')
  const [cities, setCities] = useState<string[]>([])
  const [workPreferences, setWorkPreferences] = useState<string[]>(['Hybrid'])
  const [otherCity, setOtherCity] = useState('')
  const [showOtherCity, setShowOtherCity] = useState(false)
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [jobType, setJobType] = useState('')
  const [noticePeriod, setNoticePeriod] = useState('')
  const [companiesToAvoid, setCompaniesToAvoid] = useState('')
  const [dailyTime, setDailyTime] = useState('10:00')
  const [errors, setErrors] = useState<PreferenceErrors>({})
  const [isReady, setIsReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [skillsSuggested, setSkillsSuggested] = useState(false)

  useEffect(() => {
    if (savedPreferences === undefined || hasHydrated.current) return
    if (savedPreferences) {
      setRoles(savedPreferences.roles)
      setSkills(savedPreferences.skills)
      setExperience(String(savedPreferences.experience))
      setCities(savedPreferences.cities ?? (savedPreferences.city ? [savedPreferences.city] : []))
      setWorkPreferences(savedPreferences.workPreferences ?? (savedPreferences.workPreference ? [savedPreferences.workPreference] : ['Hybrid']))
      setSalaryMin(String(savedPreferences.salaryMin))
      setSalaryMax(String(savedPreferences.salaryMax))
      setJobType(savedPreferences.jobType)
      setNoticePeriod(savedPreferences.noticePeriod)
      setCompaniesToAvoid(savedPreferences.companiesToAvoid)
      setDailyTime(savedPreferences.dailyTime)
    }
    hasHydrated.current = true
  }, [savedPreferences])

  useEffect(() => {
    if (savedPreferences === undefined || savedResume === undefined || hasSuggestedSkills.current) return
    hasSuggestedSkills.current = true
    if (!savedPreferences?.skills && !skills && savedResume?.detectedSkills?.length) {
      setSkills(savedResume.detectedSkills.join(', '))
      setSkillsSuggested(true)
    }
  }, [savedPreferences, savedResume, skills])

  const toggleRole = (role: string) => {
    setRoles((currentRoles) => currentRoles.includes(role) ? currentRoles.filter((currentRole) => currentRole !== role) : [...currentRoles, role])
    setIsReady(false)
  }

  const toggleCity = (city: string) => {
    setCities((currentCities) => currentCities.includes(city) ? currentCities.filter((currentCity) => currentCity !== city) : [...currentCities, city])
    setIsReady(false)
  }

  const addOtherCity = () => {
    const city = otherCity.trim()
    if (!city) return
    setCities((currentCities) => currentCities.includes(city) ? currentCities : [...currentCities, city])
    setOtherCity('')
    setShowOtherCity(false)
    setIsReady(false)
  }

  const toggleWorkPreference = (preference: string) => {
    setWorkPreferences((currentPreferences) => currentPreferences.includes(preference) ? currentPreferences.filter((currentPreference) => currentPreference !== preference) : [...currentPreferences, preference])
    setIsReady(false)
  }

  const matchingRoles = roleOptions.filter((role) => role.toLowerCase().includes(roleSearch.trim().toLowerCase()))
  const additionalSelectedRoles = roles.filter((role) => !popularRoleOptions.includes(role))

  const submitPreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: PreferenceErrors = {}
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)
    const minimumSalary = Number(salaryMin)
    const maximumSalary = Number(salaryMax)

    if (roles.length === 0) nextErrors.roles = 'Choose at least one target role.'
    if (!skills.trim()) nextErrors.skills = 'Add the skills you want us to match.'
    if (!experience || Number(experience) < 0) nextErrors.experience = 'Enter your years of experience.'
    if (cities.length === 0 && workPreferences.some((preference) => preference !== 'Remote')) nextErrors.location = 'Choose at least one city for Hybrid or On-site roles.'
    if (!salaryMin || !salaryMax || minimumSalary < 0 || maximumSalary < 0 || minimumSalary > maximumSalary) nextErrors.salary = 'Enter a valid range where the minimum is not higher than the maximum.'
    if (workPreferences.length === 0) nextErrors.workPreference = 'Choose at least one work preference.'
    if (!jobType) nextErrors.jobType = 'Choose a job type.'
    if (!noticePeriod) nextErrors.notice = 'Choose your notice period.'
    if (!validTime) nextErrors.time = 'Choose a valid daily search time in India time.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setIsReady(false)
      return
    }

    setIsSaving(true)
    try {
      await savePreferences({
        roles,
        skills: skills.trim(),
        experience: Number(experience),
        cities,
        workPreferences,
        salaryMin: minimumSalary,
        salaryMax: maximumSalary,
        jobType,
        noticePeriod,
        companiesToAvoid: companiesToAvoid.trim(),
        dailyTime,
      })
      setIsReady(true)
    } catch {
      setErrors({ form: 'We could not save your preferences. Please try again.' })
      setIsReady(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className={embedded ? 'preferences-shell dashboard-preferences-shell' : 'preferences-shell'}>
      {!embedded && <header className="preference-topbar">
        <button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Home</button>
        <a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a>
      </header>}

      <div className="preferences-layout">
        <aside className="preferences-intro">
          <h1>Set your job preferences.</h1>
          <p>Tell us what you want next. We’ll use it to shape your daily job brief.</p>
          <ol className="brief-path">
            <li><span>1</span><div><strong>Choose your direction</strong><small>Roles, skills and experience</small></div></li>
            <li><span>2</span><div><strong>Set your boundaries</strong><small>Location, salary and job type</small></div></li>
            <li><span>3</span><div><strong>Pick your daily time</strong><small>One search each day, India time</small></div></li>
          </ol>
        </aside>

        <section className="preferences-panel" aria-labelledby="preferences-heading">
          <div className="panel-heading">
            <h2 id="preferences-heading">What are you looking for?</h2>
            <p>Fields marked with <b>*</b> are needed before we can search.</p>
          </div>

          <form noValidate onSubmit={(event) => void submitPreferences(event)}>
            <fieldset className="preference-fieldset">
              <legend>Target roles <b>*</b></legend>
              <div className="role-pills">
                {popularRoleOptions.map((role) => <button aria-pressed={roles.includes(role)} className={roles.includes(role) ? 'role-pill selected' : 'role-pill'} key={role} onClick={() => toggleRole(role)} type="button">{role}</button>)}
                {additionalSelectedRoles.map((role) => <button aria-pressed="true" className="role-pill selected" key={role} onClick={() => toggleRole(role)} type="button">{role}</button>)}
              </div>
              <details className="role-browser">
                <summary>Browse all roles <span aria-hidden="true">↓</span></summary>
                <div className="role-browser-panel">
                  <input aria-label="Search job roles" onChange={(event) => setRoleSearch(event.target.value)} placeholder="Search roles, e.g. cloud or data" type="search" value={roleSearch} />
                  <div className="role-browser-list">
                    {matchingRoles.map((role) => <button aria-pressed={roles.includes(role)} className={roles.includes(role) ? 'role-pill selected' : 'role-pill'} key={role} onClick={() => toggleRole(role)} type="button">{role}</button>)}
                  </div>
                  {matchingRoles.length === 0 && <p className="role-empty">No role found. Try a broader search.</p>}
                </div>
              </details>
              {errors.roles && <p className="field-error" role="alert">{errors.roles}</p>}
            </fieldset>

            <label className="form-field">
              <span>Skills <b>*</b></span>
              <input aria-invalid={Boolean(errors.skills)} onChange={(event) => { setSkills(event.target.value); setIsReady(false) }} placeholder="e.g. SQL, user research, React" type="text" value={skills} />
              <small>{skillsSuggested ? 'Suggested from your resume. Edit anything you want.' : 'Separate skills with commas.'}</small>
              {errors.skills && <p className="field-error" role="alert">{errors.skills}</p>}
            </label>

            <div className="work-details-grid">
              <label className="form-field experience-field">
                <span>Years of experience <b>*</b></span>
                <input aria-invalid={Boolean(errors.experience)} inputMode="decimal" min="0" onChange={(event) => { setExperience(event.target.value); setIsReady(false) }} placeholder="e.g. 4" type="number" value={experience} />
                {errors.experience && <p className="field-error" role="alert">{errors.experience}</p>}
              </label>
              <fieldset className="preference-fieldset work-preference-fieldset">
                <legend>Work preference <b>*</b></legend>
                <div className="segmented-options">
                  {workPreferenceOptions.map((preference) => <button aria-pressed={workPreferences.includes(preference)} className={workPreferences.includes(preference) ? 'segment selected' : 'segment'} key={preference} onClick={() => toggleWorkPreference(preference)} type="button">{preference}</button>)}
                </div>
                <small>Choose every work style you would consider.</small>
                {errors.workPreference && <p className="field-error" role="alert">{errors.workPreference}</p>}
              </fieldset>
            </div>

            <fieldset className="preference-fieldset city-selector">
              <legend>Preferred cities {workPreferences.some((preference) => preference !== 'Remote') && <b>*</b>}</legend>
              <p>Choose one or more cities. This is optional when you select only Remote.</p>
              {cities.length > 0 && <div className="city-pills">{cities.map((city) => <button aria-label={`Remove ${city}`} className="city-pill" key={city} onClick={() => toggleCity(city)} type="button">{city} <span aria-hidden="true">×</span></button>)}</div>}
              <details className="city-browser">
                <summary>{cities.length > 0 ? 'Add another city' : 'Choose metro cities'} <span aria-hidden="true">↓</span></summary>
                <div className="city-browser-panel">
                  {metroCities.map((city) => <button aria-pressed={cities.includes(city)} className={cities.includes(city) ? 'segment selected' : 'segment'} key={city} onClick={() => toggleCity(city)} type="button">{city}</button>)}
                  <button aria-expanded={showOtherCity} className="segment city-other" onClick={() => setShowOtherCity((current) => !current)} type="button">Other city</button>
                  {showOtherCity && <div className="other-city-entry"><input aria-label="Other city" onChange={(event) => setOtherCity(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addOtherCity() } }} placeholder="Enter city name" type="text" value={otherCity} /><button onClick={addOtherCity} type="button">Add</button></div>}
                </div>
              </details>
              {errors.location && <p className="field-error" role="alert">{errors.location}</p>}
            </fieldset>

            <fieldset className="preference-fieldset salary-fieldset">
              <legend>Expected annual salary, in lakh rupees <b>*</b></legend>
              <div className="salary-inputs">
                <label><span>Minimum</span><input aria-invalid={Boolean(errors.salary)} inputMode="numeric" min="0" onChange={(event) => { setSalaryMin(event.target.value); setIsReady(false) }} placeholder="10" type="number" value={salaryMin} /></label>
                <span className="salary-to" aria-hidden="true">to</span>
                <label><span>Maximum</span><input aria-invalid={Boolean(errors.salary)} inputMode="numeric" min="0" onChange={(event) => { setSalaryMax(event.target.value); setIsReady(false) }} placeholder="16" type="number" value={salaryMax} /></label>
              </div>
              {errors.salary && <p className="field-error" role="alert">{errors.salary}</p>}
            </fieldset>

            <div className="form-two-up">
              <label className="form-field">
                <span>Job type <b>*</b></span>
                <select aria-invalid={Boolean(errors.jobType)} onChange={(event) => { setJobType(event.target.value); setIsReady(false) }} value={jobType}>
                  <option value="">Choose job type</option>
                  {jobTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                {errors.jobType && <p className="field-error" role="alert">{errors.jobType}</p>}
              </label>
              <label className="form-field">
                <span>Notice period <b>*</b></span>
                <select aria-invalid={Boolean(errors.notice)} onChange={(event) => { setNoticePeriod(event.target.value); setIsReady(false) }} value={noticePeriod}>
                  <option value="">Choose notice period</option>
                  <option value="Immediately">Immediately</option>
                  <option value="15 days">15 days</option>
                  <option value="30 days">30 days</option>
                  <option value="60 days">60 days</option>
                  <option value="90 days">90 days</option>
                </select>
                {errors.notice && <p className="field-error" role="alert">{errors.notice}</p>}
              </label>
            </div>

            <label className="form-field optional-field">
              <span>Companies to avoid</span>
              <input onChange={(event) => setCompaniesToAvoid(event.target.value)} placeholder="Optional · e.g. Example Corp, Sample Systems" type="text" value={companiesToAvoid} />
            </label>

            <fieldset className="preference-fieldset schedule-fieldset">
              <legend>Daily search time <b>*</b></legend>
              <p>We will search once a day at this time in India Standard Time. Use 24-hour time, for example 09:30.</p>
              <label className="time-input"><input aria-invalid={Boolean(errors.time)} aria-label="Daily search time in India time" inputMode="numeric" maxLength={5} onChange={(event) => { setDailyTime(event.target.value); setIsReady(false) }} placeholder="09:30" type="text" value={dailyTime} /><span>IST</span></label>
              {errors.time && <p className="field-error" role="alert">{errors.time}</p>}
            </fieldset>

            <button className="save-preferences" disabled={isSaving} type="submit">{isSaving ? 'Saving preferences…' : 'Save job preferences'} <span aria-hidden="true">→</span></button>
            {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
            {isReady && <p className="form-success" role="status"><span aria-hidden="true">●</span> Preferences saved. Your next brief will use these details.</p>}
            {(isReady || savedPreferences) && <button className="view-brief" onClick={onViewResults} type="button">View my job brief <span aria-hidden="true">→</span></button>}
          </form>
        </section>
      </div>
    </main>
  )
}

function App() {
  const [screen, setScreen] = useState<'landing' | DashboardScreen>('landing')
  const [briefReady, setBriefReady] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const [authIntent, setAuthIntent] = useState<AuthMode>('signIn')
  const [jobAction, setJobAction] = useState('On Hold')
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signOut } = useAuthActions()
  const recoverOwnerData = useMutation(api.accountRecovery.recoverMine)
  const savedPreferences = useQuery(api.preferences.mine, isAuthenticated ? {} : 'skip')
  const savedResume = useQuery(api.resumes.mine, isAuthenticated ? {} : 'skip')
  const canViewSourceHealth = useQuery(api.sourceHealth.isAdmin, isAuthenticated ? {} : 'skip')
  const hasRoutedSignedInUser = useRef(false)
  const hasRecoveredOwnerData = useRef(false)
  const [ownerDataReady, setOwnerDataReady] = useState(false)
  const signOutAndClear = async () => {
    await signOut()
  }

  useEffect(() => {
    if (!isAuthenticated) {
      hasRecoveredOwnerData.current = false
      setOwnerDataReady(false)
      return
    }
    if (hasRecoveredOwnerData.current) return

    hasRecoveredOwnerData.current = true
    void recoverOwnerData().catch(() => undefined).finally(() => setOwnerDataReady(true))
  }, [isAuthenticated, recoverOwnerData])

  useEffect(() => {
    if (!isAuthenticated) {
      hasRoutedSignedInUser.current = false
      return
    }
    if (!ownerDataReady || hasRoutedSignedInUser.current || savedPreferences === undefined || savedResume === undefined) return

    hasRoutedSignedInUser.current = true
    window.sessionStorage.removeItem('careerpilot:open-resume')
    setBriefReady(false)
    setSignInOpen(false)

    setScreen(getDashboardStartScreen(Boolean(savedResume), Boolean(savedPreferences)))
  }, [isAuthenticated, ownerDataReady, savedPreferences, savedResume])

  const openDashboard = () => {
    if (isAuthenticated) {
      setScreen(getDashboardStartScreen(Boolean(savedResume), Boolean(savedPreferences)))
      return
    }
    setBriefReady(true)
    setAuthIntent('signUp')
    setSignInOpen(true)
  }

  if (screen !== 'landing') {
    const signOutFromDashboard = async () => {
      await signOutAndClear()
      setScreen('landing')
    }

    return <DashboardShell active={screen} isAdmin={canViewSourceHealth === true} onHome={() => setScreen('landing')} onNavigate={setScreen} onSignOut={() => void signOutFromDashboard()}>
      {screen === 'apply' && <ResultsScreen embedded onBack={() => setScreen('landing')} onEditPreferences={() => setScreen('preferences')} onOpenConnections={() => setScreen('connections')} onOpenTracker={() => setScreen('tracker')} />}
      {screen === 'resume' && <ResumeUpload embedded onBack={() => setScreen('landing')} onContinue={() => setScreen('preferences')} />}
      {screen === 'preferences' && <PreferencesScreen embedded onBack={() => setScreen('landing')} onViewResults={() => setScreen('apply')} />}
      {screen === 'tracker' && <TrackerScreen embedded onBack={() => setScreen('landing')} onOpenBrief={() => setScreen('apply')} />}
      {screen === 'connections' && <ConnectionsScreen embedded onBack={() => setScreen('apply')} />}
      {screen === 'source-health' && canViewSourceHealth === true && <SourceHealthScreen embedded onBack={() => setScreen('apply')} />}
    </DashboardShell>
  }

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CareerPilot home">CareerPilot<span>.AI</span></a>
        <nav aria-label="Landing page navigation" className="topbar-actions">
          {isLoading ? <span className="auth-loading">Checking account…</span> : isAuthenticated ? <button className="sign-in" onClick={() => void signOutAndClear()} type="button">Sign out</button> : <button className="sign-in" onClick={() => { setAuthIntent('signIn'); setSignInOpen(true) }} type="button">Sign in</button>}
          {isAuthenticated ? <button className="get-started" onClick={openDashboard} type="button">Open dashboard</button> : <button className="get-started" onClick={openDashboard} type="button">Get started</button>}
        </nav>
      </header>

      <section className="workbench" aria-labelledby="hero-heading">
        <div className="brief-builder">
          <h1 id="hero-heading">The right tech roles,<span className="headline-tail"><em>without</em> the endless search.</span></h1>
          <p className="intro">CareerPilot turns your resume and preferences into one daily brief of active roles worth opening.</p>

          <div className="hero-actions">
            <button className="build-brief" onClick={openDashboard} type="button">
              {isAuthenticated ? 'Open dashboard' : briefReady ? 'Your brief is ready to start' : 'Build my daily brief'} <span aria-hidden="true">→</span>
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
        <button className="closing-link" onClick={openDashboard} type="button">Build my job brief <span aria-hidden="true">↑</span></button>
      </section>

      {!isAuthenticated && signInOpen && <AuthDialog initialMode={authIntent} onClose={() => setSignInOpen(false)} />}
    </main>
  )
}

export default App
