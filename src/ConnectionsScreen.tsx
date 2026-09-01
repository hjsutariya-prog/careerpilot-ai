import { useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { previewLinkedInConnectionsCsv, type ConnectionImportPreview } from './connectionCsv'

const MAX_CSV_BYTES = 5 * 1024 * 1024
const IMPORT_BATCH_SIZE = 200

function formatImportDate(value: number) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function companyMarkFromName(companyName: string) {
  const words = companyName.match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)/g) ?? [companyName]
  return words.length > 1 ? words.map((word) => word[0]).join('').slice(0, 2).toUpperCase() : companyName.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase()
}

function ConnectionsCsvHelp() {
  return <details className="cpd-csv-help"><summary>How to download your LinkedIn connections export</summary><p>In LinkedIn, open Settings &amp; Privacy, choose Data privacy, then Get a copy of your data. Request the Connections file.</p></details>
}

export function ConnectionsScreen({ embedded = false, onBack }: { embedded?: boolean; onBack: () => void }) {
  const savedConnections = useQuery(api.connections.mine)
  const latestBrief = useQuery(api.searches.latestMine)
  const trackedJobs = useQuery(api.searches.trackedJobsMine)
  const startImport = useMutation(api.connections.startImport)
  const saveBatch = useMutation(api.connections.saveBatch)
  const finishImport = useMutation(api.connections.finishImport)
  const [preview, setPreview] = useState<ConnectionImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMessage('')
    setPreview(null)
    setFileName('')
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setMessage('Choose a CSV file exported from LinkedIn.')
      return
    }
    if (file.size === 0) {
      setMessage('This CSV is empty. Export your LinkedIn Connections file again.')
      return
    }
    if (file.size > MAX_CSV_BYTES) {
      setMessage('This CSV is larger than 5 MB. Choose a smaller Connections export.')
      return
    }

    try {
      const nextPreview = previewLinkedInConnectionsCsv(await file.text())
      setPreview(nextPreview)
      setFileName(file.name)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not read this CSV. Export it from LinkedIn and try again.')
    }
  }

  const saveConnections = async () => {
    if (!preview || !fileName || preview.validConnections.length === 0) return
    setIsSaving(true)
    setMessage('Saving your private connections…')
    try {
      const importId = await startImport({ fileName, totalRows: preview.totalRows, errors: preview.errors })
      const connections = preview.validConnections.map(({ rowNumber: _rowNumber, ...connection }) => connection)
      for (let start = 0; start < connections.length; start += IMPORT_BATCH_SIZE) {
        await saveBatch({ importId, connections: connections.slice(start, start + IMPORT_BATCH_SIZE) })
        setMessage(`Saving ${Math.min(start + IMPORT_BATCH_SIZE, connections.length).toLocaleString('en-IN')} of ${connections.length.toLocaleString('en-IN')} private connections…`)
      }
      await finishImport({ importId })
      setMessage(`${connections.length.toLocaleString('en-IN')} connections saved privately. We will now show company matches in your job brief.`)
      setPreview(null)
      setFileName('')
    } catch {
      setMessage('We could not save your connections. Nothing from this import will be used in your job brief. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const currentImport = savedConnections?.import
  const currentConnections = savedConnections?.connections ?? []
  const previewRows = preview?.validConnections.slice(0, 3) ?? []
  const previewErrors = preview?.errors.slice(0, 5) ?? []
  const briefJobs = (latestBrief?.suggestions ?? []).flatMap((suggestion) => suggestion.job ? [{ suggestion, job: suggestion.job }] : [])
  const matchedJobSources = [...briefJobs.map((item) => ({ job: item.job, score: item.suggestion.matchScore as number | null })), ...(trackedJobs ?? []).map((item) => ({ job: item.job, score: null }))]
  const matchedCompanyGroups = Array.from(matchedJobSources.reduce((groups, item) => {
    const key = item.job.normalizedCompany
    if (groups.has(key)) return groups
    const people = currentConnections.filter((connection) => connection.normalizedCompany === key)
    if (people.length > 0) groups.set(key, { company: item.job.companyName, title: item.job.title, score: item.score, people })
    return groups
  }, new Map<string, { company: string; title: string; score: number | null; people: typeof currentConnections }>()).values())

  if (embedded) return <main className="connections-shell dashboard-connections-shell">
    <section aria-labelledby="connections-heading" className="cpd-connections-page">
      <div className="cpd-page-head"><div><span className="cpd-eyebrow">LINKEDIN CONNECTIONS</span><h1 id="connections-heading">Useful context at <span>matched companies.</span></h1><p>CareerPilot matches your uploaded Direct Connection contacts to companies in your Daily Brief. You decide whether and how to reach out.</p></div></div>
      <div className="cpd-connections-summary"><div><strong>{currentImport ? `${currentConnections.length.toLocaleString('en-IN')} connections imported` : 'No LinkedIn connections imported yet'}</strong><p>{currentImport ? `${currentImport.fileName} · Updated ${formatImportDate(currentImport.importedAt)} · CareerPilot does not sign in to LinkedIn or message anyone.` : 'Upload your LinkedIn Connections CSV to see useful company context here.'}</p></div><label className="cpd-secondary-button"><input accept=".csv,text/csv" disabled={isSaving} onChange={(event) => void chooseFile(event)} type="file" />{isSaving ? 'Saving…' : 'Replace CSV'}</label></div>
      <ConnectionsCsvHelp />
      {preview && <section className="cpd-connections-preview" aria-live="polite"><strong>{preview.validConnections.length.toLocaleString('en-IN')} connections ready to save</strong><span>{preview.errors.length} row{preview.errors.length === 1 ? '' : 's'} need attention</span><button className="cpd-primary-button" disabled={isSaving || preview.validConnections.length === 0} onClick={() => void saveConnections()} type="button">Save connections</button></section>}
      {message && <p className="cpd-resume-message" role="status">{message}</p>}
      <div className="cpd-section-title"><div><h2>Connections at matched companies</h2><p>Shown only where they can add useful company or team context.</p></div></div>
      {matchedCompanyGroups.length > 0 ? <div className="cpd-company-connections-list">{matchedCompanyGroups.map(({ company, title, score, people }) => <details className="cpd-company-connections" key={company}><summary className="cpd-company-toggle"><span className="cpd-company-mark">{companyMarkFromName(company)}</span><span><strong>{company}</strong><small>{title} · {score === null ? 'In tracker' : score >= 80 ? 'Strong fit' : score >= 65 ? 'Good fit' : 'Stretch'}</small></span><span>{people.length} connection{people.length === 1 ? '' : 's'}</span><svg aria-hidden="true" className="cpd-company-chevron" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18"><path d="m6 9 6 6 6-6" /></svg></summary><div className="cpd-people-list">{people.map((person) => <div className="cpd-person-row" key={`${person.profileUrl}-${person.firstName}`}><span className="cpd-connection-avatar">{`${person.firstName.slice(0, 1)}${person.lastName.slice(0, 1)}`}</span><span><strong><a href={person.profileUrl} rel="noreferrer" target="_blank">{[person.firstName, person.lastName].filter(Boolean).join(' ')}<span aria-hidden="true"> ↗</span></a></strong><small>{person.position || 'Position not listed'}</small></span></div>)}</div></details>)}</div> : <section className="cpd-empty"><h3>No matched company connections yet.</h3><p>Connections appear here when an imported person works at a company in your Daily Brief or Tracker.</p></section>}
    </section>
  </main>

  return (
    <main className={embedded ? 'connections-shell dashboard-connections-shell' : 'connections-shell'}>
      {!embedded && <header className="preference-topbar results-topbar">
        <button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Job brief</button>
        <a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a>
      </header>}

      <section aria-labelledby="connections-heading" className="connections-content">
        <div className="connections-heading"><div><p className="eyebrow">YOUR CONNECTIONS</p><h1 id="connections-heading">Your network,<br /><em>where it matters.</em></h1><p>Import your LinkedIn Connections file. CareerPilot only looks for people whose current company matches a role in your brief.</p></div>{currentImport && <p className="connections-saved-count"><b>{currentConnections.length.toLocaleString('en-IN')}</b> connections<br />saved {formatImportDate(currentImport.importedAt)}</p>}</div>

        <section className="connections-upload" aria-labelledby="connections-upload-heading">
          <div className="connections-upload-copy"><p className="eyebrow">LINKEDIN CSV</p><h2 id="connections-upload-heading">Bring in your current network.</h2><p>Download your LinkedIn <b>Connections</b> CSV, then choose it here. We do not send messages or post anything on your behalf.</p><p className="connections-format">Needs: name, profile URL, company, position, and connection date.</p><ConnectionsCsvHelp /></div>
          <label className="connections-drop">
            <input accept=".csv,text/csv" disabled={isSaving} onChange={(event) => void chooseFile(event)} type="file" />
            <span aria-hidden="true">↥</span><strong>{isSaving ? 'Saving connections…' : preview ? fileName : 'Choose LinkedIn CSV'}</strong><small>CSV only · Up to 5 MB · Preview before saving</small>
          </label>
        </section>

        {preview && <section className="connections-preview" aria-labelledby="connections-preview-heading">
          <div className="connections-preview-heading"><div><p className="eyebrow">READY TO SAVE</p><h2 id="connections-preview-heading">{preview.validConnections.length.toLocaleString('en-IN')} connections can be matched.</h2></div><p><b>{preview.errors.length}</b> row{preview.errors.length === 1 ? '' : 's'} need attention</p></div>
          <div className="connections-preview-grid">
            <div><p className="preview-label">A small preview</p>{previewRows.map((connection) => <div className="connection-preview-row" key={connection.rowNumber}><span>{`${connection.firstName.slice(0, 1)}${connection.lastName.slice(0, 1)}` || '•'}</span><p><b>{[connection.firstName, connection.lastName].filter(Boolean).join(' ')}</b><small>{connection.position || 'Position not listed'} · {connection.company}</small></p></div>)}</div>
            <div><p className="preview-label">Rows to fix</p>{previewErrors.length > 0 ? previewErrors.map((error) => <p className="connection-row-error" key={`${error.rowNumber}-${error.message}`}><b>Row {error.rowNumber}</b> {error.message}</p>) : <p className="connection-preview-clear">All rows are ready to save.</p>}</div>
          </div>
          {preview.errors.length > previewErrors.length && <p className="connection-more-errors">Plus {preview.errors.length - previewErrors.length} more row{preview.errors.length - previewErrors.length === 1 ? '' : 's'} to fix.</p>}
          <button className="connections-save" disabled={isSaving || preview.validConnections.length === 0} onClick={() => void saveConnections()} type="button">Save {preview.validConnections.length.toLocaleString('en-IN')} private connections <span aria-hidden="true">→</span></button>
        </section>}

        {message && <p className={message.includes('saved privately') ? 'form-success connections-message' : message.startsWith('Saving') ? 'connections-saving' : 'field-error connections-message'} role="status">{message}</p>}
        {currentImport && !preview && <section className="connections-current"><p className="eyebrow">CURRENT IMPORT</p><h2>{currentImport.fileName}</h2><p>{currentConnections.length.toLocaleString('en-IN')} saved connections from {currentImport.totalRows.toLocaleString('en-IN')} rows. Import another CSV anytime to use a newer list.</p></section>}
      </section>
    </main>
  )
}
