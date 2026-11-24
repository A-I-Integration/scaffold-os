import { describe, it, expect } from 'vitest'
import {
  normalisiereVereinbarung, faelligeVorhaltung, vorhaltungStatus, pruefeVorhaltungBezug, vorhaltungStand, pruefeVorhaltungVereinbarungAenderung, restM2Zum,
  type Vorhaltevereinbarung, type VorhaltePeriode,
} from '../vorhaltung'

// Schritt 5: Teilabbau in Mengen (m²) statt Prozent. Beispiel der Vorgabe: 1.000 m² aufgebaut, 300 m² Teilabbau, 700 m² Restvorhaltung.
const V = (o: Partial<Vorhaltevereinbarung> = {}): Vorhaltevereinbarung => ({ aktiv: true, beginn: '2026-03-02', freiTage: 0, intervall: 'woche', preis: 250, abrechnung: 'im_voraus', teilabbauten: [], bezugM2: 1000, ...o })
const roh = (o: Record<string, unknown> = {}) => ({ aktiv: true, beginn: '2026-03-02', freiTage: 0, intervall: 'woche', preis: 250, abrechnung: 'im_voraus', bezugM2: 1000, teilabbauten: [], ...o })
const P = (von: string, bis: string, o: Partial<VorhaltePeriode> = {}): VorhaltePeriode => ({ id: von, von, bis, intervalle: 1, netto: 250, rechnungId: 'r', ...o })

describe('Teilabbau in Mengen', () => {
  it('Restmenge ist führend, der Prozentsatz wird daraus abgeleitet: 700 m² von 1.000 m² = 70 %', () => {
    const v = normalisiereVereinbarung(roh({ teilabbauten: [{ datum: '2026-03-16', verbleibendM2: 700, preisModus: 'anteilig' }] }))!
    expect(v.teilabbauten[0]).toMatchObject({ verbleibendM2: 700, verbleibendProzent: 70 })
    expect(v.bezugM2).toBe(1000)
  })
  it('die Menge gewinnt gegen einen widersprüchlichen gespeicherten Prozentwert', () => {
    const v = normalisiereVereinbarung(roh({ teilabbauten: [{ datum: '2026-03-16', verbleibendM2: 700, verbleibendProzent: 10, preisModus: 'anteilig' }] }))!
    expect(v.teilabbauten[0].verbleibendProzent).toBe(70)
  })
  it('ungültige Menge (über Bezugsmenge, negativ) oder Menge ohne Bezugsmenge: Eintrag wird verworfen, nie still als 0 % gewertet', () => {
    for (const m of [1200, -5]) expect(normalisiereVereinbarung(roh({ teilabbauten: [{ datum: '2026-03-16', verbleibendM2: m, preisModus: 'voll' }] }))!.teilabbauten).toEqual([])
    expect(normalisiereVereinbarung(roh({ bezugM2: undefined, teilabbauten: [{ datum: '2026-03-16', verbleibendM2: 700, preisModus: 'voll' }] }))!.teilabbauten).toEqual([])
  })
  it('Altdaten nur mit Prozent bleiben gültig (ohne Bezugsmenge unverändert)', () => {
    const v = normalisiereVereinbarung(roh({ bezugM2: undefined, teilabbauten: [{ datum: '2026-03-16', verbleibendProzent: 60, preisModus: 'anteilig' }] }))!
    expect(v.teilabbauten[0]).toMatchObject({ verbleibendProzent: 60 }); expect(v.teilabbauten[0].verbleibendM2).toBeUndefined(); expect(v.bezugM2).toBeUndefined()
  })
  it('Restmenge zum Stichtag: vor dem Teilabbau die volle Menge, danach die Restmenge; ohne Bezugsmenge unbekannt', () => {
    const v = V({ teilabbauten: [{ datum: '2026-03-16', verbleibendProzent: 70, verbleibendM2: 700, preisModus: 'anteilig' }] })
    expect(restM2Zum(v, '2026-03-15')).toBe(1000); expect(restM2Zum(v, '2026-03-16')).toBe(700)
    expect(restM2Zum(V({ bezugM2: undefined }), '2026-03-16')).toBeUndefined()
    // Altdaten mit Prozent und Bezugsmenge: Menge aus dem Prozentsatz
    expect(restM2Zum(V({ teilabbauten: [{ datum: '2026-03-16', verbleibendProzent: 60, preisModus: 'anteilig' }] }), '2026-03-20')).toBe(600)
  })
})

