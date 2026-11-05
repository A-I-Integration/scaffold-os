// ============================================================
// Modellstand- und Eingabekonsistenz: modellHash, Herkunft von Stückliste/Stunden im LV, Eingabe-Fingerabdruck.
// Es laufen die echten Produktionsfunktionen.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest'
import {
  generateCADModel, generateBillOfMaterials, calculateLogistics, addManualPlacement,
  type BuildingParams, type CADModel,
} from '@/lib/calculations/cad-engine'
import { modellHash, eingabeFingerprint, stuecklisteFingerprint, stundenFingerprint, pruefeHerkunft } from '@/lib/calculations/modell-stand'
import { wendeLagerAn } from '@/lib/calculations/cad-lager'
import { erzeugeLeistungsverzeichnis, LV_STANDARD_EINGABEN, type LvEingaben } from '@/lib/leistungsverzeichnis'

const GEBAEUDE: BuildingParams = {
  lengthM: 20, widthM: 10, heightM: 31, eavesHeightM: 31, roofHeightM: 0, roofForm: 'flachdach',
  floors: 10, floorHeightsM: Array(10).fill(3.1), windowCount: 0, doorCount: 0, balconyCount: 0,
  overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'],
  geruestOptionen: { aufzug: { seite: 'front', gemietet: true } },
}
const SYSTEM = 'layher-allround'
const PREISE: LvEingaben = { ...LV_STANDARD_EINGABEN, stundensatzFach: 60, stundensatzHelfer: 40, mietsatzProzentJeWoche: 2, zuschlagProzent: 10 }

const konsole = (m: CADModel, id?: string): CADModel => {
  const f = m.fields[0]
  return addManualPlacement(m, { ...(id ? { id } : {}), type: 'console', positionX: f.positionX, positionY: 4, positionZ: f.positionZ, side: f.side, levelIndex: 1, fieldId: f.id })
}
const lvMit = (model: CADModel, materials = generateBillOfMaterials(model), extra: { stundenModellHash?: string; aufbau?: number; abbau?: number; e?: LvEingaben } = {}) => {
  const lg = calculateLogistics(model, materials, 2)
  return erzeugeLeistungsverzeichnis({
    model, materials, aufbauStunden: extra.aufbau ?? lg.aufbauStunden, abbauStunden: extra.abbau ?? lg.abbauStunden,
    ...(extra.stundenModellHash !== undefined ? { stundenModellHash: extra.stundenModellHash } : {}),
  }, extra.e ?? PREISE)
}

let modell: CADModel
beforeAll(() => { modell = generateCADModel(GEBAEUDE, SYSTEM) })

describe('modellHash', () => {
  it('gleiche Eingaben → gleicher Hash; unabhängig von Reihenfolge und Zufalls-IDs der Bauteile', () => {
    const b = generateCADModel(GEBAEUDE, SYSTEM)
    expect(modellHash(b)).toBe(modellHash(modell))
    expect(modellHash({ ...modell, components3D: [...modell.components3D].reverse() })).toBe(modellHash(modell))
    // zwei manuelle Bauteile gleichen Inhalts mit verschiedenen Zufalls-IDs
    expect(modellHash(konsole(modell, 'manual-console-a1'))).toBe(modellHash(konsole(modell, 'manual-console-zz9')))
    expect(modellHash(konsole(modell))).toBe(modellHash(konsole(modell)))
  })
  it('echte Änderungen ändern den Hash: Bauteil hinzu, entfernt, Artikel, extern, Maße', () => {
    const h = modellHash(modell)
    expect(modellHash(konsole(modell))).not.toBe(h)
    expect(modellHash({ ...modell, components3D: modell.components3D.slice(1) })).not.toBe(h)
    const i = modell.components3D.findIndex((c) => c.type === 'frame')
    const mit = (f: (c: CADModel['components3D'][number]) => CADModel['components3D'][number]) =>
      ({ ...modell, components3D: modell.components3D.map((c, k) => (k === i ? f(c) : c)) })
    expect(modellHash(mit((c) => ({ ...c, articleNumber: c.articleNumber + 'X' })))).not.toBe(h)
    expect(modellHash(mit((c) => ({ ...c, extern: true })))).not.toBe(h)
    expect(modellHash(mit((c) => ({ ...c, position: [c.position[0] + 0.01, c.position[1], c.position[2]] as typeof c.position })))).not.toBe(h)
    expect(modellHash(generateCADModel({ ...GEBAEUDE, heightM: 28, eavesHeightM: 28, floorHeightsM: Array(10).fill(2.8) }, SYSTEM))).not.toBe(h)
  })
  it('Rechenrauschen unter 1 mm erzeugt keinen neuen Stand', () => {
    const mit = { ...modell, components3D: modell.components3D.map((c) => ({ ...c, position: c.position.map((v) => v + 1e-7) as typeof c.position })) }
    expect(modellHash(mit)).toBe(modellHash(modell))
  })
})

