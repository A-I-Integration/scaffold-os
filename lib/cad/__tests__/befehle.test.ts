import { describe, it, expect } from 'vitest'
import { pruefeBefehl, planeBefehl, richtungZurSeite, findeFeld } from '@/lib/cad/befehle'

const f = (id: string, side: string, index: number, x: number, z: number, levelIndex = 0): any => ({ id, side, index, positionX: x, positionY: levelIndex * 2, positionZ: z, levelIndex })
const model: any = {
  fields: [
    f('f1', 'front', 0, -3, 5), f('f2', 'front', 1, 0, 5), f('f3', 'front', 2, 3, 5),
    f('f2o', 'front', 1, 0, 5, 1),
    f('r1', 'back', 0, -3, -5), f('l1', 'left', 0, -6, 0), f('rr1', 'right', 0, 6, 0),
  ],
  components3D: [
    { id: 'a', fieldId: 'f2' }, { id: 'b', fieldId: 'f2' }, { id: 'c', fieldId: 'f2o' }, { id: 'd', fieldId: 'f1' }, { id: 'stair-1', fieldId: 'f2' },
  ],
}
const geb: any = { lengthM: 10, widthM: 8, heightM: 9, eavesHeightM: 9, roofHeightM: 0 }
const ctx = (ids: string[] = []) => ({ auswahlIds: ids, gebaeude: geb })

describe('pruefeBefehl', () => {
  it('nimmt gültige Befehle an', () => {
    expect(pruefeBefehl({ befehl: 'verschieben', richtung: 'hoch', betrag_m: '0,5' })).toEqual({ ok: true, befehl: { befehl: 'verschieben', richtung: 'hoch', betragM: 0.5 } })
    expect(pruefeBefehl({ befehl: 'feld_entfernen', seite: 'Vorne', nummer: 3, lage: null })).toMatchObject({ ok: true })
    expect(pruefeBefehl({ befehl: 'treppe_setzen', seite: 'links', nummer: 2 })).toMatchObject({ ok: true })
    expect(pruefeBefehl({ befehl: 'hoehe_aendern', hoehe_m: 12 })).toMatchObject({ ok: true, befehl: { hoeheM: 12 } })
  })
  it('lehnt Unplausibles ab', () => {
    expect(pruefeBefehl({ befehl: 'verschieben', richtung: 'schräg', betrag_m: 1 }).ok).toBe(false)
    expect(pruefeBefehl({ befehl: 'verschieben', richtung: 'hoch', betrag_m: 500 }).ok).toBe(false)
    expect(pruefeBefehl({ befehl: 'feld_entfernen', seite: 'vorne', nummer: 2.5 }).ok).toBe(false)
    expect(pruefeBefehl({ befehl: 'hoehe_aendern', hoehe_m: 100 }).ok).toBe(false)
    expect(pruefeBefehl({ befehl: 'alles_loeschen' }).ok).toBe(false)
    expect(pruefeBefehl(null).ok).toBe(false)
  })
  it('gibt die Rückfrage der KI bei unklar weiter', () => {
    expect(pruefeBefehl({ befehl: 'unklar', frage: 'Welches Feld?' })).toEqual({ ok: false, grund: 'Welches Feld?' })
  })
})

describe('Richtung und Felder', () => {
  it('Richtung zur Seite ist waagrecht und normiert', () => {
    const d = richtungZurSeite(model, 'front')!
    expect(d[1]).toBe(0); expect(Math.hypot(d[0], d[2])).toBeCloseTo(1, 3); expect(d[2]).toBeGreaterThan(0)
  })
  it('findet das n-te Feld oder meldet es klar', () => {
    const ok = findeFeld(model, 'front', 2); expect(ok.ok && ok.feld.id).toBe('f2')
    expect(findeFeld(model, 'front', 9)).toMatchObject({ ok: false })
  })
})

describe('planeBefehl', () => {
  it('verschieben braucht eine Auswahl', () => {
    expect(planeBefehl({ befehl: 'verschieben', richtung: 'hoch', betragM: 1 }, model, ctx()).ok).toBe(false)
    const p = planeBefehl({ befehl: 'verschieben', richtung: 'hoch', betragM: 1 }, model, ctx(['a']))
    expect(p).toMatchObject({ ok: true, aktion: { art: 'verschieben', versatz: [0, 1, 0] } })
  })
  it('feld entfernen: alle Lagen, nur eine Lage, nie Treppenteile', () => {
    const alle = planeBefehl({ befehl: 'feld_entfernen', seite: 'front', nummer: 2, lage: null }, model, ctx())
    expect(alle).toMatchObject({ ok: true, aktion: { ids: ['a', 'b', 'c'] } })
    const eine = planeBefehl({ befehl: 'feld_entfernen', seite: 'front', nummer: 2, lage: 2 }, model, ctx())
    expect(eine).toMatchObject({ ok: true, aktion: { ids: ['c'] } })
    expect(planeBefehl({ befehl: 'feld_entfernen', seite: 'front', nummer: 2, lage: 5 }, model, ctx()).ok).toBe(false)
  })
  it('treppe setzen auf Feld', () => {
    expect(planeBefehl({ befehl: 'treppe_setzen', seite: 'front', nummer: 3 }, model, ctx())).toMatchObject({ ok: true, aktion: { feldId: 'f3' } })
    expect(planeBefehl({ befehl: 'treppe_setzen', seite: 'right', nummer: 4 }, model, ctx()).ok).toBe(false)
  })
  it('höhe ändern nutzt die Gebäudeprüfung', () => {
    const p = planeBefehl({ befehl: 'hoehe_aendern', hoeheM: 12 }, model, ctx())
    expect(p).toMatchObject({ ok: true }); if (p.ok && p.aktion.art === 'hoehe_aendern') expect(p.aktion.gebaeude.heightM).toBe(12)
  })
  it('ohne Modell klare Meldung', () => {
    expect(planeBefehl({ befehl: 'hoehe_aendern', hoeheM: 12 }, null, ctx()).ok).toBe(false)
  })
})
