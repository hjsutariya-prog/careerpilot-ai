import { describe, expect, it } from 'vitest'
import { resumeParagraphs } from './tailoredResumeDownload'

describe('resumeParagraphs', () => {
  it('removes blank lines while preserving headings and bullets', () => {
    expect(resumeParagraphs('PRIYA SHAH\n\nEXPERIENCE\n- Built React dashboards\n')).toEqual(['PRIYA SHAH', 'EXPERIENCE', '- Built React dashboards'])
  })
})