describe('Stückliste und Logistik tragen den Modellstand', () => {
  it('jede Stücklistenzeile und die Logistik tragen modellHash(model)', () => {
    const bom = generateBillOfMaterials(modell)
    expect(bom.length).toBeGreaterThan(0)
    for (const m of bom) expect(m.modellHash, m.articleNumber).toBe(modellHash(modell))
    expect(calculateLogistics(modell, bom, 2).modellHash).toBe(modellHash(modell))
  })
})

describe('Leistungsverzeichnis: Herkunftsprüfung', () => {
  it('gleicher Stand (Stückliste und Stunden aus demselben Modell) → ok, keine Hinweise', () => {
    const bom = generateBillOfMaterials(modell)
    const lg = calculateLogistics(modell, bom, 2)
    const lv = lvMit(modell, bom, { stundenModellHash: lg.modellHash })
    expect(lv.herkunft?.status).toBe('ok')
    expect(lv.herkunft?.hinweise).toEqual([])
    expect(lv.herkunft?.modellHash).toBe(modellHash(modell))
  })
  it('Stückliste aus älterem Stand → Abweichung mit verständlichem Hinweis, LV bleibt erzeugbar (Entwurf)', () => {
    const alt = generateBillOfMaterials(modell)
    const neu = konsole(modell)
    const lv = lvMit(neu, alt)
    expect(lv.herkunft?.status).toBe('abweichung')
    expect(lv.herkunft?.hinweise.join(' ')).toMatch(/Stückliste.*anderen Modellstand/)
    expect(lv.fehlendeAngaben.join(' ')).toMatch(/anderen Modellstand/)
  })
  it('Modell nach der Stückliste geändert → Abweichung; Stückliste neu erzeugt → wieder ok', () => {
    const bom = generateBillOfMaterials(modell)
    const geaendert = { ...modell, components3D: modell.components3D.slice(0, modell.components3D.length - 5) }
    expect(lvMit(geaendert, bom).herkunft?.status).toBe('abweichung')
    expect(lvMit(geaendert).herkunft?.status).toBe('ok')
  })
  it('Stunden aus anderem Modellstand → Abweichung; von Hand eingegebene Stunden (ohne Stand) → keine Abweichung', () => {
    const bom = generateBillOfMaterials(modell)
    const fremd = calculateLogistics(konsole(modell), bom, 2).modellHash
    const lv = lvMit(modell, bom, { stundenModellHash: fremd })
    expect(lv.herkunft?.status).toBe('abweichung')
    expect(lv.herkunft?.hinweise.join(' ')).toMatch(/stunden.*anderen Modellstand/i)
    const hand = lvMit(modell, bom, { aufbau: 123, abbau: 45 })
    expect(hand.herkunft?.status).not.toBe('abweichung')
  })
  it('Stückliste ohne Modellstand (von Hand gebaut) → unbekannt, nicht Abweichung', () => {
    const bom = generateBillOfMaterials(modell).map(({ modellHash: _h, ...rest }) => rest)
    const lv = lvMit(modell, bom as ReturnType<typeof generateBillOfMaterials>)
    expect(lv.herkunft?.status).toBe('unbekannt')
  })
  it('gemischte Stände in einer Stückliste werden gemeldet', () => {
    const a = generateBillOfMaterials(modell), b = generateBillOfMaterials(konsole(modell))
    const p = pruefeHerkunft({ model: modell, materials: [a[0], { ...b[1] }] })
    expect(p.status).toBe('abweichung')
    expect(p.hinweise.join(' ')).toMatch(/mischt/)
  })
})

