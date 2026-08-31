import { describe, expect, it } from 'vitest'
import { sha256Text } from './resumeFingerprint'

describe('sha256Text', () => {
  it('treats harmless spacing and casing changes as the same resume', async () => {
    await expect(sha256Text('Built APIs\nwith React')).resolves.toBe(await sha256Text(' built   apis with react '))
  })

  it('changes when the resume content changes', async () => {
    await expect(sha256Text('Built APIs')).resolves.not.toBe(await sha256Text('Built mobile apps'))
  })
})
