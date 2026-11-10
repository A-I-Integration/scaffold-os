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

import { merkeBefehl, befehlErledigt, befehleFuer } from '../nachsenden'
describe('Befehle (Stufe 4)', () => {
  const sender = (f: (b: { art: string; projectId: string }) => { ergebnis: 'erledigt' | 'verworfen' | 'netz'; grund?: string }) =>
    ({ entwurf: async () => {}, schritt: async () => {}, befehl: async (b: { art: string; projectId: string }) => f(b) })

  it('Nachträge bleiben einzeln und in Reihenfolge, Materialstand und Schritt 6 ersetzen sich', () => {
    const s = speicher()
    merkeBefehl('nachtrag', 'p1', { op: 'anlegen', id: 'a' }, 'Nachtrag A', s)
    merkeBefehl('nachtrag', 'p1', { op: 'status', id: 'a' }, 'Status A', s)
    merkeBefehl('material', 'p1', [1], 'Material', s); merkeBefehl('material', 'p1', [1, 2], 'Material', s)
    merkeBefehl('schritt6', 'p1', { v: 1 }, 'Aufmaß', s); merkeBefehl('schritt6', 'p1', { v: 2 }, 'Aufmaß', s)
    const a = leseAusstehend(s)
    expect(a.befehle.map((b) => b.art)).toEqual(['nachtrag', 'nachtrag', 'material', 'schritt6'])
    expect(a.befehle[2].daten).toEqual([1, 2])
    expect(a.befehle[3].daten).toEqual({ v: 2 })
    expect(anzahlAusstehend(a)).toBe(4)
    expect(befehleFuer('nachtrag', 'p1', a)).toHaveLength(2)
  })
  it('sendet in Reihenfolge und räumt erledigte und verworfene auf', async () => {
    const s = speicher(); const log: string[] = []
    merkeBefehl('nachtrag', 'p1', 1, 'N1', s); merkeBefehl('nachtrag', 'p1', 2, 'N2', s); merkeBefehl('material', 'p2', 3, 'M', s)
    const r = await sendeAusstehend(sender((b) => { log.push(b.art + ':' + b.projectId); return log.length === 2 ? { ergebnis: 'verworfen', grund: 'nicht mehr vorhanden' } : { ergebnis: 'erledigt' } }), s)
    expect(log).toEqual(['nachtrag:p1', 'nachtrag:p1', 'material:p2'])
    expect(r.verworfen).toEqual([{ titel: 'N2', grund: 'nicht mehr vorhanden' }])
    expect(s.m.has(NACHSENDEN_KEY)).toBe(false)
  })
  it('bei Netzfehler stoppt der Durchlauf und alles Übrige bleibt gemerkt', async () => {
    const s = speicher(); let n = 0
    merkeBefehl('nachtrag', 'p1', 1, 'N1', s); merkeBefehl('nachtrag', 'p1', 2, 'N2', s); merkeBefehl('nachtrag', 'p1', 3, 'N3', s)
    await sendeAusstehend(sender(() => (++n === 2 ? { ergebnis: 'netz' } : { ergebnis: 'erledigt' })), s)
    expect(n).toBe(2)
    expect(leseAusstehend(s).befehle.map((b) => b.titel)).toEqual(['N2', 'N3'])
  })
  it('befehlErledigt entfernt gezielt; alte Speicherstände ohne befehle bleiben lesbar', () => {
    const s = speicher()
    s.setItem(NACHSENDEN_KEY, JSON.stringify({ entwurf: true, schritte: {} }))
    expect(leseAusstehend(s).befehle).toEqual([])
    const id = merkeBefehl('material', 'p1', [], 'M', s)
    befehlErledigt(id as string, s)
    expect(leseAusstehend(s).befehle).toEqual([])
  })
})

describe('Speicher voll', () => {
  it('merkeBefehl gibt null zurück, wenn der Speicher das Schreiben verweigert', () => {
    const voll = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => {} }
    expect(merkeBefehl('schritt6', 'p1', { x: 1 }, 'Aufmaß', voll)).toBeNull()
  })
})
