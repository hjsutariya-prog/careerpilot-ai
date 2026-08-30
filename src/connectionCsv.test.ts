import { describe, expect, it } from 'vitest'
import { previewLinkedInConnectionsCsv } from './connectionCsv'

const header = 'First Name,Last Name,URL,Email Address,Company,Position,Connected On'

describe('previewLinkedInConnectionsCsv', () => {
  it('skips LinkedIn Notes lines and parses quoted cells', () => {
    const preview = previewLinkedInConnectionsCsv(`Notes:\n"Export note, with a comma"\n\n${header}\nRiya,Shah,https://linkedin.com/in/riya,riya@example.com,"North, Star",Engineer,30 Aug 2026`)

    expect(preview.totalRows).toBe(1)
    expect(preview.errors).toEqual([])
    expect(preview.validConnections[0]).toMatchObject({ firstName: 'Riya', company: 'North, Star', normalizedCompany: 'north star' })
  })

  it('reports a row that cannot match because company is missing', () => {
    const preview = previewLinkedInConnectionsCsv(`${header}\nRiya,Shah,https://linkedin.com/in/riya,,,Engineer,30 Aug 2026`)

    expect(preview.validConnections).toHaveLength(0)
    expect(preview.errors[0]).toMatchObject({ rowNumber: 2, message: 'Add this connection’s current company to match it with jobs.' })
  })

  it('rejects a file without the LinkedIn connection headers', () => {
    expect(() => previewLinkedInConnectionsCsv('Name,Company\nRiya,North Star')).toThrow('This CSV is missing LinkedIn connection columns')
  })
})
