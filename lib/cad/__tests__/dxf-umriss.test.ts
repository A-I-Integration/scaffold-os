import { describe, it, expect } from 'vitest'
import { leseDxfUmriss, mitHoehen, type DxfUmrissErgebnis, type DxfLeseErgebnis } from '@/lib/cad/dxf-umriss'
import { abschnitteAusTeileListe } from '@/lib/cad/modell-analyse'
import { generateCADModel, type BuildingParams } from '@/lib/calculations/cad-engine'
import { erzeugeZeichnungen } from '@/lib/geruest/plan-zeichnung'

// ---------- Synthetische DXF-Texte -------------------------------------------------
type P = [number, number]
const paare = (...p: (string | number)[]) => p.join('\n') + '\n'
const linie = (ebene: string, a: P, b: P) => paare(0, 'LINE', 8, ebene, 10, a[0], 20, a[1], 30, 0, 11, b[0], 21, b[1], 31, 0)
const lwpoly = (ebene: string, pts: P[], geschlossen = true) =>
  paare(0, 'LWPOLYLINE', 8, ebene, 90, pts.length, 70, geschlossen ? 1 : 0) + pts.map((q) => paare(10, q[0], 20, q[1])).join('')
const poly = (ebene: string, pts: P[], geschlossen = true) =>
  paare(0, 'POLYLINE', 8, ebene, 66, 1, 70, geschlossen ? 1 : 0) + pts.map((q) => paare(0, 'VERTEX', 8, ebene, 10, q[0], 20, q[1])).join('') + paare(0, 'SEQEND', 8, ebene)
