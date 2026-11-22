import { describe, it, expect } from 'vitest'
import { pruefeNordrichtung, richtungsName, seitenWinkel, ansichtsName, ansichtsHinweis, nordVektor, nordpfeilDrehung } from '../ausrichtung'
import { liesProjektdatei, erzeugeProjektdatei, PROJEKTDATEI_FORMAT, PROJEKTDATEI_VERSION } from '../projektdatei'
import { projektZeilen } from '../projekt-info'
import { reiterLabel, ANSICHTS_EINTRAEGE } from '@/components/cad/AnsichtsReiter'
import { readFileSync } from 'fs'

describe('Nordrichtung prüfen', () => {
  it('normalisiert auf 0 ≤ x < 360 und rundet auf 0,1°', () => {
    expect(pruefeNordrichtung(0)).toBe(0); expect(pruefeNordrichtung(90)).toBe(90); expect(pruefeNordrichtung(360)).toBe(0)
    expect(pruefeNordrichtung(-90)).toBe(270); expect(pruefeNordrichtung(450)).toBe(90); expect(pruefeNordrichtung(30.04)).toBe(30); expect(pruefeNordrichtung(359.96)).toBe(0)
  })
  it('nimmt deutsche Kommazahlen und lehnt Unsinn ab', () => {
    expect(pruefeNordrichtung('12,5')).toBe(12.5); expect(pruefeNordrichtung(' 45 ')).toBe(45)
    for (const v of ['', '  ', 'abc', NaN, Infinity, null, undefined, {}, 1e9]) expect(pruefeNordrichtung(v)).toBeNull()
  })
})

describe('Himmelsrichtungen der Seiten', () => {
  it('0° = Rückseite Nord: vorne Süd, links West, rechts Ost', () => {
    expect(seitenWinkel(0, 'back')).toBe(0); expect(seitenWinkel(0, 'front')).toBe(180); expect(seitenWinkel(0, 'left')).toBe(270); expect(seitenWinkel(0, 'right')).toBe(90)
    expect(ansichtsName('ansicht-hinten', 0)).toBe('Ansicht Nord'); expect(ansichtsName('ansicht-vorne', 0)).toBe('Ansicht Süd')
    expect(ansichtsName('ansicht-links', 0)).toBe('Ansicht West'); expect(ansichtsName('ansicht-seite', 0)).toBe('Ansicht Ost')
  })
  it('90° / 180° / 270° drehen die Zuordnung', () => {
    expect(ansichtsName('ansicht-hinten', 90)).toBe('Ansicht Ost'); expect(ansichtsName('ansicht-vorne', 90)).toBe('Ansicht West')
    expect(ansichtsName('ansicht-hinten', 180)).toBe('Ansicht Süd'); expect(ansichtsName('ansicht-vorne', 180)).toBe('Ansicht Nord')
    expect(ansichtsName('ansicht-hinten', 270)).toBe('Ansicht West'); expect(ansichtsName('ansicht-links', 270)).toBe('Ansicht Süd')
  })
  it('die vier Seiten haben immer vier verschiedene Namen, auch bei schrägen Winkeln', () => {
    for (let g = 0; g < 360; g += 7.5) {
      const n = (['ansicht-vorne', 'ansicht-hinten', 'ansicht-links', 'ansicht-seite'] as const).map((k) => ansichtsName(k, g))
      expect(new Set(n).size, `Winkel ${g}`).toBe(4)
    }
    expect(ansichtsName('ansicht-hinten', 30)).toBe('Ansicht Nordost'); expect(richtungsName(337.6)).toBe('Nord'); expect(richtungsName(22)).toBe('Nord'); expect(richtungsName(23)).toBe('Nordost')
  })
  it('ohne Nordrichtung bleibt alles wie bisher (alte Projekte)', () => {
    expect(ansichtsName('ansicht-vorne', null)).toBe('Ansicht vorne'); expect(ansichtsName('ansicht-hinten', undefined)).toBe('Ansicht hinten')
    expect(ansichtsName('ansicht-links', undefined)).toBe('Ansicht links'); expect(ansichtsName('ansicht-seite', null)).toBe('Ansicht rechts')
    expect(ansichtsHinweis('ansicht-vorne', null)).toBe('Seite vorne')
    for (const e of ANSICHTS_EINTRAEGE) expect(reiterLabel(e, null)).toBe(e.label)
  })
  it('Reiter mit Nordrichtung: nur die vier Seitenansichten werden umbenannt', () => {
    const lab = ANSICHTS_EINTRAEGE.map((e) => reiterLabel(e, 0))
    expect(lab).toContain('Ansicht Süd'); expect(lab).toContain('Grundriss'); expect(lab).toContain('Schnitt A-A'); expect(lab).toContain('3D Modell')
    expect(ansichtsHinweis('ansicht-vorne', 0)).toBe('Seite vorne des Gebäudes, zeigt nach Süd (180°)')
  })
})

