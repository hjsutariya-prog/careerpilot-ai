import { useEffect, useRef, useState } from 'react'
import './CareerPilotLanding.css'

type CareerPilotLandingProps = {
  onGetStarted: () => void
  onSignIn: () => void
}

type LandingActionMessage = {
  type: 'careerpilot:landing-action'
  action: 'get_started' | 'sign_in'
}

function isLandingActionMessage(value: unknown): value is LandingActionMessage {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === 'careerpilot:landing-action'
    && ((value as { action?: unknown }).action === 'get_started' || (value as { action?: unknown }).action === 'sign_in')
}

/** Renders the reviewed landing-page artifact unchanged and bridges its two real calls to action into CareerPilot. */
export function CareerPilotLanding({ onGetStarted, onSignIn }: CareerPilotLandingProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState('100vh')

  useEffect(() => {
    const receiveAction = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || !isLandingActionMessage(event.data)) return
      if (event.data.action === 'sign_in') onSignIn()
      else onGetStarted()
    }
    window.addEventListener('message', receiveAction)
    return () => window.removeEventListener('message', receiveAction)
  }, [onGetStarted, onSignIn])

  const updateHeight = () => {
    const document = frame.current?.contentDocument
    if (!document) return
    setHeight(`${Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)}px`)
  }

  return <iframe
    className="careerpilot-landing-frame"
    onLoad={() => {
      updateHeight()
      window.setTimeout(updateHeight, 300)
    }}
    ref={frame}
    src="/careerpilot-landing.html"
    style={{ height }}
    title="CareerPilot — A Focused Daily Brief for Your Tech Job Search"
  />
}
