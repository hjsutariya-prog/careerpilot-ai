import { useEffect, useRef } from 'react'
import './CareerPilotSignIn.css'

type PasswordCredentials = {
  email: string
  password: string
}

type CareerPilotSignUpProps = {
  onClose: () => void
  onGoogle: () => Promise<string | undefined>
  onPassword: (credentials: PasswordCredentials) => Promise<string | undefined>
  onSignIn: () => void
}

type SignUpAction =
  | { type: 'careerpilot:sign-up-action'; action: 'ready' | 'google' | 'sign_in' | 'close' }
  | { type: 'careerpilot:sign-up-action'; action: 'password'; email: string; password: string }

function isSignUpAction(value: unknown): value is SignUpAction {
  if (typeof value !== 'object' || value === null) return false
  const action = (value as { action?: unknown }).action
  if ((value as { type?: unknown }).type !== 'careerpilot:sign-up-action') return false
  if (action === 'password') return typeof (value as { email?: unknown }).email === 'string' && typeof (value as { password?: unknown }).password === 'string'
  return action === 'ready' || action === 'google' || action === 'sign_in' || action === 'close'
}

/** Displays the supplied reviewed sign-up design while keeping account creation in the React app. */
export function CareerPilotSignUp({ onClose, onGoogle, onPassword, onSignIn }: CareerPilotSignUpProps) {
  const frame = useRef<HTMLIFrameElement>(null)

  const sendState = (busy = false, error = '') => {
    frame.current?.contentWindow?.postMessage({ type: 'careerpilot:sign-up-state', busy, error }, window.location.origin)
  }

  useEffect(() => {
    const receiveAction = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || !isSignUpAction(event.data)) return
      const action = event.data

      if (action.action === 'ready') {
        sendState()
        return
      }
      if (action.action === 'close') {
        onClose()
        return
      }
      if (action.action === 'sign_in') {
        onSignIn()
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
  }, [onClose, onGoogle, onPassword, onSignIn])

  return <iframe
    className="careerpilot-sign-in-frame"
    onLoad={() => sendState()}
    ref={frame}
    src="/careerpilot-sign-up.html"
    title="Create a CareerPilot account"
  />
}
