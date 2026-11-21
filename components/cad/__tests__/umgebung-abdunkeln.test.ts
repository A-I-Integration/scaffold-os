import { describe, it, expect } from 'vitest'
import { abdunkeln } from '../Umgebung3D'
describe('abdunkeln', () => {
  it('halbiert die Farbkanäle', () => { expect(abdunkeln('#9aa88f', 0.5)).toBe('#4d5448') })
  it('bleibt im gültigen Bereich', () => { expect(abdunkeln('#ffffff', 2)).toBe('#ffffff'); expect(abdunkeln('#000000', 0.5)).toBe('#000000') })
})
