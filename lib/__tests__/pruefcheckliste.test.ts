import { describe, it, expect } from 'vitest'
import { PRUEFPUNKTE, auswertung, fehlendeAngaben, klasseText, type Checkliste } from '../pruefcheckliste'

const alleOk = (): Checkliste => Object.fromEntries(PRUEFPUNKTE.map((p) => [p.key, 'ok'])) as Checkliste

describe('Prüf-Checkliste', () => {
  it('erkennt offene und mangelhafte Punkte', () => {
    const c: Checkliste = { untergrund: 'ok', belaege: 'mangel' }
    const a = auswertung(c)
    expect(a.maengel).toEqual(['Beläge vollständig'])
    expect(a.offen.length).toBe(PRUEFPUNKTE.length - 2)
  })
  it('vollständig ausgefüllt: keine fehlenden Angaben', () => {
    expect(fehlendeAngaben({ checkliste: alleOk(), freigegeben: true, freigegeben_durch: 'Max', unterschrift: 'data:image/png;base64,x' })).toEqual([])
  })
  it('meldet fehlende Punkte, Name und Unterschrift', () => {
    const f = fehlendeAngaben({ checkliste: {}, freigegeben_durch: ' ' })
    expect(f.length).toBe(3)
  })
  it('Freigabe mit offenem Mangel ist nicht möglich, mit behobenem schon', () => {
    const c = { ...alleOk(), belaege: 'mangel' as const }
    const basis = { checkliste: c, freigegeben: true, freigegeben_durch: 'M', unterschrift: 'x' }
    expect(fehlendeAngaben(basis).join()).toContain('Mängel sind nicht als behoben')
    expect(fehlendeAngaben({ ...basis, maengel_behoben: true })).toEqual([])
    expect(fehlendeAngaben({ ...basis, freigegeben: false })).toEqual([])
  })
  it('Klassentext', () => {
    expect(klasseText('3', 'W06')).toBe('Lastklasse 3, Breitenklasse W06')
    expect(klasseText('', '')).toBe('')
  })
})
