import { describe, it, expect } from 'vitest'
import { merkeEntwurf, entwurfErledigt, merkeSchritt, schrittErledigt, leseAusstehend, anzahlAusstehend, sendeAusstehend, istNetzFehler, NACHSENDEN_KEY } from '../nachsenden'

const speicher = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }

describe('Nachsenden (Stufe 3)', () => {
  it('merkt Entwurf und Schritte, räumt nach Erfolg auf, löscht den Schlüssel wenn leer', () => {
    const s = speicher()
    merkeEntwurf(s); merkeSchritt('p1', 'step2', { a: 1 }, s)
    expect(anzahlAusstehend(leseAusstehend(s))).toBe(2)
    entwurfErledigt(s); expect(anzahlAusstehend(leseAusstehend(s))).toBe(1)
    schrittErledigt('p1', 'step2', s)
    expect(s.m.has(NACHSENDEN_KEY)).toBe(false)
  })
  it('nur der letzte Stand je Projekt+Schritt wird gemerkt (letzter gewinnt)', () => {
    const s = speicher()
    merkeSchritt('p1', 'step2', { v: 1 }, s); merkeSchritt('p1', 'step2', { v: 2 }, s)
    const a = leseAusstehend(s)
    expect(Object.keys(a.schritte)).toHaveLength(1)
    expect(a.schritte['p1:step2'].form).toEqual({ v: 2 })
  })
  it('sendeAusstehend ruft Entwurf und jeden Schritt genau einmal auf', async () => {
    const s = speicher(); const log: string[] = []
    merkeEntwurf(s); merkeSchritt('p1', 'step2', { v: 2 }, s); merkeSchritt('p2', 'step4', { w: 1 }, s)
    await sendeAusstehend({ entwurf: async () => void log.push('entwurf'), schritt: async (id, st) => void log.push(`${id}:${st}`) }, s)
    expect(log).toEqual(['entwurf', 'p1:step2', 'p2:step4'])
  })
  it('nichts Offenes → nichts wird gesendet; kaputter Speicherinhalt wird wie leer behandelt', async () => {
    const s = speicher(); let n = 0
    await sendeAusstehend({ entwurf: async () => void n++, schritt: async () => void n++ }, s)
    s.setItem(NACHSENDEN_KEY, '{kaputt')
    expect(anzahlAusstehend(leseAusstehend(s))).toBe(0)
    expect(n).toBe(0)
  })
  it('nur TypeError (fetch ohne Netz) gilt als Netzfehler', () => {
    expect(istNetzFehler(new TypeError('Failed to fetch'))).toBe(true)
    expect(istNetzFehler(new Error('HTTP 500'))).toBe(false)
  })
})
