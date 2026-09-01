import { describe, expect, it } from 'vitest'
import { getDashboardStartScreen } from './dashboardRouting'

describe('getDashboardStartScreen', () => {
  it('opens Apply only when both a resume and preferences exist', () => {
    expect(getDashboardStartScreen(true, true)).toBe('apply')
  })

  it('opens onboarding when setup is incomplete', () => {
    expect(getDashboardStartScreen(false, true)).toBe('onboarding')
    expect(getDashboardStartScreen(true, false)).toBe('onboarding')
    expect(getDashboardStartScreen(false, false)).toBe('onboarding')
  })
})
