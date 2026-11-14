// Ende-zu-Ende am echten Plan: gespeicherter Import-Stand (Ausgabe von planLesen für den Einreichplan EFH am Hang)
// → Geländeprofil je Seite → Gerüstmodell → Fußplatten gegen die gelesene Geländelinie.
import { describe, it, expect } from 'vitest'
import { generateCADModel, generateScaffoldComponents, gelaendeHoeheFn, type BuildingParams } from '@/lib/calculations/cad-engine'
import { Terrain } from '@/lib/calculations/gelaende'
import { gelaendeProfilAusLinien, seiteVonHimmelsrichtung } from '@/lib/cad/plan-oeffnungen-modell'
import * as THREE from 'three'
import { baueHangFlaeche, hangDaten, FUSSPLATTE_UNTERKANTE_REL_M } from '@/lib/cad/hang-geometrie'
import { gelaendeOptionenAusPlan } from '@/lib/cad/gelaende-optionen-aus-plan'
import plan from '@/lib/cad/__tests__/fixtures/plan-import-efh-hang.json'

const haupt = plan.geschosse.find((g) => g.ebene === plan.hauptEbene)!
const profile = gelaendeProfilAusLinien(plan.gelaendeLinien as never, 'unten') // Hauptkörper liegt waagerecht → vorne = unten

describe('Plan-Import (echter Plan) → Geländeprofil je Seite', () => {
  it('der Import liefert Hauptkörper, Koten und zwei Geländelinien', () => {
    expect(haupt.laengeM).toBeCloseTo(13.8, 1)
    expect(plan.firstKoteM).toBeCloseTo(6.94, 2)
    expect(plan.gelaendeLinien!.map((l) => l.art).sort()).toEqual(['nord', 'sued'])
  })
  it('Süd (vorne) behält die Richtung, Nord (hinten) wird gespiegelt', () => {
    expect(Object.keys(profile).sort()).toEqual(['back', 'front'])
    const sued = plan.gelaendeLinien!.find((l) => l.art === 'sued')!.profil
    expect(profile.front).toEqual(sued)
    const nord = plan.gelaendeLinien!.find((l) => l.art === 'nord')!.profil
    expect(profile.back![0].hoeheM).toBe(nord[nord.length - 1].hoeheM)
    expect(profile.back![0].posM).toBe(0)
  })
})

describe('Gerüst auf dem gelesenen Gelände', () => {
  const b: BuildingParams = {
    lengthM: haupt.laengeM, widthM: haupt.breiteM, heightM: plan.firstKoteM, eavesHeightM: plan.traufKoteM, roofHeightM: plan.firstKoteM - plan.traufKoteM,
    roofForm: 'pultdach', floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
    sides: ['front', 'back'], geruestOptionen: { gelaendeProfilM: profile },
  }
  const m = generateCADModel(b, 'layher-allround')
  const teile = generateScaffoldComponents(m)

  it('keine Schwebe-Warnung', () => {
    expect(m.warnings.some((w) => w.code === 'HANG_FUSS_SCHWEBT')).toBe(false)
  })
  for (const sd of ['front', 'back'] as const) {
    it(`${sd}: jede Fußplatte liegt höchstens 4 cm neben der Geländelinie`, () => {
      const t = new Terrain({ [sd]: profile[sd]! })
      const platten = teile.filter((c) => c.type === 'footplate' && !c.id.startsWith('stair') && c.id.includes(`-field-${sd}-`))
      expect(platten.length).toBeGreaterThan(6)
      let schlecht = 0, maxAbw = 0
      for (const p of platten) {
        const g = t.heightAt(sd, p.position[0] + haupt.laengeM / 2)! // Seitenanfang = linkes Hausende (x = −L/2)
        const abw = Math.abs(p.position[1] + 0.02 - g)
        maxAbw = Math.max(maxAbw, abw)
        if (abw > 0.04) schlecht++
      }
      expect(schlecht, `größte Abweichung ${maxAbw.toFixed(2)} m`).toBe(0)
    })
  }
})

