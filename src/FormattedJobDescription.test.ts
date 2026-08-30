import { describe, expect, it } from 'vitest'
import { decodeEncodedMarkup } from './FormattedJobDescription'

describe('decodeEncodedMarkup', () => {
  it('turns encoded Greenhouse HTML back into markup before it is rendered', () => {
    expect(decodeEncodedMarkup('&lt;h3&gt;What you will do&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Build APIs&lt;/li&gt;&lt;/ul&gt;')).toBe('<h3>What you will do</h3><ul><li>Build APIs</li></ul>')
  })
})
