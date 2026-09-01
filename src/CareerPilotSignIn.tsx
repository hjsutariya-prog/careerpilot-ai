import { useEffect, useRef } from 'react'
import './CareerPilotSignIn.css'

export type CareerPilotAuthMode = 'signIn' | 'signUp'

type PasswordCredentials = {
  email: string
  password: string
}

type CareerPilotSignInProps = {
  mode: CareerPilotAuthMode
  onClose: () => void
  onGoogle: () => Promise<string | undefined>
  onPassword: (credentials: PasswordCredentials) => Promise<string | undefined>
  onToggleMode: () => void
}

type SignInAction =
  | { type: 'careerpilot:sign-in-action'; action: 'ready' | 'google' | 'toggle_mode' | 'close' }
  | { type: 'careerpilot:sign-in-action'; action: 'password'; email: string; password: string }

function isSignInAction(value: unknown): value is SignInAction {
  if (typeof value !== 'object' || value === null) return false
  const action = (value as { action?: unknown }).action
  if ((value as { type?: unknown }).type !== 'careerpilot:sign-in-action') return false
  if (action === 'password') return typeof (value as { email?: unknown }).email === 'string' && typeof (value as { password?: unknown }).password === 'string'
  return action === 'ready' || action === 'google' || action === 'toggle_mode' || action === 'close'
}

/** Displays the supplied reviewed sign-in design while keeping authentication in the React app. */
export function CareerPilotSignIn({ mode, onClose, onGoogle, onPassword, onToggleMode }: CareerPilotSignInProps) {
  const frame = useRef<HTMLIFrameElement>(null)

  const sendState = (busy = false, error = '') => {
    frame.current?.contentWindow?.postMessage({ type: 'careerpilot:sign-in-state', mode, busy, error }, window.location.origin)
  }

  useEffect(() => {
    const receiveAction = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || !isSignInAction(event.data)) return
      const action = event.data

      if (action.action === 'ready') {
        sendState()
        return
      }
      if (action.action === 'close') {
        onClose()
        return
      }
      if (action.action === 'toggle_mode') {
        onToggleMode()
        return
      }

      const complete = async () => {
        sendState(true)
        if (action.action === 'google') {
          const error = await onGoogle()
          sendState(false, error)
          return
        }
        if (action.action !== 'password') return
        const error = await onPassword({ email: action.email, password: action.password })
        sendState(false, error)
      }
      void complete()
    }

    window.addEventListener('message', receiveAction)
    return () => window.removeEventListener('message', receiveAction)
  }, [mode, onClose, onGoogle, onPassword, onToggleMode])

  return <iframe
    className="careerpilot-sign-in-frame"
    onLoad={() => sendState()}
    ref={frame}
    src="/careerpilot-sign-in.html"
    title="Sign in to CareerPilot"
  />
}