const text = (ebene: string, s: string) => paare(0, 'TEXT', 8, ebene, 10, 0, 20, 0, 40, 0.2, 1, s)
const ring = (ebene: string, pts: P[]) => pts.map((q, i) => linie(ebene, q, pts[(i + 1) % pts.length])).join('')
const dxf = (entitaeten: string, insunits: number | null = 6) =>
  paare(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015') + (insunits === null ? '' : paare(9, '$INSUNITS', 70, insunits)) + paare(0, 'ENDSEC') +
  paare(0, 'SECTION', 2, 'ENTITIES') + entitaeten + paare(0, 'ENDSEC') + paare(0, 'EOF')

const RECHTECK: P[] = [[0, 0], [12, 0], [12, 8], [0, 8]]
const L_FORM: P[] = [[0, 0], [20, 0], [20, 6], [8, 6], [8, 14], [0, 14]]
// U mit Öffnung nach oben: Fuß 18 × 5, zwei Schenkel 5 × 7
const U_FORM: P[] = [[0, 0], [18, 0], [18, 12], [13, 12], [13, 5], [5, 5], [5, 12], [0, 12]]

const dreheVerschiebe = (pts: P[], grad: number, dx: number, dy: number): P[] => {
  const c = Math.cos((grad * Math.PI) / 180), s = Math.sin((grad * Math.PI) / 180)
  return pts.map(([x, y]) => [x * c - y * s + dx, x * s + y * c + dy])
}

const erfolg = (r: DxfLeseErgebnis): DxfUmrissErgebnis => {
  if (!r.ok) throw new Error('kein Umriss: ' + r.grund + ' ' + r.hinweise.join(' '))
  return r
}
const nah = (ist: number, soll: number, tol = 0.05) => Math.abs(ist - soll) <= tol * soll
/** Teile ohne Rücksicht auf Reihenfolge/Richtung: sortierte [Länge, Tiefe] */
const masse = (r: DxfUmrissErgebnis) => (r.teile ?? []).map((t) => [t.laengeM, t.tiefeM]).sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('DXF-Umriss: Grundformen', () => {
  it('Rechteck aus vier LINE-Entitäten: 4 Ecken, richtige Maße, ein Teil mit Hinweis „Höhe ergänzen“', () => {
    const r = erfolg(leseDxfUmriss(dxf(ring('WAND', RECHTECK))))
    expect(r.form).toBe('rechteck')
    expect(r.ecken).toBe(4)
    expect(r.innenecken).toBe(0)
    expect(nah(r.laengeM, 12)).toBe(true)
    expect(nah(r.breiteM, 8)).toBe(true)
    expect(nah(r.flaecheM2, 96)).toBe(true)
    expect(r.einheit).toBe('m')
    expect(r.einheitQuelle).toBe('zeichnung')
    expect(r.teile).toHaveLength(1)
    const t = r.teile![0]
    expect(t.quelle).toBe('dxf')
    expect(t.typ).toBe('bauteil')
    expect(t.hoeheM).toBe(0)           // Höhe wird nie erfunden
    expect(t.hinweis).toBe('Höhe ergänzen')
  })

  it('Rechteck als geschlossene LWPOLYLINE und als POLYLINE/VERTEX liefert dasselbe', () => {
    for (const e of [lwpoly('WAND', RECHTECK), poly('WAND', RECHTECK)]) {
      const r = erfolg(leseDxfUmriss(dxf(e)))
      expect(r.ecken).toBe(4)
      expect(nah(r.laengeM, 12)).toBe(true)
      expect(nah(r.breiteM, 8)).toBe(true)
    }
  })

  it('L-Form: 6 Ecken, 1 Innenecke, zwei Teile mit den richtigen Maßen', () => {
    const r = erfolg(leseDxfUmriss(dxf(ring('WAND', L_FORM))))
    expect(r.form).toBe('l-form')
    expect(r.ecken).toBe(6)
    expect(r.innenecken).toBe(1)
    expect(nah(r.flaecheM2, 20 * 6 + 8 * 8)).toBe(true)
    expect(r.teile).toHaveLength(2)
    // Streifen längs: 8 × 14 und 12 × 6 (oder quer: 20 × 6 und 8 × 8); die Summe der Flächen ist in beiden Fällen 184 m²
    const flaeche = r.teile!.reduce((s, t) => s + t.laengeM * t.tiefeM, 0)
    expect(nah(flaeche, 184)).toBe(true)
    const m = masse(r)
    const laengs = nah(m[0][0], 8) && nah(m[0][1], 14) && nah(m[1][0], 12) && nah(m[1][1], 6)
    const quer = nah(m[0][0], 8) && nah(m[0][1], 8) && nah(m[1][0], 20) && nah(m[1][1], 6)
    expect(laengs || quer).toBe(true)
  })

  it('U-Form mit zwei Innenecken: 8 Ecken, drei Teile (Schenkel – Fuß – Schenkel)', () => {
    const r = erfolg(leseDxfUmriss(dxf(ring('WAND', U_FORM))))
    expect(r.form).toBe('u-form')
    expect(r.ecken).toBe(8)
    expect(r.innenecken).toBe(2)
    expect(r.teile).toHaveLength(3)
    const flaeche = r.teile!.reduce((s, t) => s + t.laengeM * t.tiefeM, 0)
    expect(nah(flaeche, 18 * 12 - 8 * 7)).toBe(true)   // 160
    // Streifen längs der langen Seite: 5 × 12 | 8 × 5 | 5 × 12
    expect(masse(r)).toEqual([[5, 12], [5, 12], [8, 5]])
    // Mittelstück sitzt hinten: Versatz gegenüber den Schenkeln
    const mitte = r.teile!.find((t) => t.laengeM === 8)!
    expect(Math.abs(mitte.versatzM)).toBeCloseTo(3.5, 1)
  })

  it('U-Form mit Öffnung seitlich (zwei Abschnitte je Streifen) wird über die andere Achse zerlegt', () => {
    const seitlich = U_FORM.map(([x, y]): P => [y, x])    // an der Diagonalen gespiegelt = Öffnung nach rechts
    const r = erfolg(leseDxfUmriss(dxf(ring('WAND', seitlich))))
    expect(r.form).toBe('u-form')
    expect(r.teile).toHaveLength(3)
    expect(masse(r)).toEqual([[5, 12], [5, 12], [8, 5]])
  })

  it('schräge Wände: Vieleck mit Umriss, aber keine Teile', () => {
    const trapez: P[] = [[0, 0], [20, 0], [16, 9], [3, 9]]
    const r = erfolg(leseDxfUmriss(dxf(ring('WAND', trapez))))
    expect(r.form).toBe('vieleck')
    expect(r.rechtwinklig).toBe(false)
    expect(r.ecken).toBe(4)
    expect(r.teile).toBeNull()
    expect(r.hinweise.join(' ')).toContain('Vieleck')
  })
})

describe('DXF-Umriss: Toleranz, Ebenen, Drehung, Einheit', () => {
  it('kleine Lücken (5 cm) an den Ecken werden geschlossen, große (2 m) nicht', () => {
    const mitLuecke = (l: number) => dxf(
      linie('WAND', [0, 0], [12 - l, 0]) + linie('WAND', [12, 0], [12, 8]) + linie('WAND', [12, 8], [0, 8]) + linie('WAND', [0, 8], [0, 0]))
    const klein = erfolg(leseDxfUmriss(mitLuecke(0.05)))
    expect(klein.ecken).toBe(4)
    expect(nah(klein.laengeM, 12)).toBe(true)
    const gross = leseDxfUmriss(mitLuecke(2))
    expect(gross.ok).toBe(false)
  })

  it('offene Kette → ok: false mit fallbackKi (Wechsel auf den KI-Weg)', () => {
    const r = leseDxfUmriss(dxf(linie('WAND', [0, 0], [12, 0]) + linie('WAND', [12, 0], [12, 8]) + linie('WAND', [12, 8], [0, 8])))
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.fallbackKi).toBe(true); expect(r.grund).toBe('kein-geschlossener-umriss') }
  })

  it('Ebenen-Rauschen: Bemaßung, Achsen und Zeichnungsrahmen werden ignoriert, auch wenn sie größer sind', () => {
    const rahmen: P[] = [[-5, -5], [60, -5], [60, 45], [-5, 45]]
    const bemassung: P[] = [[-2, -2], [14, -2], [14, 10], [-2, 10]]
    const e = ring('A-WALL', RECHTECK) + ring('Rahmen', rahmen) + ring('BEMASSUNG', bemassung) +
      linie('Achsen', [-3, 4], [15, 4]) + text('Text', 'Maßstab 1:100')
    const r = erfolg(leseDxfUmriss(dxf(e)))
    expect(r.ebenen.modus).toBe('wand-ebenen')
    expect(r.ebenen.verwendet).toEqual(['A-WALL'])
    expect(r.ebenen.ignoriert).toEqual(expect.arrayContaining(['Rahmen', 'BEMASSUNG', 'Achsen']))
    expect(nah(r.laengeM, 12)).toBe(true)
    expect(nah(r.breiteM, 8)).toBe(true)
  })

  it('unklare Ebenennamen: alle Geometrie wird gelesen, die größte geschlossene Figur gilt', () => {
    const innen: P[] = [[3, 2], [6, 2], [6, 5], [3, 5]]
    const e = ring('0', RECHTECK) + ring('0', innen) + linie('Layer7', [20, 20], [25, 20])
    const r = erfolg(leseDxfUmriss(dxf(e)))
    expect(r.ebenen.modus).toBe('alle')
    expect(nah(r.laengeM, 12)).toBe(true)
    expect(r.hinweise.join(' ')).toContain('nicht eindeutig')
  })

  it('Innenwände am Rand und Wanddicke: es zählt die Außenkontur', () => {
    const innenwand = linie('WAND', [0, 4], [12, 4]) + linie('WAND', [6, 0], [6, 8]) + linie('WAND', [6, 4], [9, 7])  // endet frei → Stichleitung
    const innenRing: P[] = [[0.3, 0.3], [11.7, 0.3], [11.7, 7.7], [0.3, 7.7]]
    const r = erfolg(leseDxfUmriss(dxf(ring('WAND', RECHTECK) + ring('WAND', innenRing) + innenwand)))
    expect(r.ecken).toBe(4)
    expect(nah(r.laengeM, 12)).toBe(true)
    expect(nah(r.breiteM, 8)).toBe(true)
  })

  it('gedreht (30°) und weit verschoben: gleiche Ecken, Maße innerhalb 5 %', () => {
    for (const [form, ecken, innen] of [[RECHTECK, 4, 0], [L_FORM, 6, 1], [U_FORM, 8, 2]] as [P[], number, number][]) {
      const ref = erfolg(leseDxfUmriss(dxf(ring('WAND', form))))
      const r = erfolg(leseDxfUmriss(dxf(ring('WAND', dreheVerschiebe(form, 30, 354000.25, 5410000.5)))))
      expect(r.ecken).toBe(ecken)
      expect(r.innenecken).toBe(innen)
      expect(r.rechtwinklig).toBe(true)
      expect(nah(r.laengeM, ref.laengeM)).toBe(true)
      expect(nah(r.breiteM, ref.breiteM)).toBe(true)
      expect(nah(r.flaecheM2, ref.flaecheM2)).toBe(true)
      expect(masse(r)).toEqual(masse(ref))
      // Eckpunkte: Kantenlängen stimmen auf 2 % (Abstände zwischen den Ecken, unabhängig von Lage und Drehung)
      const kanten = (u: DxfUmrissErgebnis['umriss']) => u.map((a, i) => Math.hypot(u[(i + 1) % u.length].x - a.x, u[(i + 1) % u.length].z - a.z)).sort((a, b) => a - b)
      const k0 = kanten(ref.umriss), k1 = kanten(r.umriss)
      expect(k1).toHaveLength(k0.length)
      k0.forEach((l, i) => expect(Math.abs(k1[i] - l) / l).toBeLessThanOrEqual(0.02))
    }
  })

  it('Millimeter-Zeichnung: INSUNITS 4 → Maße in Metern; ohne Angabe wird geschätzt und gekennzeichnet; Vorgabe überschreibt', () => {
    const mm = RECHTECK.map(([x, y]): P => [x * 1000, y * 1000])
    const a = erfolg(leseDxfUmriss(dxf(ring('WAND', mm), 4)))
    expect(a.einheit).toBe('mm'); expect(a.einheitQuelle).toBe('zeichnung'); expect(nah(a.laengeM, 12)).toBe(true)
    const b = erfolg(leseDxfUmriss(dxf(ring('WAND', mm), null)))
    expect(b.einheitQuelle).toBe('geschaetzt')
    expect(b.hinweise.join(' ')).toContain('keine Einheit')
    const c = erfolg(leseDxfUmriss(dxf(ring('WAND', mm), null), { einheit: 'mm' }))
    expect(c.einheitQuelle).toBe('vorgabe'); expect(nah(c.laengeM, 12)).toBe(true)
  })
})