describe('Eingabe-Fingerabdruck: Stunden, Preise, Katalog', () => {
  const basis = () => {
    const materials = generateBillOfMaterials(modell)
    const lg = calculateLogistics(modell, materials, 2)
    return { materials, aufbauStunden: lg.aufbauStunden, abbauStunden: lg.abbauStunden, einstellungen: PREISE }
  }
  it('identische Eingaben (auch in anderer Zeilenreihenfolge) → identischer Fingerabdruck', () => {
    const e = basis()
    expect(eingabeFingerprint(e)).toBe(eingabeFingerprint(basis()))
    expect(eingabeFingerprint({ ...e, materials: [...e.materials].reverse() })).toBe(eingabeFingerprint(e))
  })
  it('geänderte Stunden → anderer Fingerabdruck', () => {
    const e = basis()
    expect(eingabeFingerprint({ ...e, aufbauStunden: e.aufbauStunden + 1 })).not.toBe(eingabeFingerprint(e))
    expect(stundenFingerprint(10, 5)).not.toBe(stundenFingerprint(10, 6))
    expect(lvMit(modell, e.materials, { aufbau: e.aufbauStunden + 1 }).herkunft?.eingabeFingerprint).not.toBe(lvMit(modell, e.materials).herkunft?.eingabeFingerprint)
  })
  it('geänderte Preise (Lager) → anderer Fingerabdruck der Stückliste, Modellstand bleibt', () => {
    const e = basis()
    const lager = wendeLagerAn(e.materials, [{ sku: e.materials[0].articleNumber, unit_price: e.materials[0].unitPrice + 7 }]).materials
    expect(stuecklisteFingerprint(lager)).not.toBe(stuecklisteFingerprint(e.materials))
    expect(lager[0].modellHash).toBe(modellHash(modell))
    expect(lvMit(modell, lager).herkunft?.status).toBe('ok')
    expect(lvMit(modell, lager).herkunft?.eingabeFingerprint).not.toBe(lvMit(modell, e.materials).herkunft?.eingabeFingerprint)
  })
  it('geänderte LV-Einstellungen (Stundensatz) → anderer Fingerabdruck', () => {
    const e = basis()
    expect(eingabeFingerprint({ ...e, einstellungen: { ...PREISE, stundensatzFach: 61 } })).not.toBe(eingabeFingerprint(e))
  })
  it('Katalogwahl: anderer Artikel für dieselbe Menge → anderer Fingerabdruck', () => {
    const e = basis()
    const m0 = e.materials[0]
    const anders = e.materials.map((m, i) => (i === 0 ? { ...m, vorKatalog: { ...(m.vorKatalog ?? {}), articleNumber: 'KAT-1' } as unknown as typeof m.vorKatalog } : m))
    expect(stuecklisteFingerprint(anders)).not.toBe(stuecklisteFingerprint(e.materials))
    expect(m0).toBeDefined()
  })
})

describe('Fachregeln bleiben: extern und manuelle Bauteile', () => {
  it('externes Bauteil: nicht in der Stückliste, aber im Modellstand', () => {
    const i = modell.components3D.findIndex((c) => c.type === 'frame')
    const ext = { ...modell, components3D: modell.components3D.map((c, k) => (k === i ? { ...c, extern: true } : c)) }
    const summe = (m: CADModel) => generateBillOfMaterials(m).filter((x) => x.articleNumber === modell.components3D[i].articleNumber).reduce((s, x) => s + x.quantity, 0)
    expect(summe(ext)).toBe(summe(modell) - 1)
    expect(modellHash(ext)).not.toBe(modellHash(modell))
    expect(lvMit(ext).herkunft?.status).toBe('ok')
  })
  it('manuelle Konsole: Stückliste +1, Modellstand neu, Ausgangsmodell unverändert, LV ok', () => {
    const vorher = modellHash(modell), anzahl = modell.components3D.length
    const neu = konsole(modell)
    expect(modell.components3D).toHaveLength(anzahl)
    expect(modellHash(modell)).toBe(vorher)
    const mengeKonsolen = (m: CADModel) => generateBillOfMaterials(m).filter((x) => x.category === 'Konsolen').reduce((s, x) => s + x.quantity, 0)
    expect(mengeKonsolen(neu)).toBe(mengeKonsolen(modell) + 1)
    expect(lvMit(neu).herkunft?.status).toBe('ok')
  })
})
