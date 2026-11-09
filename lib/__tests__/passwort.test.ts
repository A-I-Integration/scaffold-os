import { describe, it, expect, vi } from 'vitest'
import { zufallsPasswort } from '@/lib/passwort'

describe('Startpasswort', () => {
  it('hat die gewünschte Länge und nur erlaubte Zeichen (keine verwechselbaren)', () => {
    for (let i = 0; i < 200; i++) {
      const pw = zufallsPasswort(12)
      expect(pw).toHaveLength(12)
      expect(pw).toMatch(/^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
    }
  })
  it('ist nicht gleich bei jedem Aufruf', () => {
    expect(new Set(Array.from({ length: 50 }, () => zufallsPasswort())).size).toBe(50)
  })
  it('nutzt den System-Zufallsgenerator, nicht Math.random', () => {
    const m = vi.spyOn(Math, 'random')
    zufallsPasswort()
    expect(m).not.toHaveBeenCalled()
    m.mockRestore()
  })
  it('alle Zeichen kommen vor (gleichmäßige Verteilung, Stichprobe)', () => {
    const gesehen = new Set<string>()
    for (let i = 0; i < 2000; i++) for (const c of zufallsPasswort(12)) gesehen.add(c)
    expect(gesehen.size).toBe(54)
  })
})
