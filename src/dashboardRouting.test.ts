import { describe, expect, it } from 'vitest'
import { getDashboardStartScreen } from './dashboardRouting'

describe('getDashboardStartScreen', () => {
  it('opens Apply only when both a resume and preferences exist', () => {
    expect(getDashboardStartScreen(true, true)).toBe('apply')
  })

  it('opens Resume when setup is incomplete', () => {
    expect(getDashboardStartScreen(false, true)).toBe('resume')
    expect(getDashboardStartScreen(true, false)).toBe('resume')
    expect(getDashboardStartScreen(false, false)).toBe('resume')
  })
})
