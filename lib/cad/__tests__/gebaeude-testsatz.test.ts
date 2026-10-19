import { describe, it, expect } from 'vitest'
import { TESTSATZ, alsObj, transformiere, type SollTeil, type Testgebaeude, type Tri } from './fixtures/gebaeude-testsatz'
import { dreieckeAusObj } from '@/lib/cad/modell-import'
import { analysiereDreiecke, abschnitteAusTeilen, analysierePunkte, type ModellAnalyse } from '@/lib/cad/modell-analyse'
import { generateCADModel } from '@/lib/calculations/cad-engine'

const TOL = 0.05
const nah = (ist: number, soll: number) => Math.abs(ist - soll) <= Math.max(0.3, TOL * soll)

/** Prüft Teile gegen Soll, wahlweise in umgekehrter Reihenfolge (Drehung um 180°). Gibt Abweichungen zurück. */
function abweichungen(a: ModellAnalyse, soll: SollTeil[]): string[] {
  const pruefe = (teile: ModellAnalyse['teile']) => {
    const f: string[] = []
    if (teile.length !== soll.length) return [`Teile: ${teile.length} statt ${soll.length}`]
    teile.forEach((t, i) => {
      const s = soll[i]
      if (!nah(t.laengeM, s.laengeM)) f.push(`Teil ${i + 1} Länge ${t.laengeM} statt ${s.laengeM}`)
      if (!nah(t.tiefeM, s.tiefeM)) f.push(`Teil ${i + 1} Tiefe ${t.tiefeM} statt ${s.tiefeM}`)
      if (!nah(t.hoeheM, s.hoeheM)) f.push(`Teil ${i + 1} Höhe ${t.hoeheM} statt ${s.hoeheM}`)
      if (!nah(t.dachHoeheM, s.dachHoeheM)) f.push(`Teil ${i + 1} Dachhöhe ${t.dachHoeheM} statt ${s.dachHoeheM}`)
      if (t.dachForm !== s.dachForm) f.push(`Teil ${i + 1} Dachform ${t.dachForm} statt ${s.dachForm}`)
      if (Math.abs(Math.abs(t.versatzM) - s.versatzBetragM) > 0.6) f.push(`Teil ${i + 1} Versatz ${t.versatzM} statt ±${s.versatzBetragM}`)
    })
    return f
  }
  const vor = pruefe(a.teile)
  if (vor.length === 0) return []
  const rueck = pruefe([...a.teile].reverse())
  return rueck.length < vor.length ? rueck : vor
}

const analyse = (g: Testgebaeude, t: Parameters<typeof transformiere>[1], oben: 'y' | 'z' = 'y') =>
  analysiereDreiecke(dreieckeAusObj(alsObj(transformiere(g.dreiecke, t), oben)), { format: 'obj', oben })

describe('Testsatz: Teile werden mit den bekannten Maßen erkannt', () => {
  for (const g of TESTSATZ) {
    it(`${g.name}`, () => {
      const a = analyse(g, {})
      expect(a).not.toBeNull()
      expect(abweichungen(a!, g.soll)).toEqual([])
    })
  }
})

describe('Drehung, Skalierung und Verschiebung ändern das Ergebnis nicht', () => {
  const varianten = [
    { name: 'gedreht 37°', t: { drehungGrad: 37 } },
    { name: 'gedreht 143° und verschoben', t: { drehungGrad: 143, verschiebung: [5000, 3000, 250] as [number, number, number] } },
    { name: 'in Zentimetern (×100)', t: { skala: 100 } },
    { name: 'in Zentimetern, gedreht 61° und verschoben', t: { skala: 100, drehungGrad: 61, verschiebung: [80000, -20000, 300] as [number, number, number] } },
  ]
  for (const g of TESTSATZ) for (const v of varianten) {
    it(`${g.name}: ${v.name}`, () => {
      const a = analyse(g, v.t)
      expect(a).not.toBeNull()
      expect(abweichungen(a!, g.soll)).toEqual([])
    })
  }
  it('Einheit wird bei Zentimeter-Modell automatisch erkannt', () => {
    const a = analyse(TESTSATZ[0], { skala: 100 })
    expect(a!.einheit).toBe('cm')
    expect(a!.einheitGeschaetzt).toBe(true)
  })
})

