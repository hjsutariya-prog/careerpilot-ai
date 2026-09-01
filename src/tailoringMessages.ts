import type { GeminiFailureCode } from '../convex/gemini'
import type { TailoringResultMode } from '../convex/tailoredResumes'

export function tailoringOutcomeMessage(mode: TailoringResultMode, failureCode?: GeminiFailureCode) {
  if (mode === 'provider_unavailable' || mode === 'ai_response_invalid') {
    if (failureCode === 'GEMINI_RATE_LIMIT' || failureCode === 'GEMINI_QUOTA_EXHAUSTED') {
      return { tone: 'error' as const, text: 'Resume tailoring is temporarily unavailable because the AI service limit was reached. No credits were used. Please try again later.' }
    }
    return { tone: 'error' as const, text: 'Resume tailoring is temporarily unavailable. No credits were used. Please try again.' }
  }
  if (mode === 'no_meaningful_changes') return { tone: 'status' as const, text: 'No meaningful safe changes were needed for this job.' }
  return { tone: 'error' as const, text: "We couldn't make safe changes to this resume. No credits were used." }
}