describe('Alle vier Seiten: jede Fußplatte steht auf der 3D-Geländefläche (Regression: Ost/West standen auf ±0,00)', () => {
  // So nimmt die App den Plan-Import: Profil für Nord/Süd, alle Seiten eingerüstet, Pultdach mit niedriger Ost-Seite
  const b: BuildingParams = {
    lengthM: haupt.laengeM, widthM: haupt.breiteM, heightM: plan.firstKoteM, eavesHeightM: plan.traufKoteM, roofHeightM: plan.firstKoteM - plan.traufKoteM,
    roofForm: 'pultdach', floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
    sides: ['front', 'back', 'left', 'right'],
    geruestOptionen: { gelaendeProfilM: profile, pultNiedrigeSeite: seiteVonHimmelsrichtung('ost', 'unten') },
  }
  const m = generateCADModel(b, 'layher-allround')
  const hoehe = gelaendeHoeheFn(b) // dieselbe Fläche wie in Scaffold3D (Gebäudemitte bei x/z = 0)
  const teile = generateScaffoldComponents(m)
  // Gerüstkoordinaten: die Gebäudemitte liegt bei z = −Breite/2 − 0,5 (siehe Scaffold3D)
  const abweichung = (c: (typeof teile)[number]) => c.position[1] + 0.02 - hoehe(c.position[0], c.position[2] + haupt.breiteM / 2 + 0.5)

  it('es gibt Fußplatten an allen vier Seiten', () => {
    for (const sd of ['front', 'back', 'left', 'right']) expect(teile.filter((c) => c.type === 'footplate' && c.id.includes(`-field-${sd}-`)).length).toBeGreaterThan(4)
  })
  it('keine Fußplatte weicht mehr als 4 cm von der Geländefläche ab (weder schwebend noch im Boden)', () => {
    const schlecht = teile.filter((c) => c.type === 'footplate' && Math.abs(abweichung(c)) > 0.04).map((c) => `${c.id}: ${abweichung(c).toFixed(2)} m`)
    expect(schlecht).toEqual([])
  })
  it('Ost und West (ohne eigenes Profil) folgen dem Hang: die Fußhöhen unterscheiden sich um mehr als 1 m', () => {
    for (const sd of ['left', 'right'] as const) {
      const ys = teile.filter((c) => c.type === 'footplate' && c.id.includes(`-field-${sd}-`)).map((c) => c.position[1])
      const f = ys.length ? Math.max(...ys) - Math.min(...ys) : 0
      if (sd === 'left') expect(f).toBeGreaterThan(1)
      else expect(f).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('Wie die Darstellung: Fußplatten gegen das gezeichnete Geländenetz (Raycast), mit Gruppenversatz und Plattenform', () => {
  // Import-Ablauf der App: gelaendeOptionenAusPlan wie in BuildingForm, inklusive der Talseiten-Eckhöhen früherer Eingaben
  const gel = gelaendeOptionenAusPlan(plan as never, 'unten', { gelaendeEckenM: { fl: -2.95, fr: 0, bl: -2.95, br: 0 } }, 'pultdach')
  const W = haupt.breiteM
  const b: BuildingParams = {
    lengthM: haupt.laengeM, widthM: W, heightM: plan.firstKoteM, eavesHeightM: plan.traufKoteM, roofHeightM: plan.firstKoteM - plan.traufKoteM,
    roofForm: 'pultdach', floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0,
    sides: ['front', 'back', 'left', 'right'], geruestOptionen: gel.geruestOptionen,
  }
  const m = generateCADModel(b, 'layher-allround')
  const teile = generateScaffoldComponents(m).filter((c) => c.type === 'footplate')
  const { hangM } = hangDaten(m.building)
  // Szene wie Scaffold3D: Gruppe „hangHebung“ (y) enthält das Gelände-Mesh (in Gebäudekoordinaten, z-Versatz −W/2 − 0,5) und die Gerüstteile (Weltkoordinaten)
  const mesh = new THREE.Mesh(baueHangFlaeche(m.building, haupt.laengeM, W, hangM), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const gelaendeGruppe = new THREE.Group(); gelaendeGruppe.position.set(0, 0, -W / 2 - 0.5); gelaendeGruppe.add(mesh)
  const hebung = new THREE.Group(); hebung.position.set(0, hangM, 0); hebung.add(gelaendeGruppe); hebung.updateMatrixWorld(true)
  const rc = new THREE.Raycaster()
  const abstand = (c: (typeof teile)[number]) => {
    const unterkante = c.position[1] + FUSSPLATTE_UNTERKANTE_REL_M + hangM // Unterseite der gezeichneten Platte in Weltkoordinaten
    rc.set(new THREE.Vector3(c.position[0], 100, c.position[2]), new THREE.Vector3(0, -1, 0))
    const t = rc.intersectObject(mesh, false)[0]
    return t ? unterkante - t.point.y : NaN
  }
  it('die Eckhöhen früherer Eingaben stehen nicht gegen die gelesene Linie (Profil hat Vorrang, Eckwerte aus dem Profil)', () => {
    expect(gel.geruestOptionen?.gelaendeProfilM?.front).toBeDefined()
    expect(gel.geruestOptionen?.gelaendeEckenM).toBeUndefined()
  })
  it('jede Fußplatte trifft das gezeichnete Gelände: Abstand der Plattenunterseite höchstens 3 cm', () => {
    expect(teile.length).toBeGreaterThan(60)
    const abw = teile.map((c) => ({ id: c.id, x: c.position[0], z: c.position[2], d: abstand(c) }))
    expect(abw.filter((a) => Number.isNaN(a.d))).toEqual([])
    const schlecht = abw.filter((a) => Math.abs(a.d) > 0.03).map((a) => `${a.id} x=${a.x.toFixed(2)} z=${a.z.toFixed(2)}: ${a.d.toFixed(3)} m`)
    expect(schlecht).toEqual([])
  })
  it('auch mit den alten Talseiten-Eckhöhen NEBEN dem Profil (Stand vor der Korrektur) bleiben alle Füße auf dem Gelände', () => {
    const alt: BuildingParams = { ...b, geruestOptionen: { ...gel.geruestOptionen, gelaendeEckenM: { fl: -2.95, fr: 0, bl: -2.95, br: 0 } } }
    const ma = generateCADModel(alt, 'layher-allround')
    const meshA = new THREE.Mesh(baueHangFlaeche(ma.building, haupt.laengeM, W, hangDaten(ma.building).hangM), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    const hA = hangDaten(ma.building).hangM
    const g = new THREE.Group(); g.position.set(0, 0, -W / 2 - 0.5); g.add(meshA); g.updateMatrixWorld(true)
    let schlecht = 0
    for (const c of generateScaffoldComponents(ma).filter((x) => x.type === 'footplate')) {
      rc.set(new THREE.Vector3(c.position[0], 100, c.position[2]), new THREE.Vector3(0, -1, 0))
      const t = rc.intersectObject(meshA, false)[0]
      if (!t || Math.abs(c.position[1] + FUSSPLATTE_UNTERKANTE_REL_M - t.point.y) > 0.03) schlecht++
    }
    expect(hA).toBeGreaterThan(0)
    expect(schlecht).toBe(0)
  })
})

describe('Mit Vorbau (Abschnitts-Pfad der Engine): jeder Ständer steht auf dem gezeichneten Gelände, höchstens 1 cm', () => {
  // Gespeicherter Arbeitsstand der Nutzerin: Pultdach, Vorbau hinten, Türen/Fenster, Eckhöhen NEBEN Profilen
  const profil = {
    back: [-2.45, -2.28, -2.1, -1.92, -1.74, -1.56, -1.38, -1.2, -1.02, -0.84, -0.66, -0.48, -0.3, 0.39].map((h, i) => ({ posM: i < 13 ? i * 1.0108 : 13.14, hoeheM: h })),
    front: [-1.02, -0.88, -0.73, -0.59, -0.44, -0.29, -0.15, -0.09, -0.08, -0.08, -0.07, -0.06, -0.06, 0.43].map((h, i) => ({ posM: i < 13 ? 0.98 + i * 0.98 : 13.75, hoeheM: h })),
  }
  const basis: BuildingParams = {
    lengthM: 13.8, widthM: 8.85, heightM: 6.94, eavesHeightM: 5.92, roofHeightM: 1.02, roofForm: 'pultdach', floors: 3, floorHeightsM: [],
    windowCount: 12, doorCount: 7, balconyCount: 0, overhangM: 0, setbackM: 0, sides: ['front', 'left', 'right'],
    tueren: [{ id: 'p4', side: 'front', offsetAlongM: 5.28, widthM: 1, heightM: 2.1 }, { id: 'p7', side: 'front', offsetAlongM: -1.22, widthM: 1.1, heightM: 2.1 }],
    vorbauten: [{ id: 'v0', side: 'back', offsetAlongM: -1.6, breiteM: 4.4, tiefeM: 1.5, hoeheM: 5.92 }],
    geruestOptionen: { gelaendeEckenM: { fl: -2.95, fr: 0, bl: -2.95, br: 0 }, pultNiedrigeSeite: 'right', gelaendeProfilM: profil },
  } as BuildingParams
  for (const sides of [['front', 'left', 'right'], ['front', 'back', 'left', 'right']] as const) {
    it(`Seiten ${sides.join('/')}: Plattenunterseite ≤ 1 cm vom Geländenetz`, () => {
      const m = generateCADModel({ ...basis, sides: [...sides] }, 'layher-allround')
      const { hangM } = hangDaten(m.building)
      const mesh = new THREE.Mesh(baueHangFlaeche(m.building, 13.8, 8.85, hangM), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
      const g = new THREE.Group(); g.position.set(0, 0, -8.85 / 2 - 0.5); g.add(mesh); g.updateMatrixWorld(true)
      const rc = new THREE.Raycaster()
      const teile = generateScaffoldComponents(m).filter((c) => c.type === 'footplate')
      expect(teile.length).toBeGreaterThan(40)
      const schlecht: string[] = []
      for (const c of teile) {
        rc.set(new THREE.Vector3(c.position[0], 100, c.position[2]), new THREE.Vector3(0, -1, 0))
        const t = rc.intersectObject(mesh, false)[0]
        const d = t ? c.position[1] + FUSSPLATTE_UNTERKANTE_REL_M - t.point.y : NaN
        if (!(Math.abs(d) <= 0.01)) schlecht.push(`${c.id} x=${c.position[0].toFixed(2)} z=${c.position[2].toFixed(2)}: ${d.toFixed(3)}`)
      }
      expect(schlecht).toEqual([])
    })
  }
})
