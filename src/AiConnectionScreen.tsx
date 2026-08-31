import { useState } from 'react'
import { readTailoredResumeConnection, saveTailoredResumeConnection, type TailoredResumeProvider } from './tailoredResumeConnection'

export function AiConnectionScreen() {
  const [connection, setConnection] = useState(readTailoredResumeConnection)
  const update = (next: Partial<typeof connection>) => {
    const value = { ...connection, ...next }
    setConnection(value)
    saveTailoredResumeConnection(value)
  }
  const needsKey = connection.provider !== 'careerpilot'
  return <main className="ai-connection-screen"><section className="ai-connection-panel" aria-labelledby="ai-connection-heading"><p className="eyebrow">AI CONNECTION</p><h1 id="ai-connection-heading">Choose how resumes are tailored.</h1><p>Use CareerPilot AI or bring your own provider. Your connection stays in this signed-in browser tab and is cleared when you sign out.</p><div className="ai-connection-fields"><label>Connection<select onChange={(event) => update({ provider: event.target.value as TailoredResumeProvider, apiKey: event.target.value === 'careerpilot' ? '' : connection.apiKey })} value={connection.provider}><option value="careerpilot">CareerPilot AI</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label>{needsKey && <label>API key<input autoComplete="off" onChange={(event) => update({ apiKey: event.target.value })} placeholder="Kept until you sign out" type="password" value={connection.apiKey} /></label>}<label>Model <small>(optional)</small><input autoComplete="off" onChange={(event) => update({ model: event.target.value })} placeholder="Use provider default" type="text" value={connection.model} /></label></div><p className="ai-connection-status" role="status">{connection.provider === 'careerpilot' ? 'CareerPilot AI is selected.' : connection.apiKey ? `${connection.provider === 'openai' ? 'OpenAI' : connection.provider === 'anthropic' ? 'Anthropic' : 'Gemini'} is ready for this session.` : 'Add your API key to use this provider.'}</p></section></main>
}
