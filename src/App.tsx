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
import { CareerPilotLanding } from './CareerPilotLanding'
import { CareerPilotSignIn, type CareerPilotAuthMode } from './CareerPilotSignIn'
import { CareerPilotSignUp } from './CareerPilotSignUp'
import { OnboardingScreen } from './OnboardingScreen'

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

type AuthMode = CareerPilotAuthMode

function getAuthRoute(pathname = window.location.pathname): AuthMode | null {
  if (pathname === '/sign-in') return 'signIn'
  if (pathname === '/sign-up') return 'signUp'
  return null
}

function getAuthPath(mode: AuthMode) {
  return mode === 'signIn' ? '/sign-in' : '/sign-up'
}

function isOnboardingPath(pathname = window.location.pathname) {
  return pathname === '/onboarding'
}

function isDashboardPath(pathname = window.location.pathname) {
  return pathname === '/dashboard'
}

function AuthDialog({ mode, onClose, onNavigate }: { mode: AuthMode; onClose: () => void; onNavigate: (mode: AuthMode) => void }) {
  const { signIn } = useAuthActions()

  const continueWithPassword = async ({ email, password }: { email: string; password: string }) => {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return 'Enter a valid email address.'
    }
    if (password.length < 8) {
      return 'Use a password with at least 8 characters.'
    }

    const formData = new FormData()
    formData.set('email', email)
    formData.set('password', password)
    formData.set('flow', mode)
    try {
      await signIn('password', formData)
    } catch {
      return mode === 'signIn' ? 'We could not sign you in with those details.' : 'We could not create that account. Try a different email address.'
    }
  }

  const continueWithGoogle = async () => {
    try {
      await signIn('google')
    } catch {
      return 'Google sign-in could not start. Please try again.'
    }
  }

  if (mode === 'signUp') {
    return <CareerPilotSignUp
      onClose={onClose}
      onGoogle={continueWithGoogle}
      onPassword={continueWithPassword}
      onSignIn={() => onNavigate('signIn')}
    />
  }

  return <CareerPilotSignIn
    mode={mode}
    onClose={onClose}
    onGoogle={continueWithGoogle}
    onPassword={continueWithPassword}
    onToggleMode={() => onNavigate('signUp')}
  />
}

