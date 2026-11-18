import { describe, it, expect } from 'vitest'
import { baueManuellesLv, pruefeManuellesLv, bereinigeManuelleTitel } from '@/lib/lv-manuell'

const kopf = { bauvorhaben: 'Haus A', bauherr: 'Meier', objektadresse: 'Str. 1', auftragnehmer: 'Firma', mwstProzent: 19 }
const titel = [
  { titel: 'Fassadengerüst', positionen: [
    { titel: 'Gerüst aufbauen', menge: 100, einheit: 'm²', ep: 8.5 },
    { titel: 'Gerüst abbauen', menge: 100, einheit: 'm²', ep: 3 },
    { titel: '   ', menge: 5, einheit: 'Stk', ep: 1 },
  ] },
  { titel: 'Leer', positionen: [] },
  { titel: 'Zusatz', positionen: [{ titel: 'Treppenturm', menge: 1, einheit: 'Stück', ep: 0 }] },
]

describe('Leistungsverzeichnis manuell', () => {
  it('verwirft leere Positionen und leere Titel, nummeriert neu', () => {
    const b = bereinigeManuelleTitel(titel)
    expect(b.map((t) => t.titel)).toEqual(['Fassadengerüst', 'Zusatz'])
    const lv = baueManuellesLv(kopf, titel)
    expect(lv.titel[0].positionen.map((p) => p.nr)).toEqual(['1.01', '1.02'])
    expect(lv.titel[1].nrText).toBe('02')
  })
  it('rechnet Menge × EP, Titelsummen, Netto, MwSt und Brutto', () => {
    const lv = baueManuellesLv(kopf, titel)
    expect(lv.titel[0].positionen[0].gp).toBe(850)
    expect(lv.titel[0].summe).toBe(1150)
    expect(lv.summeNetto).toBe(1150)
    expect(lv.mwst).toBe(218.5)
    expect(lv.summeBrutto).toBe(1368.5)
  })
  it('nutzt den MwSt-Satz aus dem Kopf', () => {
    expect(baueManuellesLv({ ...kopf, mwstProzent: 7 }, titel).mwst).toBe(80.5)
  })
  it('meldet Positionen ohne Preis als fehlende Angabe', () => {
    expect(baueManuellesLv(kopf, titel).fehlendeAngaben).toEqual(['Pos. 2.01: Preis fehlt'])
  })
  it('Prüfung: ohne Position nicht speicherbar', () => {
    expect(pruefeManuellesLv([{ titel: 'A', positionen: [] }])).not.toBeNull()
    expect(pruefeManuellesLv(titel)).toBeNull()
  })
  it('Langtext wird in Absätze zerlegt', () => {
    const lv = baueManuellesLv(kopf, [{ titel: 'T', positionen: [{ titel: 'P', text: 'a\n\n b ', menge: 1, einheit: 'St', ep: 1 }] }])
    expect(lv.titel[0].positionen[0].text).toEqual(['a', 'b'])
  })
})
