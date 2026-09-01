import { useEffect, useMemo, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { previewLinkedInConnectionsCsv, type ConnectionImportPreview } from './connectionCsv'
import { sha256Text } from './resumeFingerprint'
import { detectResumeSkills } from './resumeSkills'
import { extractReadableResumeText, isSupportedResume, MAX_RESUME_BYTES } from './resumeUploadUtils'
import './OnboardingScreen.css'

type ResumePurpose = 'template' | 'master'
type OnboardingStep = 0 | 1 | 2 | 3 | 4

const cityOptions = ['Mumbai', 'Bengaluru', 'Pune', 'Delhi NCR', 'Hyderabad', 'Chennai']
const roleSuggestions = ['Product Manager', 'Platform Product Manager', 'Technical Product Manager', 'Business Analyst', 'Data Analyst']
const skillSuggestions = ['Product strategy', 'Roadmapping', 'SQL', 'Power BI', 'Jira', 'Stakeholder management', 'Data analysis', 'Agile delivery']
const MAX_CSV_BYTES = 5 * 1024 * 1024
const IMPORT_BATCH_SIZE = 200

function fileKind(fileName: string) {
  return fileName.toLowerCase().endsWith('.pdf') ? 'PDF' : 'DOCX'
}

function formatTime(value: string) {
  if (!value) return ''
  const [hourValue, minute] = value.split(':').map(Number)
  const suffix = hourValue >= 12 ? 'PM' : 'AM'
  return `${hourValue % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function OnboardingScreen({ onExit, onComplete, onSignOut }: { onExit: () => void; onComplete: () => void; onSignOut: () => void }) {
  const savedResume = useQuery(api.resumes.mine)
  const savedMaster = useQuery(api.resumes.activeMaster)
  const savedPreferences = useQuery(api.preferences.mine)
  const generateUploadUrl = useMutation(api.resumes.generateUploadUrl)
  const saveResume = useMutation(api.resumes.save)
  const rebuildMasterStructure = useMutation(api.masterResumeStructure.rebuildMine)
  const savePreferences = useMutation(api.preferences.save)
  const startImport = useMutation(api.connections.startImport)
  const saveBatch = useMutation(api.connections.saveBatch)
  const finishImport = useMutation(api.connections.finishImport)

  const [step, setStep] = useState<OnboardingStep>(0)
  const [templateName, setTemplateName] = useState('')
  const [masterName, setMasterName] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)
  const [masterBusy, setMasterBusy] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [masterError, setMasterError] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [roleInput, setRoleInput] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [experience, setExperience] = useState('')
  const [workPreferences, setWorkPreferences] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [cityInput, setCityInput] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [jobType, setJobType] = useState('Full-time')
  const [noticePeriod, setNoticePeriod] = useState('')
  const [dailyTime, setDailyTime] = useState('10:00')
  const [companiesToAvoid, setCompaniesToAvoid] = useState('')
  const [preferenceError, setPreferenceError] = useState('')
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [connectionsPreview, setConnectionsPreview] = useState<ConnectionImportPreview | null>(null)
  const [connectionsName, setConnectionsName] = useState('')
  const [connectionsBusy, setConnectionsBusy] = useState(false)
  const [connectionsMessage, setConnectionsMessage] = useState('')
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (savedResume && !templateName) setTemplateName(savedResume.fileName)
  }, [savedResume, templateName])
  useEffect(() => {
    if (savedMaster && !masterName) setMasterName(savedMaster.fileName)
  }, [savedMaster, masterName])
  useEffect(() => {
    if (!savedPreferences) return
    setRoles((current) => current.length ? current : savedPreferences.roles)
    setSkills((current) => current.length ? current : unique(savedPreferences.skills.split(',')))
    setExperience((current) => current || String(savedPreferences.experience))
    setCities((current) => current.length ? current : savedPreferences.cities ?? [])
    setWorkPreferences((current) => current.length ? current : savedPreferences.workPreferences ?? [])
    setSalaryMin((current) => current || (savedPreferences.salaryMin ? String(savedPreferences.salaryMin) : ''))
    setJobType((current) => current || savedPreferences.jobType || 'Full-time')
    setNoticePeriod((current) => current || savedPreferences.noticePeriod)
    setDailyTime((current) => current || savedPreferences.dailyTime || '10:00')
    setCompaniesToAvoid((current) => current || savedPreferences.companiesToAvoid)
  }, [savedPreferences])

  const primaryReady = Boolean(templateName)
  const selectedCities = useMemo(() => cities.join(' · '), [cities])
  const selectedWork = useMemo(() => workPreferences.join(' / '), [workPreferences])

  const uploadResume = async (event: ChangeEvent<HTMLInputElement>, purpose: ResumePurpose) => {
    const file = event.target.files?.[0]
    if (!file) return
    const setBusy = purpose === 'template' ? setTemplateBusy : setMasterBusy
    const setError = purpose === 'template' ? setTemplateError : setMasterError
    setError('')
    if (!isSupportedResume(file)) return setError('Choose a PDF or DOCX file.')
    if (!file.size) return setError('This file is empty. Choose a resume with content.')
    if (file.size > MAX_RESUME_BYTES) return setError('This file is larger than 10 MB. Choose a smaller resume.')
    setBusy(true)
    try {
      const text = await extractReadableResumeText(file)
      if (text.length < 40) throw new Error('This resume has no readable text. Export it again as a text-based PDF or DOCX.')
      const uploadUrl = await generateUploadUrl()
      const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) throw new Error('We could not upload that file. Please try again.')
      const { storageId } = await response.json() as { storageId: string }
      await saveResume({
        storageId: storageId as never,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        extractedTextLength: text.length,
        extractedText: text.slice(0, 60_000),
        detectedSkills: detectResumeSkills(text),
        contentHash: await sha256Text(text),
        purpose,
      })
      if (purpose === 'template') {
        setTemplateName(file.name)
        if (!experience) setExperience('')
      } else {
        setMasterName(file.name)
        void rebuildMasterStructure().catch(() => undefined)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'We could not read that file. Try another PDF or DOCX.')
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  const addRole = (value: string) => {
    const next = value.trim()
    if (!next) return
    setRoles((current) => unique([...current, next]))
    setRoleInput('')
  }
  const addSkill = (value: string) => {
    const next = value.trim()
    if (!next || skills.length >= 10) return
    setSkills((current) => unique([...current, next]).slice(0, 10))
    setSkillInput('')
  }
  const toggleValue = (value: string, setter: Dispatch<SetStateAction<string[]>>) => {
    setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  const saveCurrentPreferences = async () => {
    const remoteOnly = workPreferences.length === 1 && workPreferences[0] === 'Remote'
    if (!roles.length || skills.length < 3 || !experience || !workPreferences.length || (!remoteOnly && !cities.length)) {
      setPreferenceError('Add a target role, at least three skills, experience, work style, and a city unless you choose Remote only.')
      return false
    }
    setPreferenceError('')
    setPreferenceBusy(true)
    try {
      const minimum = Number(salaryMin) || 0
      await savePreferences({
        roles,
        skills: skills.join(', '),
        experience: Number(experience),
        cities,
        workPreferences,
        salaryMin: minimum,
        salaryMax: minimum,
        jobType: jobType || 'Full-time',
        noticePeriod,
        companiesToAvoid: companiesToAvoid.trim(),
        dailyTime,
      })
      return true
    } catch {
      setPreferenceError('We could not save your preferences. Please try again.')
      return false
    } finally {
      setPreferenceBusy(false)
    }
  }

  const chooseConnections = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setConnectionsPreview(null)
    setConnectionsMessage('')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) return setConnectionsMessage('Choose a CSV file exported from LinkedIn.')
    if (!file.size) return setConnectionsMessage('This CSV is empty. Export your LinkedIn Connections file again.')
    if (file.size > MAX_CSV_BYTES) return setConnectionsMessage('This CSV is larger than 5 MB. Choose a smaller Connections export.')
    try {
      setConnectionsPreview(previewLinkedInConnectionsCsv(await file.text()))
      setConnectionsName(file.name)
    } catch (error) {
      setConnectionsMessage(error instanceof Error ? error.message : 'We could not read this CSV.')
    } finally {
      event.target.value = ''
    }
  }

  const importConnections = async () => {
    if (!connectionsPreview || !connectionsName || !connectionsPreview.validConnections.length) return
    setConnectionsBusy(true)
    setConnectionsMessage('Saving your private connections…')
    try {
      const importId = await startImport({ fileName: connectionsName, totalRows: connectionsPreview.totalRows, errors: connectionsPreview.errors })
      const rows = connectionsPreview.validConnections.map(({ rowNumber: _rowNumber, ...connection }) => connection)
      for (let start = 0; start < rows.length; start += IMPORT_BATCH_SIZE) await saveBatch({ importId, connections: rows.slice(start, start + IMPORT_BATCH_SIZE) })
      await finishImport({ importId })
      setConnectionsMessage(`${rows.length.toLocaleString('en-IN')} connections imported privately.`)
      setConnectionsPreview(null)
    } catch {
      setConnectionsMessage('We could not save your connections. You can skip this step and import them later.')
    } finally {
      setConnectionsBusy(false)
    }
  }

  const next = async () => {
    if (step === 0) {
      if (!primaryReady) { setTemplateError('Upload your Primary Resume to continue.'); return }
      setStep(1); return
    }
    if (step === 1) {
      if (await saveCurrentPreferences()) setStep(2)
      return
    }
    if (step === 2) setStep(3)
  }

  const finish = async () => {
    if (await saveCurrentPreferences()) {
      setFinished(true)
      setStep(4)
    }
  }

  const steps = ['Resume', 'Job preferences', 'Connections', 'Review']
  const currentProgress = Math.min(step + 1, 4)

  return <main className="onboarding-shell">
    <header className="onboarding-header">
      <button className="onboarding-brand" onClick={onExit} type="button" aria-label="CareerPilot home">Career<span>Pil<i>o</i>t</span></button>
      <div className="onboarding-header-actions">
        <button className="onboarding-sign-out" onClick={onSignOut} type="button">Sign out</button>
        <button className="onboarding-save" onClick={onExit} type="button">Save and exit</button>
      </div>
    </header>
    <div className="onboarding-page">
      <div className="onboarding-layout">
        <aside className="onboarding-rail" aria-label="Onboarding progress">
          <span>SET UP YOUR SEARCH</span><h2>Your profile. One focused Daily Brief.</h2><p>CareerPilot uses what you share here to reduce search noise, not create more of it.</p>
          <ol>{steps.map((label, index) => <li key={label}><button className={index < step ? 'complete' : ''} aria-current={index === step ? 'step' : undefined} disabled={index > step} onClick={() => setStep(index as OnboardingStep)} type="button"><b>{index < step ? '✓' : index + 1}</b><span><strong>{label}</strong><small>{['Experience and format', 'Role, location, and priorities', 'Optional LinkedIn import', 'Confirm your profile'][index]}</small></span></button></li>)}</ol>
          <small className="onboarding-rail-note">You can change these preferences later.</small>
        </aside>
        <div className="onboarding-mobile-progress"><strong>{step === 4 ? 'Profile ready' : steps[step]}</strong><span>{step === 4 ? 'Profile ready' : `Step ${currentProgress} of 4`}</span><div><i style={{ width: `${step === 4 ? 100 : currentProgress * 25}%` }} /></div></div>
        <section className="onboarding-card">
          {step === 0 && <section className="onboarding-panel">
            <span className="onboarding-eyebrow">YOUR EXPERIENCE</span><h1>Give CareerPilot the <em>right source material.</em></h1><p className="onboarding-lead">Start with the resume you use today. Add a fuller Master Resume if you want AI tailoring to draw from more of your verified experience.</p>
            <UploadRow title="Primary Resume" required description="Start with the resume you already use. CareerPilot uses this as your main resume and preferred format." fileName={templateName} busy={templateBusy} error={templateError} onChange={(event) => void uploadResume(event, 'template')} />
            <UploadRow title="Want better AI tailoring?" description="Add a Master Resume. A fuller record of roles, projects, achievements, and skills gives CareerPilot more verified experience to choose from." fileName={masterName} busy={masterBusy} error={masterError} onChange={(event) => void uploadResume(event, 'master')} />
            <p className="onboarding-trust">⌁ <span>Resume tailoring uses only the source material you provide. You review every version before using it.</span></p>
            <div className="onboarding-actions end"><button className="onboarding-button primary" onClick={() => void next()} type="button">Continue</button></div>
          </section>}
          {step === 1 && <section className="onboarding-panel">
            <span className="onboarding-eyebrow">WHAT YOU WANT NEXT</span><h1>Define a search that <em>fits your life.</em></h1><p className="onboarding-lead">These preferences guide your Daily Brief. You can change them later, and CareerPilot will show why each role fits.</p>
            <PreferenceSection title="Role and fit" copy="Choose the work you want and give CareerPilot enough context to judge relevant roles.">
              <FieldLabel label="Target roles" required><div className="onboarding-pills">{roleSuggestions.map((role) => <button className={roles.includes(role) ? 'selected' : ''} key={role} onClick={() => toggleValue(role, setRoles)} type="button">{role}</button>)}</div><div className="onboarding-inline-add"><input onChange={(event) => setRoleInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addRole(roleInput) } }} placeholder="Search or add another role" value={roleInput} /><button onClick={() => addRole(roleInput)} type="button">Add role</button></div></FieldLabel>
              <FieldLabel label="Skills you want to use" required><div className="onboarding-pills">{skillSuggestions.map((skill) => <button className={skills.includes(skill) ? 'selected' : ''} key={skill} onClick={() => skills.includes(skill) ? setSkills((current) => current.filter((item) => item !== skill)) : addSkill(skill)} type="button">{skill}</button>)}</div><div className="onboarding-inline-add"><input onChange={(event) => setSkillInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSkill(skillInput) } }} placeholder="Search or add another skill" value={skillInput} /><button onClick={() => addSkill(skillInput)} type="button">Add skill</button></div><small>{skills.length}/10 selected · Choose at least 3.</small></FieldLabel>
              <FieldLabel label="Years of experience" required><input max="60" min="0" onChange={(event) => setExperience(event.target.value)} placeholder="e.g. 10" type="number" value={experience} /></FieldLabel>
            </PreferenceSection>
            <PreferenceSection title="Location and work style" copy="Select every work style you would consider. Cities are optional only when Remote is your sole choice.">
              <FieldLabel label="Work preference" required><div className="onboarding-check-grid">{['Remote', 'Hybrid', 'On-site'].map((option) => <label key={option}><input checked={workPreferences.includes(option)} onChange={() => toggleValue(option, setWorkPreferences)} type="checkbox" />{option}</label>)}</div></FieldLabel>
              <FieldLabel label="Preferred cities" required><div className="onboarding-pills">{cityOptions.map((city) => <button className={cities.includes(city) ? 'selected' : ''} key={city} onClick={() => toggleValue(city, setCities)} type="button">{city}</button>)}</div><div className="onboarding-inline-add"><input onChange={(event) => setCityInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (cityInput.trim()) { setCities((current) => unique([...current, cityInput])); setCityInput('') } } }} placeholder="Add another city" value={cityInput} /><button onClick={() => { if (cityInput.trim()) { setCities((current) => unique([...current, cityInput])); setCityInput('') } }} type="button">Add city</button></div></FieldLabel>
            </PreferenceSection>
            <details className="onboarding-optional"><summary>Optional search preferences <small>Add these if you want CareerPilot to narrow your Daily Brief further.</small></summary><div className="onboarding-fields"><FieldLabel label="Minimum expected salary"><input min="0" onChange={(event) => setSalaryMin(event.target.value)} placeholder="e.g. 40" type="number" value={salaryMin} /><small>Amount in lakh rupees.</small></FieldLabel><FieldLabel label="Job type"><select onChange={(event) => setJobType(event.target.value)} value={jobType}>{['Full-time', 'Contract', 'Part-time', 'Internship'].map((type) => <option key={type}>{type}</option>)}</select></FieldLabel><FieldLabel label="Notice period"><select onChange={(event) => setNoticePeriod(event.target.value)} value={noticePeriod}><option value="">Not added</option>{['Immediate', '15 days', '30 days', '45 days', '60 days', '90 days', 'More than 90 days'].map((option) => <option key={option}>{option}</option>)}</select></FieldLabel><FieldLabel label="Daily Brief time"><input onChange={(event) => setDailyTime(event.target.value)} type="time" value={dailyTime} /></FieldLabel><FieldLabel label="Companies to avoid"><input onChange={(event) => setCompaniesToAvoid(event.target.value)} placeholder="Add company names separated by commas" value={companiesToAvoid} /></FieldLabel></div></details>
            {preferenceError && <p className="onboarding-error" role="alert">{preferenceError}</p>}
            <div className="onboarding-actions"><button className="onboarding-button" onClick={() => setStep(0)} type="button">Back</button><button className="onboarding-button primary" disabled={preferenceBusy} onClick={() => void next()} type="button">{preferenceBusy ? 'Saving…' : 'Continue'}</button></div>
          </section>}
          {step === 2 && <section className="onboarding-panel">
            <span className="onboarding-eyebrow">OPTIONAL CONTEXT</span><h1>See who you already know at <em>matched companies.</em></h1><p className="onboarding-lead">CareerPilot matches the Direct Connection contacts in your LinkedIn export to companies in your Daily Brief.</p>
            <div className="onboarding-connections"><div><h3>You stay in control.</h3><p>CareerPilot uses only the LinkedIn connections file you choose to upload. It does not sign in to LinkedIn, message anyone, or make your search public.</p><ol><li>Download your LinkedIn connections export.</li><li>Upload the CSV here.</li><li>CareerPilot shows matching companies in your brief.</li></ol><details><summary>How to download your LinkedIn connections export</summary><p>In LinkedIn, open Settings &amp; Privacy, choose Data privacy, then Get a copy of your data. Request the Connections file.</p></details></div><label className="onboarding-csv"><strong>LinkedIn connections CSV</strong><input accept=".csv,text/csv" disabled={connectionsBusy} onChange={(event) => void chooseConnections(event)} type="file" /><small>Only the file you upload is used. You can remove it later.</small>{connectionsName && <b>{connectionsName}</b>}</label></div>
            {connectionsPreview && <div className="onboarding-import-ready"><strong>{connectionsPreview.validConnections.length.toLocaleString('en-IN')} connections are ready to import</strong><small>{connectionsPreview.errors.length} rows need attention</small><button className="onboarding-button primary" disabled={connectionsBusy || !connectionsPreview.validConnections.length} onClick={() => void importConnections()} type="button">{connectionsBusy ? 'Importing…' : 'Import connections'}</button></div>}
            {connectionsMessage && <p className={connectionsMessage.includes('imported') ? 'onboarding-success' : 'onboarding-error'} role="status">{connectionsMessage}</p>}
            <div className="onboarding-actions"><button className="onboarding-button" onClick={() => setStep(1)} type="button">Back</button><button className="onboarding-button primary" onClick={() => void next()} type="button">{connectionsPreview ? 'Continue without importing' : 'Skip for now'}</button></div>
          </section>}
          {step === 3 && <section className="onboarding-panel">
            <span className="onboarding-eyebrow">REVIEW YOUR PROFILE</span><h1>One check before your <em>first Daily Brief.</em></h1><p className="onboarding-lead">CareerPilot will use this profile to rank active roles. Nothing is submitted to an employer.</p>
            <div className="onboarding-review"><ReviewRow label="RESUME" value={templateName || 'Primary Resume'} copy={masterName ? `Master Resume: ${masterName}` : 'Primary Resume will also be used for AI tailoring'} onEdit={() => setStep(0)} /><ReviewRow label="ROLE AND FIT" value={roles.join(' · ') || 'Target roles not added'} copy={[skills.join(', '), experience ? `${experience} years of experience` : ''].filter(Boolean).join(' · ')} onEdit={() => setStep(1)} /><ReviewRow label="LOCATION AND WORK" value={selectedCities || 'Remote only'} copy={selectedWork || 'Work preference not added'} onEdit={() => setStep(1)} /><ReviewRow label="SEARCH PREFERENCES" value={[salaryMin ? `Minimum ₹${salaryMin} lakh` : 'No minimum salary set', jobType].join(' · ')} copy={[noticePeriod ? `Notice: ${noticePeriod}` : '', dailyTime ? `Daily Brief: ${formatTime(dailyTime)} IST` : ''].filter(Boolean).join(' · ') || 'Optional preferences not set'} onEdit={() => setStep(1)} /><ReviewRow label="CONNECTIONS" value={connectionsMessage.includes('imported') ? 'Imported privately' : 'Not imported'} copy="Optional context only. This never contacts anyone." onEdit={() => setStep(2)} /></div>
            <p className="onboarding-trust">✦ <span>Next, CareerPilot checks active roles against your experience and preferences, then prepares a small, ordered Daily Brief.</span></p>
            <div className="onboarding-actions"><button className="onboarding-button" onClick={() => setStep(2)} type="button">Back</button><button className="onboarding-button primary" disabled={preferenceBusy} onClick={() => void finish()} type="button">{preferenceBusy ? 'Finishing…' : 'Finish setup'}</button></div>
          </section>}
          {step === 4 && <section className="onboarding-panel onboarding-ready"><div className="onboarding-ready-check">✓</div><span className="onboarding-eyebrow">PROFILE READY</span><h1>Your first Daily Brief <em>is next.</em></h1><p className="onboarding-lead">CareerPilot now has enough context to check active roles, explain the strongest matches, and keep your decisions in one place.</p><div className="onboarding-ready-summary"><div><small>Primary Resume</small><strong>{templateName ? 'Added' : 'Ready'}</strong></div><div><small>Target role</small><strong>{roles[0] || 'Added'}</strong></div><div><small>Connections</small><strong>{connectionsMessage.includes('imported') ? 'Imported' : 'Optional'}</strong></div></div><button className="onboarding-button primary" disabled={!finished} onClick={onComplete} type="button">Open my Daily Brief</button></section>}
        </section>
      </div>
    </div>
  </main>
}

function UploadRow({ title, required, description, fileName, busy, error, onChange }: { title: string; required?: boolean; description: string; fileName: string; busy: boolean; error: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <div className={required ? 'onboarding-upload primary-upload' : 'onboarding-upload'}><div><h3>{title} {required && <b>REQUIRED</b>}{!required && <small>OPTIONAL</small>}</h3><p>{description}</p></div><label className="onboarding-file"><input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={onChange} type="file" /><span>{busy ? 'Reading your resume…' : fileName ? `${fileKind(fileName)} · Replace file` : 'Choose file'}</span><small className={fileName ? 'ready' : ''}>{error || (fileName ? `${fileName} · Resume ready` : 'PDF or DOCX, up to 10 MB')}</small></label></div>
}

function PreferenceSection({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return <section className="onboarding-preference-section"><div><h3>{title}</h3><p>{copy}</p></div><div className="onboarding-fields">{children}</div></section>
}

function FieldLabel({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="onboarding-field"><span>{label}{required && <b> *</b>}</span>{children}</label>
}

function ReviewRow({ label, value, copy, onEdit }: { label: string; value: string; copy: string; onEdit: () => void }) {
  return <div className="onboarding-review-row"><span>{label}</span><div><strong>{value}</strong><p>{copy}</p></div><button onClick={onEdit} type="button">Edit</button></div>
}
