import { useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { previewLinkedInConnectionsCsv, type ConnectionImportPreview } from './connectionCsv'

const MAX_CSV_BYTES = 5 * 1024 * 1024
const IMPORT_BATCH_SIZE = 200

function formatImportDate(value: number) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

export function ConnectionsScreen({ onBack }: { onBack: () => void }) {
  const savedConnections = useQuery(api.connections.mine)
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

  return (
    <main className="connections-shell">
      <header className="preference-topbar results-topbar">
        <button className="back-home" onClick={onBack} type="button"><span aria-hidden="true">←</span> Job brief</button>
        <a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onBack() }}>CareerPilot<span>.AI</span></a>
      </header>

      <section aria-labelledby="connections-heading" className="connections-content">
        <div className="connections-heading"><div><p className="eyebrow">YOUR CONNECTIONS</p><h1 id="connections-heading">Your network,<br /><em>where it matters.</em></h1><p>Import your LinkedIn Connections file. CareerPilot only looks for people whose current company matches a role in your brief.</p></div>{currentImport && <p className="connections-saved-count"><b>{currentConnections.length.toLocaleString('en-IN')}</b> connections<br />saved {formatImportDate(currentImport.importedAt)}</p>}</div>

        <section className="connections-upload" aria-labelledby="connections-upload-heading">
          <div className="connections-upload-copy"><p className="eyebrow">LINKEDIN CSV</p><h2 id="connections-upload-heading">Bring in your current network.</h2><p>Download your LinkedIn <b>Connections</b> CSV, then choose it here. We do not send messages or post anything on your behalf.</p><p className="connections-format">Needs: name, profile URL, company, position, and connection date.</p></div>
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
