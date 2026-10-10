import { describe, it, expect } from 'vitest'
import { gehoertZu } from '../aufmass-eigentuemer'

describe('gehoertZu', () => {
  it('bestehendes Projekt: nur passender Vermerk', () => {
    expect(gehoertZu('abc', 'abc')).toBe(true)
    expect(gehoertZu('xyz', 'abc')).toBe(false)
    expect(gehoertZu('neu', 'abc')).toBe(false)
    expect(gehoertZu(null, 'abc')).toBe(false)
  })
  it('neues Aufmaß: kein Vermerk oder "neu", aber nie fremdes Projekt', () => {
    expect(gehoertZu(null, null)).toBe(true)
    expect(gehoertZu('neu', null)).toBe(true)
    expect(gehoertZu('abc', null)).toBe(false)
    expect(gehoertZu('neu', undefined)).toBe(true)
  })
})
