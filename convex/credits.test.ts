import { describe, expect, it } from 'vitest'
import { availableCredits, canStartTailoring, TAILORED_RESUME_CREDIT_COST, WELCOME_CREDIT_AMOUNT, withWelcomeCredits } from './credits'

describe('CareerPilot credits', () => {
  it('counts active reservations but not released entries', () => {
    expect(availableCredits([{ amount: 40, status: 'completed' }, { amount: -20, status: 'reserved' }])).toBe(20)
    expect(availableCredits([{ amount: 40, status: 'completed' }, { amount: -20, status: 'released' }])).toBe(40)
  })

  it('requires twenty available credits', () => {
    expect(TAILORED_RESUME_CREDIT_COST).toBe(20)
    expect(canStartTailoring([{ amount: 20, status: 'completed' }])).toBe(true)
    expect(canStartTailoring([{ amount: 19, status: 'completed' }])).toBe(false)
  })

  it('shows one welcome grant before the first tailoring request', () => {
    expect(WELCOME_CREDIT_AMOUNT).toBe(40)
    expect(availableCredits(withWelcomeCredits([]))).toBe(40)
    expect(availableCredits(withWelcomeCredits([{ amount: 40, status: 'completed', referenceId: 'welcome-credits-v1' }]))).toBe(40)
  })
})
