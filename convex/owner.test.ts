import { describe, expect, it } from 'vitest'
import { ownerIdFromSubject } from './owner'

describe('ownerIdFromSubject', () => {
  it('removes the changing Convex Auth session suffix', () => {
    expect(ownerIdFromSubject('user_123|session_456')).toBe('user_123')
  })

  it('keeps an already stable owner ID unchanged', () => {
    expect(ownerIdFromSubject('user_123')).toBe('user_123')
  })
})