describe('Vorhaltung mit Menge: Abrechnung und Rechnungstext', () => {
  const v = () => V({ teilabbauten: [{ datum: '2026-03-16', verbleibendProzent: 70, verbleibendM2: 700, preisModus: 'anteilig' }] })
  it('Restvorhaltung 700 m² von 1.000 m²: Preis anteilig (175 €/Wo.), Menge steht im Text', () => {
    const f = faelligeVorhaltung(v(), [], '2026-03-29')!
    expect(f.positionen.map((p) => [p.menge, p.einzelpreis])).toEqual([[2, 250], [2, 175]])
    expect(f.positionen[1].bezeichnung).toContain('700 m² von 1.000 m² (70 %) Restbestand')
    expect(f.positionen[0].bezeichnung).not.toContain('Restbestand')
    expect(f.netto).toBe(850)
    expect(f.intervalle.map((i) => i.restM2)).toEqual([1000, 1000, 700, 700])
  })
  it('voller Preis bleibt: gleiche Zeile, Mengenangabe und „Preis unverändert"', () => {
    const f = faelligeVorhaltung(V({ teilabbauten: [{ datum: '2026-03-16', verbleibendProzent: 70, verbleibendM2: 700, preisModus: 'voll' }] }), [], '2026-03-29')!
    expect(f.netto).toBe(1000)
    expect(f.positionen.at(-1)!.bezeichnung).toContain('700 m² von 1.000 m² (70 %) Restbestand (Preis unverändert)')
  })
  it('ohne Bezugsmenge bleibt der Text wie bisher (nur Prozent)', () => {
    const f = faelligeVorhaltung(V({ bezugM2: undefined, teilabbauten: [{ datum: '2026-03-16', verbleibendProzent: 60, preisModus: 'anteilig' }] }), [], '2026-03-29')!
    expect(f.positionen[1].bezeichnung).toContain('60 % Restbestand'); expect(f.positionen[1].bezeichnung).not.toContain('m²')
  })
  it('Mehrere Teilabbauten: 1.000 → 700 → 400 m², jede Menge in ihrem Zeitraum; bereits berechnete Zeiträume werden nicht erneut berechnet', () => {
    const vv = V({ teilabbauten: [
      { datum: '2026-03-16', verbleibendProzent: 70, verbleibendM2: 700, preisModus: 'anteilig' },
      { datum: '2026-03-30', verbleibendProzent: 40, verbleibendM2: 400, preisModus: 'anteilig' },
    ] })
    const f = faelligeVorhaltung(vv, [P('2026-03-02', '2026-03-16', { intervalle: 2, netto: 500 })], '2026-04-05')!
    // Intervalle ab 16.03.: 16.03. und 23.03. bei 700 m², 30.03. bei 400 m² (06.04. liegt nach dem Stichtag)
    expect(f.positionen.map((p) => [p.menge, p.einzelpreis])).toEqual([[2, 175], [1, 100]])
    expect(f.positionen[0].bezeichnung).toContain('700 m²'); expect(f.positionen[1].bezeichnung).toContain('400 m²')
    expect(f.von).toBe('2026-03-16')
  })
  it('Server: Rechnungspositionen müssen zum Preis nach Restmenge passen', () => {
    const vv = v(); const stand = vorhaltungStand(normalisiereVereinbarung(vv), [])
    const fa = faelligeVorhaltung(vv, [], '2026-03-29')!
    const bezug = (positionen: any[]) => pruefeVorhaltungBezug({ vereinbarungRoh: vv, periodenRoh: [], von: fa.von, bis: fa.bis, stand, positionen, heute: '2026-03-29' })
    expect(bezug(fa.positionen).ok).toBe(true)
    expect(bezug(fa.positionen.map((p, i) => (i ? { ...p, einzelpreis: 250 } : p)))).toMatchObject({ ok: false, code: 'VORHALTUNG_ABWEICHUNG' })
  })
  it('Status zeigt die Vereinbarung unverändert; Fingerabdruck ändert sich mit der Menge', () => {
    expect(vorhaltungStatus(v(), [], '2026-03-29').faellig).not.toBeNull()
    const a = v(); const b = V({ teilabbauten: [{ datum: '2026-03-16', verbleibendProzent: 60, verbleibendM2: 600, preisModus: 'anteilig' }] })
    expect(vorhaltungStand(a, [])).not.toBe(vorhaltungStand(b, []))
  })
})

describe('Schutz bereits berechneter Zeiträume (Mengen)', () => {
  const alt = V({ teilabbauten: [{ datum: '2026-03-23', verbleibendProzent: 70, verbleibendM2: 700, preisModus: 'anteilig' }] })
  const bisher = [P('2026-03-02', '2026-03-30', { intervalle: 4, netto: 250 * 3 + 175 })]
  it('Restmenge ändern, die einen berechneten Zeitraum träfe: abgelehnt; Änderung erst für spätere Zeiträume: erlaubt', () => {
    expect(pruefeVorhaltungVereinbarungAenderung(alt, { ...alt, teilabbauten: [{ ...alt.teilabbauten[0], verbleibendM2: 500, verbleibendProzent: 50 }] }, bisher)).toContain('bereits berechnete Zeiträume')
    const spaeter = { ...alt, teilabbauten: [...alt.teilabbauten, { datum: '2026-03-30', verbleibendProzent: 40, verbleibendM2: 400, preisModus: 'anteilig' as const }] }
    expect(pruefeVorhaltungVereinbarungAenderung(alt, spaeter, bisher)).toBeNull()
  })
  it('Bezugsmenge nachträglich ändern verschiebt bei Mengenangaben den Prozentsatz und wird deshalb abgelehnt, wenn berechnete Zeiträume betroffen sind', () => {
    expect(pruefeVorhaltungVereinbarungAenderung(alt, { ...alt, bezugM2: 2000 }, bisher)).toContain('bereits berechnete Zeiträume')
  })
})
