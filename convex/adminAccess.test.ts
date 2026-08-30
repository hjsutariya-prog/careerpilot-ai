import { describe, expect, it } from 'vitest'
import { isAllowedAdminEmail } from './adminAccess'

describe('isAllowedAdminEmail', () => {
  it('only allows the configured email address', () => {
    expect(isAllowedAdminEmail('admin@example.com', 'admin@example.com')).toBe(true)
    expect(isAllowedAdminEmail('member@example.com', 'admin@example.com')).toBe(false)
    expect(isAllowedAdminEmail(undefined, 'admin@example.com')).toBe(false)
  })
})