describe('DXF-Umriss: Fallback und Höhen', () => {
  it('Texte vorhanden, Geometrie unbrauchbar → ok: false, fallbackKi, Text bleibt erhalten (KI-/Textweg)', () => {
    const e = text('Text', 'Traufhöhe 7,50 m') + text('Text', 'Hausmaß 12,00 x 8,00 m') + linie('WAND', [0, 0], [12, 0]) + linie('WAND', [12, 0], [12, 8])
    const r = leseDxfUmriss(dxf(e))
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.fallbackKi).toBe(true); expect(r.text).toContain('Traufhöhe 7,50 m') }
  })

  it('keine Linien, kaputte oder Binär-DXF → ok: false, wirft nie', () => {
    expect(leseDxfUmriss(dxf(text('Text', 'nur Text'))).ok).toBe(false)
    expect(leseDxfUmriss('das ist keine DXF').ok).toBe(false)
    expect(leseDxfUmriss('').ok).toBe(false)
    expect(leseDxfUmriss('AutoCAD Binary DXF\r\n\x1a\0 ...').ok).toBe(false)
    const r = leseDxfUmriss(dxf(''))
    expect(r.ok === false && r.grund).toBe('keine-geometrie')
  })

  it('Höhe nur aus belegter Beschriftung: ein Teil bekommt die Traufhöhe, bei mehreren Teilen bleibt sie offen', () => {
    const t = text('Text', 'Traufhöhe: 7,50 m') + text('Text', 'Satteldach')
    const einteilig = erfolg(leseDxfUmriss(dxf(ring('WAND', RECHTECK) + t)))
    expect(einteilig.textAngaben.traufhoeheM).toBe(7.5)
    expect(einteilig.textAngaben.dachform).toBe('Satteldach')
    expect(einteilig.teile![0].hoeheM).toBe(7.5)
    expect(einteilig.teile![0].hinweis).toContain('Beschriftung')
    const l = erfolg(leseDxfUmriss(dxf(ring('WAND', L_FORM) + t)))
    expect(l.teile!.every((x) => x.hoeheM === 0 && x.hinweis === 'Höhe ergänzen')).toBe(true)
    expect(l.hinweise.join(' ')).toContain('Höhe je Teil')
  })

  it('nichts erfunden: ohne Text und ohne Eingabe bleibt jede Höhe 0 mit Hinweis', () => {
    const r = erfolg(leseDxfUmriss(dxf(ring('WAND', U_FORM))))
    expect(r.textAngaben.traufhoeheM).toBeUndefined()
    expect(r.teile!.every((t) => t.hoeheM === 0 && t.hinweis === 'Höhe ergänzen')).toBe(true)
  })

  it('mitHoehen: Eingabe setzt die Höhe und entfernt den Hinweis; Ersatzwert nur für leere Teile und mit Hinweis', () => {
    const r = erfolg(leseDxfUmriss(dxf(ring('WAND', U_FORM))))
    const t = mitHoehen(r.teile!, [9.5, undefined, 0], 12)
    const sortiert = r.teile!.map((x) => x.id)
    expect(t.map((x) => x.id)).toEqual(sortiert)
    expect(t[0].hoeheM).toBe(9.5); expect(t[0].hinweis).toBeUndefined()
    expect(t[1].hoeheM).toBe(12); expect(t[1].hinweis).toContain('Höhe ergänzen')
    expect(mitHoehen(r.teile!, [], undefined).every((x) => x.hoeheM === 0)).toBe(true)
  })
})