describe('Rauschfilter', () => {
  it('Bodenplatte und schwebende Ausreißer verfälschen das Ergebnis nicht', () => {
    const g = TESTSATZ[3]
    const boden: Tri[] = [[[-40, -40, 0], [90, -40, 0], [90, 60, 0]], [[-40, -40, 0], [90, 60, 0], [-40, 60, 0]]]
    const schwebt: Tri[] = [[[500, 500, 40], [501, 500, 40], [500, 501, 41]]]
    const a = analyse({ ...g, dreiecke: [...g.dreiecke, ...boden, ...schwebt] }, {})
    expect(a).not.toBeNull()
    expect(abweichungen(a!, g.soll)).toEqual([])
    expect(a!.hinweise.join(' ')).toContain('Bodenplatte')
  })
})

describe('Jedes Teil bekommt sein Gerüst', () => {
  for (const g of TESTSATZ) {
    it(`${g.name}: an jedem Teil stehen Gerüstfelder bis zur Traufe`, () => {
      const a = analyse(g, {})!
      const abschnitte = abschnitteAusTeilen(a, false)
      expect(abschnitte.every((s) => s.geruest !== false)).toBe(true)
      const b = {
        lengthM: abschnitte.reduce((s, x) => s + x.laengeM, 0), widthM: a.ergebnis.tiefeMaxM, heightM: a.ergebnis.gesamtHoeheM,
        eavesHeightM: a.ergebnis.gesamtHoeheM, roofHeightM: 0, roofForm: 'flachdach' as const, floors: 6, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0,
        overhangM: 0, setbackM: 0, sides: ['front' as const, 'back' as const, 'left' as const, 'right' as const], sections: abschnitte,
      }
      const m = generateCADModel(b, 'layher-allround')
      for (const t of a.teile) {
        const x0 = t.startM, x1 = t.startM + t.laengeM
        const felder = m.fields.filter((f) => f.positionX >= x0 && f.positionX <= x1)
        expect(felder.length, `${t.id} (${t.typ}) hat keine Felder`).toBeGreaterThan(0)
        expect(Math.max(...felder.map((f) => f.positionY + 2)), `${t.id} reicht nicht bis zur Traufe`).toBeGreaterThanOrEqual(t.hoeheM - 4)
      }
    })
  }
  it('Typen: Kirche hat Turm und Schiff, Halle hat Hauptbau und Anbau', () => {
    expect(analyse(TESTSATZ[0], {})!.teile.map((t) => t.typ).sort()).toEqual(['anbau', 'schiff', 'turm'])
    expect(analyse(TESTSATZ[4], {})!.teile.map((t) => t.typ).sort()).toEqual(['anbau', 'schiff'])
  })
})

describe('Punktwolke (PLY) liefert dieselben Teile wie das Netz', () => {
  it('Kirche mit Turm als Punkte', () => {
    const g = TESTSATZ[0]
    const px: number[] = [], py: number[] = [], pz: number[] = []
    // Punkte dicht auf den Dreiecken (Raster 0,15 m)
    for (const [a, b, c] of g.dreiecke) {
      const kante = Math.max(...[[a, b], [b, c], [c, a]].map(([p, r]) => Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2])))
      const n = Math.max(2, Math.ceil(kante / 0.2)) // etwa alle 20 cm ein Punkt
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v
        px.push(a[0] * u + b[0] * v + c[0] * w); py.push(a[1] * u + b[1] * v + c[1] * w); pz.push(a[2] * u + b[2] * v + c[2] * w)
      }
    }
    const a = analysierePunkte(px, py, pz)
    expect(a).not.toBeNull()
    expect(a!.teile[0].quelle).toBe('ply')
    expect(abweichungen(a!, g.soll)).toEqual([])
  })
})

describe('Worker-Bündel (workers/ki/teile.js) ist aktuell und liefert die Teile', () => {
  it('gleiches Ergebnis wie die TypeScript-Version', async () => {
    const { createRequire } = await import('node:module')
    const bundle = createRequire(import.meta.url)('../../../workers/ki/teile.js')
    const g = TESTSATZ[0]
    const px: number[] = [], py: number[] = [], pz: number[] = []
    for (const [a, b, c] of g.dreiecke) {
      const kante = Math.max(...[[a, b], [b, c], [c, a]].map(([p, r]) => Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2])))
      const n = Math.max(2, Math.ceil(kante / 0.2))
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const u = i / n, v = j / n, w = 1 - u - v; px.push(a[0] * u + b[0] * v + c[0] * w); py.push(a[1] * u + b[1] * v + c[1] * w); pz.push(a[2] * u + b[2] * v + c[2] * w) }
    }
    const ts = analysierePunkte(px, py, pz)!
    const js = bundle.teileAusPunkten(px, py, pz)
    expect(js.mehrteilig).toBe(true)
    expect(JSON.stringify(js.teile)).toBe(JSON.stringify(ts.teile))
  })
})
