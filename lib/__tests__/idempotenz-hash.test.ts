import { describe, it, expect } from 'vitest'
import { nutzdatenHash } from '@/lib/idempotenz-hash'

describe('nutzdatenHash', () => {
  it('ist unabhängig von der Reihenfolge der Felder (auch verschachtelt)', () => {
    expect(nutzdatenHash({ a: 1, b: { c: 2, d: [1, { x: 1, y: 2 }] } })).toBe(nutzdatenHash({ b: { d: [1, { y: 2, x: 1 }], c: 2 }, a: 1 }))
  })
  it('unterscheidet andere Nutzdaten', () => {
    expect(nutzdatenHash({ preis: 1000 })).not.toBe(nutzdatenHash({ preis: 2000 }))
    expect(nutzdatenHash({ a: [1, 2] })).not.toBe(nutzdatenHash({ a: [2, 1] }))
  })
  it('liefert einen 64-stelligen Hexwert', () => { expect(nutzdatenHash({})).toMatch(/^[0-9a-f]{64}$/) })
})
