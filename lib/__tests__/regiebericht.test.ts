import { describe, it, expect } from 'vitest'
import { normStunden, normMaterial, normFotos, betragGesamt, summeStunden, regieHinweise, regieAlsPositionen, naechsteNummer, aenderbar, ohnePreise, preiseUebernehmen, MAX_FOTOS } from '@/lib/regiebericht'

describe('Regiebericht Logik', () => {
  it('Stunden und Material werden bereinigt, Komma-Zahlen verstanden', () => {
    expect(normStunden([{ name: ' Max ', stunden: '7,5', satz: '45' }, { name: '', stunden: 0 }, null])).toEqual([{ name: 'Max', stunden: 7.5, satz: 45 }])
    expect(normMaterial([{ bezeichnung: 'Rahmen', menge: '10', einheit: '', einzelpreis: '2,5' }, { bezeichnung: '', menge: 0 }])).toEqual([{ bezeichnung: 'Rahmen', menge: 10, einheit: 'Stk.', einzelpreis: 2.5 }])
    expect(normStunden([{ name: 'A', stunden: -3, satz: -1 }])).toEqual([{ name: 'A', stunden: 0, satz: 0 }])
  })
  it('Summen: Stunden × Satz plus Material', () => {
    const r = { stunden: normStunden([{ name: 'A', stunden: 8, satz: 50 }, { name: 'B', stunden: 4, satz: 45.5 }]), material: normMaterial([{ bezeichnung: 'Rahmen', menge: 3, einheit: 'Stk.', einzelpreis: 12.34 }]) }
    expect(summeStunden(r.stunden)).toBe(12)
    expect(betragGesamt(r)).toBe(8 * 50 + 4 * 45.5 + 37.02)
  })
  it('Fotos: nur Bilder als data-URL, höchstens 6, zu große raus', () => {
    const f = 'data:image/jpeg;base64,AAAA'
    expect(normFotos(Array(10).fill(f))).toHaveLength(MAX_FOTOS)
    expect(normFotos(['http://x/y.jpg', 'data:text/html;base64,AA', f])).toEqual([f])
    expect(normFotos(['data:image/png;base64,' + 'A'.repeat(500_000)])).toEqual([])
  })
  it('Positionen für die Rechnung: je Mitarbeiter und Material eine Zeile, Zeilen ohne Preis werden gemeldet', () => {
    const { positionen, ohnePreis } = regieAlsPositionen({
      nummer: 'RB-2026-0003', datum: '2026-11-20', anlass: 'Zusatzanker',
      stunden: [{ name: 'Max', stunden: 6, satz: 52 }, { name: 'Tom', stunden: 4, satz: 0 }],
      material: [{ bezeichnung: 'Anker', menge: 12, einheit: 'Stk.', einzelpreis: 3.5 }, { bezeichnung: 'Netz', menge: 1, einheit: 'Stk.', einzelpreis: 0 }],
    })
    expect(positionen).toHaveLength(2)
    expect(positionen[0]).toMatchObject({ menge: 6, einheit: 'Std.', einzelpreis: 52 })
    expect(positionen[0].bezeichnung).toContain('RB-2026-0003')
    expect(positionen[0].bezeichnung).toContain('20.11.2026')
    expect(positionen[1]).toMatchObject({ menge: 12, einzelpreis: 3.5 })
    expect(ohnePreis).toHaveLength(2)
  })
  it('Hinweise bei fehlendem Satz, Preis oder Beschreibung', () => {
    const h = regieHinweise({ stunden: [{ name: 'A', stunden: 3, satz: 0 }], material: [{ bezeichnung: 'X', menge: 1, einheit: 'Stk.', einzelpreis: 0 }], beschreibung: '', anlass: '' })
    expect(h.length).toBe(3)
    expect(regieHinweise({ stunden: [], material: [] , beschreibung: 'x' })[0]).toContain('Weder Stunden')
  })
  it('Nummernkreis zählt je Jahr weiter', () => {
    expect(naechsteNummer([], 2026)).toBe('RB-2026-0001')
    expect(naechsteNummer(['RB-2026-0001', 'RB-2026-0009', 'RB-2025-0500'], 2026)).toBe('RB-2026-0010')
  })
  it('Änderbar nur als Entwurf und solange nicht abgerechnet', () => {
    expect(aenderbar({ status: 'entwurf' }).ok).toBe(true)
    expect(aenderbar({ status: 'unterschrieben' }).ok).toBe(false)
    expect(aenderbar({ status: 'entwurf', rechnung_id: 'r1' }).ok).toBe(false)
  })
  it('Mitarbeiter: Preise ausblenden, beim Speichern die alten Preise behalten', () => {
    const alt = { stunden: [{ name: 'A', stunden: 8, satz: 50 }], material: [{ bezeichnung: 'X', menge: 2, einheit: 'Stk.', einzelpreis: 9 }] }
    expect(ohnePreise(alt).stunden[0].satz).toBe(0)
    const neu = { stunden: [{ name: 'A', stunden: 9, satz: 0 }, { name: 'Neu', stunden: 1, satz: 0 }], material: [{ bezeichnung: 'Y', menge: 1, einheit: 'Stk.', einzelpreis: 0 }] }
    const m = preiseUebernehmen(neu, alt)
    expect(m.stunden.map((z) => z.satz)).toEqual([50, 0])
    expect(m.material[0].einzelpreis).toBe(0)
  })
})