describe('Nordpfeil', () => {
  it('Szene (vorne = +z, hinten = −z, rechts = +x): 0° → Norden bei „oben“ (−z), 90° → Norden links (−x)', () => {
    const n0 = nordVektor(0); expect(n0.x).toBeCloseTo(0); expect(n0.z).toBeCloseTo(-1)
    const n90 = nordVektor(90); expect(n90.x).toBeCloseTo(-1); expect(n90.z).toBeCloseTo(0)
    const n180 = nordVektor(180); expect(n180.x).toBeCloseTo(0); expect(n180.z).toBeCloseTo(1)
    const n270 = nordVektor(270); expect(n270.x).toBeCloseTo(1); expect(n270.z).toBeCloseTo(0)
  })
  it('passt zu den Seiten: bei 90° liegt Norden dort, wo die linke Seite ist, und links zeigt nach Norden', () => {
    expect(seitenWinkel(90, 'left')).toBe(0)
  })
  it('2D-Drehung: Gegenstück zur Nordrichtung im Uhrzeigersinn', () => {
    expect(nordpfeilDrehung(0)).toBe(0); expect(nordpfeilDrehung(90)).toBe(270); expect(nordpfeilDrehung(270)).toBe(90); expect(nordpfeilDrehung(180)).toBe(180)
  })
})

describe('Speichern und Laden', () => {
  const basis = { lengthM: 10, widthM: 8, heightM: 9, eavesHeightM: 9, roofHeightM: 0, roofForm: 'flachdach', floors: 3, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front'] } as never
  const roh = (building: unknown) => JSON.stringify({ format: PROJEKTDATEI_FORMAT, version: PROJEKTDATEI_VERSION, name: 'T', gespeichertAm: '2026-11-22T00:00:00Z', building, systemId: 'mj-uni', statikDaten: {}, notizen: [] })
  it('Nordrichtung überlebt Speichern und Laden', () => {
    const d = erzeugeProjektdatei({ building: { ...(basis as object), nordrichtungGrad: 135 } as never, systemId: 'mj-uni', statikDaten: {} as never, notizen: [] })
    const r = liesProjektdatei(JSON.stringify(d))
    expect(r.ok && r.daten.building.nordrichtungGrad).toBe(135)
  })
  it('alte Projektdatei ohne Nordrichtung: bleibt ohne (keine stille Vorbelegung)', () => {
    const r = liesProjektdatei(roh(basis))
    expect(r.ok).toBe(true); if (r.ok) { expect('nordrichtungGrad' in r.daten.building).toBe(false); expect(r.verworfen).not.toContain('Nordrichtung') }
  })
  it('ungültige Nordrichtung wird verworfen und gemeldet, normalisiert wird sonst', () => {
    const a = liesProjektdatei(roh({ ...(basis as object), nordrichtungGrad: 'nord' })); expect(a.ok && a.daten.building.nordrichtungGrad).toBeUndefined(); expect(a.ok && a.verworfen).toContain('Nordrichtung')
    const b = liesProjektdatei(roh({ ...(basis as object), nordrichtungGrad: -90 })); expect(b.ok && b.daten.building.nordrichtungGrad).toBe(270)
  })
})

describe('Anzeige', () => {
  const e = { name: 'X', systemName: null, speicherText: 'Gespeichert', versionText: 'v1' }
  it('Projektinformationen zeigen die Nordrichtung nur, wenn angegeben', () => {
    expect(projektZeilen(e).some((z) => z.label === 'Nordrichtung')).toBe(false)
    expect(projektZeilen({ ...e, nordrichtungGrad: 12.5 }).find((z) => z.label === 'Nordrichtung')?.wert).toBe('12,5° (Rückseite: Nord)')
  })
  it('Verdrahtung: Reiter, Grundriss und 3D bekommen die Nordrichtung aus dem Gebäude', () => {
    expect(readFileSync('app/cad/page.tsx', 'utf8')).toContain('nordrichtungGrad={building.nordrichtungGrad}')
    expect(readFileSync('components/cad/Scaffold2D.tsx', 'utf8')).toContain('<Nordpfeil nordrichtungGrad={nord}')
    expect(readFileSync('components/cad/Scaffold3D.tsx', 'utf8')).toContain('<Nordpfeil3D nordrichtungGrad=')
    expect(readFileSync('components/cad/BuildingForm.tsx', 'utf8')).toContain('<AusrichtungBereich')
  })
})
