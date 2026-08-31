export type TailoredResumeProvider = 'careerpilot' | 'gemini' | 'openai' | 'anthropic'

const providerKey = 'careerpilot:tailored-resume-provider'
const modelKey = 'careerpilot:tailored-resume-model'
const apiKeyKey = 'careerpilot:tailored-resume-api-key'

export function readTailoredResumeConnection() {
  const provider = window.sessionStorage.getItem(providerKey)
  return {
    provider: provider === 'gemini' || provider === 'openai' || provider === 'anthropic' ? provider : 'careerpilot' as TailoredResumeProvider,
    model: window.sessionStorage.getItem(modelKey) ?? '',
    apiKey: window.sessionStorage.getItem(apiKeyKey) ?? '',
  }
}

export function saveTailoredResumeConnection(connection: { provider: TailoredResumeProvider; model: string; apiKey: string }) {
  window.sessionStorage.setItem(providerKey, connection.provider)
  if (connection.model) window.sessionStorage.setItem(modelKey, connection.model)
  else window.sessionStorage.removeItem(modelKey)
  if (connection.apiKey) window.sessionStorage.setItem(apiKeyKey, connection.apiKey)
  else window.sessionStorage.removeItem(apiKeyKey)
}

export function clearTailoredResumeConnection() {
  window.sessionStorage.removeItem(providerKey)
  window.sessionStorage.removeItem(modelKey)
  window.sessionStorage.removeItem(apiKeyKey)
}
