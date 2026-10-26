import { describe, it, expect } from 'vitest'
import { notizMitUstHinweis, HINWEIS_13B } from '../ust-hinweis'
describe('notizMitUstHinweis', () => {
  it('ergänzt den Hinweis nur bei 0 % und gesetzter Option', () => {
    expect(notizMitUstHinweis(null, 0, true)).toBe(HINWEIS_13B)
    expect(notizMitUstHinweis('Danke', 0, true)).toBe(HINWEIS_13B + '\nDanke')
    expect(notizMitUstHinweis('Danke', 19, true)).toBe('Danke')
    expect(notizMitUstHinweis('', 0, false)).toBeNull()
  })
  it('doppelt nicht', () => {
    expect(notizMitUstHinweis(HINWEIS_13B, 0, true)).toBe(HINWEIS_13B)
  })
})