describe('DXF-Umriss: durch die Kette bis zum Komponenten-Plan', () => {
  const basis: BuildingParams = {
    lengthM: 20, widthM: 14, heightM: 10, eavesHeightM: 10, roofHeightM: 0, roofForm: 'flachdach',
    floors: 3, floorHeightsM: [3.3, 3.3, 3.3], windowCount: 0, doorCount: 0, balconyCount: 0,
    overhangM: 0, setbackM: 0, sides: ['front', 'back', 'left', 'right'], lastklasse: 3,
  }

  for (const [name, form, hoehen, teileAnzahl] of [
    ['Rechteck', RECHTECK, [9.9], 1], ['L-Form', L_FORM, [12.1, 8.8], 2], ['U-Form', U_FORM, [10.7, 7.4, 10.7], 3],
  ] as [string, P[], number[], number][]) {
    it(`${name}: Teile → Abschnitte → CAD-Modell → Komponenten-Plan (Ansicht und Grundriss)`, () => {
      const r = erfolg(leseDxfUmriss(dxf(ring('WAND', form))))
      expect(r.teile).toHaveLength(teileAnzahl)
      const teile = mitHoehen(r.teile!, hoehen)
      const abschnitte = abschnitteAusTeileListe(teile)
      const gesamtL = Math.round(abschnitte.reduce((s, a) => s + a.laengeM, 0) * 100) / 100
      const b: BuildingParams = {
        ...basis, lengthM: gesamtL, widthM: Math.max(...teile.map((t) => t.tiefeM)),
        heightM: Math.max(...abschnitte.map((a) => a.hoeheM)), eavesHeightM: Math.max(...abschnitte.map((a) => a.hoeheM)),
        ...(teile.length >= 2 ? { sections: abschnitte } : {}),
      }
      const model = generateCADModel(b, 'layher-allround')
      expect(model.levels.length).toBeGreaterThan(0)
      expect(model.warnings.filter((w) => w.type === 'error')).toEqual([])
      const zeichnungen = erzeugeZeichnungen(model, 'komponenten')
      expect(zeichnungen).toHaveLength(2)
      for (const z of zeichnungen) expect(z.linien.length).toBeGreaterThan(50)
    })
  }
})