function PreferencesScreen({ embedded = false, onBack, onViewResults }: { embedded?: boolean; onBack: () => void; onViewResults: () => void }) {
  const savedPreferences = useQuery(api.preferences.mine)
  const savedResume = useQuery(api.resumes.mine)
  const savePreferences = useMutation(api.preferences.save)
  const hasHydrated = useRef(false)
  const hasSuggestedSkills = useRef(false)
  const [roles, setRoles] = useState<string[]>([])
  const [roleSearch, setRoleSearch] = useState('')
  const [skillInput, setSkillInput] = useState('')
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
  const selectedSkills = skills.split(',').map((skill) => skill.trim()).filter(Boolean)

  const addRole = () => {
    const role = roleSearch.trim()
    if (!role || roles.includes(role)) return
    setRoles((currentRoles) => [...currentRoles, role])
    setRoleSearch('')
    setIsReady(false)
  }

  const addSkill = () => {
    const skill = skillInput.trim()
    if (!skill || selectedSkills.some((currentSkill) => currentSkill.toLowerCase() === skill.toLowerCase())) return
    setSkills([...selectedSkills, skill].join(', '))
    setSkillInput('')
    setIsReady(false)
  }

  const removeSkill = (skill: string) => {
    setSkills(selectedSkills.filter((currentSkill) => currentSkill !== skill).join(', '))
    setIsReady(false)
  }

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

  if (embedded) return <main className="preferences-shell dashboard-preferences-shell">
    <section aria-labelledby="preferences-heading" className="cpd-preferences-page">
      <div className="cpd-page-head"><div><span className="cpd-eyebrow">SEARCH PREFERENCES</span><h1 id="preferences-heading">Keep your Daily Brief <span>focused.</span></h1><p>Update what matters to your next move. Changes will guide the next search without rewriting your current tracker.</p></div></div>
      <form className="cpd-preferences-form" noValidate onSubmit={(event) => void submitPreferences(event)}>
        <section className="cpd-preference-section"><div><h2>Roles and skills</h2><p>Sherpa uses these to distinguish strong-fit roles from generic matches.</p></div><div className="cpd-preference-fields"><div className="cpd-preference-field cpd-span-two"><label>Target roles</label><div className="cpd-selected-row">{roles.map((role) => <button aria-label={`Remove ${role}`} className="cpd-selected-chip" key={role} onClick={() => toggleRole(role)} type="button">{role} ×</button>)}</div><div className="cpd-inline-add"><input aria-label="Add target role" onChange={(event) => setRoleSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addRole() } }} placeholder="Search or add another role" type="text" value={roleSearch} /><button className="cpd-secondary-button" onClick={addRole} type="button">Add role</button></div>{errors.roles && <p className="cpd-field-error" role="alert">{errors.roles}</p>}</div><div className="cpd-preference-field cpd-span-two"><label>Priority skills</label><div className="cpd-selected-row">{selectedSkills.map((skill) => <button aria-label={`Remove ${skill}`} className="cpd-selected-chip" key={skill} onClick={() => removeSkill(skill)} type="button">{skill} ×</button>)}</div><div className="cpd-inline-add"><input aria-label="Add priority skill" onChange={(event) => setSkillInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSkill() } }} placeholder="Add another priority skill" type="text" value={skillInput} /><button className="cpd-secondary-button" onClick={addSkill} type="button">Add skill</button></div><small className="cpd-field-hint">{skillsSuggested ? 'Suggested from your resume. Edit anything you want.' : 'Add the skills you want us to match.'}</small>{errors.skills && <p className="cpd-field-error" role="alert">{errors.skills}</p>}</div></div></section>
        <section className="cpd-preference-section"><div><h2>Location and work</h2><p>Cities are needed only when Hybrid or On-site is selected.</p></div><div className="cpd-preference-fields"><div className="cpd-preference-field cpd-span-two"><label>Work preference</label><div className="cpd-choice-row">{workPreferenceOptions.map((preference) => <button aria-pressed={workPreferences.includes(preference)} className={workPreferences.includes(preference) ? 'cpd-choice selected' : 'cpd-choice'} key={preference} onClick={() => toggleWorkPreference(preference)} type="button">{preference}</button>)}</div>{errors.workPreference && <p className="cpd-field-error" role="alert">{errors.workPreference}</p>}</div><div className="cpd-preference-field cpd-span-two"><label>Preferred cities</label><div className="cpd-choice-row">{metroCities.map((city) => <button aria-pressed={cities.includes(city)} className={cities.includes(city) ? 'cpd-choice selected' : 'cpd-choice'} key={city} onClick={() => toggleCity(city)} type="button">{city}</button>)}<button aria-pressed={showOtherCity} className={showOtherCity ? 'cpd-choice selected' : 'cpd-choice'} onClick={() => setShowOtherCity((current) => !current)} type="button">Other city</button></div>{cities.some((city) => !metroCities.includes(city)) && <div className="cpd-selected-row">{cities.filter((city) => !metroCities.includes(city)).map((city) => <button aria-label={`Remove ${city}`} className="cpd-selected-chip" key={city} onClick={() => toggleCity(city)} type="button">{city} ×</button>)}</div>}{showOtherCity && <div className="cpd-inline-add"><input aria-label="Other city" onChange={(event) => setOtherCity(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addOtherCity() } }} placeholder="Search or add another city" type="text" value={otherCity} /><button className="cpd-secondary-button" onClick={addOtherCity} type="button">Add city</button></div>}{errors.location && <p className="cpd-field-error" role="alert">{errors.location}</p>}</div></div></section>
        <details className="cpd-optional-preferences"><summary><span>Optional search preferences<small>Add these only if you want to narrow the Daily Brief further.</small></span></summary><div className="cpd-optional-body"><div className="cpd-preference-fields"><label className="cpd-preference-field"><span>Minimum expected salary · Optional</span><input min="0" onChange={(event) => setSalaryMin(event.target.value)} placeholder="e.g. 40" type="number" value={salaryMin} /></label><label className="cpd-preference-field"><span>Job type · Optional</span><select onChange={(event) => setJobType(event.target.value)} value={jobType}><option value="">Choose job type</option>{jobTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label className="cpd-preference-field"><span>Notice period · Optional</span><select onChange={(event) => setNoticePeriod(event.target.value)} value={noticePeriod}><option value="">Choose notice period</option>{['Immediately', '15 days', '30 days', '60 days', '90 days'].map((period) => <option key={period}>{period}</option>)}</select></label><label className="cpd-preference-field"><span>Daily Brief time</span><input onChange={(event) => setDailyTime(event.target.value)} type="time" value={dailyTime} /></label><label className="cpd-preference-field cpd-span-two"><span>Companies to avoid · Optional</span><input onChange={(event) => setCompaniesToAvoid(event.target.value)} placeholder="Add company names separated by commas" type="text" value={companiesToAvoid} /></label></div></div></details>
        <div className="cpd-form-actions"><button className="cpd-primary-button" disabled={isSaving} type="submit">{isSaving ? 'Saving changes…' : 'Save changes'}</button></div>
        {errors.form && <p className="cpd-field-error" role="alert">{errors.form}</p>}{isReady && <p className="cpd-preferences-success" role="status">✓ Preferences saved. Your next brief will use these details.</p>}
      </form>
    </section>
  </main>

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
  const [screen, setScreen] = useState<'landing' | DashboardScreen>(() => isOnboardingPath() ? 'onboarding' : 'landing')
  const [authRoute, setAuthRoute] = useState<AuthMode | null>(() => getAuthRoute())
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
    const startScreen = getDashboardStartScreen(Boolean(savedResume), Boolean(savedPreferences))
    window.history.replaceState(null, '', startScreen === 'onboarding' ? '/onboarding' : isDashboardPath() ? '/dashboard' : '/')
    setAuthRoute(null)

    setScreen(getDashboardStartScreen(Boolean(savedResume), Boolean(savedPreferences)))
  }, [isAuthenticated, ownerDataReady, savedPreferences, savedResume])

  useEffect(() => {
    const syncAuthRoute = () => setAuthRoute(getAuthRoute())
    window.addEventListener('popstate', syncAuthRoute)
    return () => window.removeEventListener('popstate', syncAuthRoute)
  }, [])

  const openAuth = (mode: AuthMode) => {
    window.history.pushState(null, '', getAuthPath(mode))
    setAuthRoute(mode)
  }

  const closeAuth = () => {
    window.history.pushState(null, '', '/')
    setAuthRoute(null)
  }

  const openDashboard = () => {
    if (isAuthenticated) {
      if (getDashboardStartScreen(Boolean(savedResume), Boolean(savedPreferences)) === 'onboarding') {
        openOnboarding()
      } else {
        window.history.pushState(null, '', '/dashboard')
        setScreen('apply')
      }
      return
    }
    openAuth('signUp')
  }

  const openOnboarding = () => {
    window.history.pushState(null, '', '/onboarding')
    setScreen('onboarding')
  }

  if (screen === 'onboarding' && isAuthenticated) {
    return <OnboardingScreen
      onExit={() => {
        window.history.pushState(null, '', '/')
        setScreen('landing')
      }}
      onComplete={() => {
        window.history.replaceState(null, '', '/dashboard')
        setScreen('apply')
      }}
    />
  }

  if (screen !== 'landing') {
    const signOutFromDashboard = async () => {
      await signOutAndClear()
      setScreen('landing')
    }

    const navigateDashboard = (nextScreen: DashboardScreen) => {
      window.history.pushState(null, '', '/dashboard')
      setScreen(nextScreen)
    }

    return <DashboardShell active={screen} isAdmin={canViewSourceHealth === true} onHome={() => setScreen('landing')} onNavigate={navigateDashboard} onSignOut={() => void signOutFromDashboard()}>
      {screen === 'apply' && <ResultsScreen embedded onBack={() => setScreen('landing')} onEditPreferences={() => setScreen('preferences')} onOpenConnections={() => setScreen('connections')} onOpenTracker={() => setScreen('tracker')} />}
      {screen === 'resume' && <ResumeUpload embedded onBack={() => setScreen('landing')} onContinue={() => setScreen('preferences')} />}
      {screen === 'preferences' && <PreferencesScreen embedded onBack={() => setScreen('landing')} onViewResults={() => setScreen('apply')} />}
      {screen === 'tracker' && <TrackerScreen embedded onBack={() => setScreen('landing')} onOpenBrief={() => setScreen('apply')} />}
      {screen === 'connections' && <ConnectionsScreen embedded onBack={() => setScreen('apply')} />}
      {screen === 'source-health' && canViewSourceHealth === true && <SourceHealthScreen embedded onBack={() => setScreen('apply')} />}
    </DashboardShell>
  }

  return <>
    <CareerPilotLanding
      onGetStarted={() => {
        if (isAuthenticated) openOnboarding()
        else openDashboard()
      }}
      onSignIn={() => {
        if (isAuthenticated) openDashboard()
        else openAuth('signIn')
      }}
    />
    {!isLoading && !isAuthenticated && authRoute && <AuthDialog mode={authRoute} onClose={closeAuth} onNavigate={openAuth} />}
  </>
}

export default App
