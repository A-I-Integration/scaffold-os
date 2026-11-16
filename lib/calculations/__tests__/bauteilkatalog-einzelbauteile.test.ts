// Bauteilkatalog (Phase 5): Einzelbauteile eines Feldes entstehen aus derselben Erzeugung wie die automatischen Teile –
// gleiche Artikel, Maße und Lage, damit Stückliste und 3D-Modell nicht auseinanderlaufen.
import { describe, it, expect } from 'vitest'
import { generateCADModel, addManualPlacement, FELDBAUTEIL_ARTEN, type BuildingParams, type FeldBauteilArt, type ManualPlacement } from '@/lib/calculations/cad-engine'
import { platzierungAusTreffer, verschiebePlatzierung, platzierungIdVon } from '@/lib/calculations/cad-platzierung'

const basis = (o: Partial<BuildingParams>) => ({ lengthM: 12, widthM: 9, heightM: 8, floors: 2, floorHeightsM: [], windowCount: 0, doorCount: 0, balconyCount: 0, overhangM: 0.3, setbackM: 0, roofForm: 'flachdach', sides: ['front', 'back', 'left', 'right'], geruestOptionen: { treppe: false, tuerenFreihalten: false }, ...o }) as unknown as BuildingParams
const formen: [string, BuildingParams][] = [
  ['Rechteck', basis({})],
  ['Umriss (L-Form)', basis({ umriss: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 6, z: 9 }, { x: 6, z: 12 }, { x: 0, z: 12 }] })],
]
// Welche Teile der automatischen Erzeugung entsprechen der Katalogart (zum Vergleich)
const AUTO: Record<FeldBauteilArt, RegExp> = { f_frame: /^frame-/, f_deck: /^deck-/, f_railing: /^railing-/, f_diagonal: /^diagonal-/, f_ledger: /^rail-/, f_coupling: /^coupling-/, f_foot: /^(foot-|spindel-)/ }

for (const [name, b] of formen) {
  describe(`Einzelbauteile – ${name}`, () => {
    const m = generateCADModel(b, 'layher-allround')
    const felder = m.fields.filter((f) => f.levelIndex === 1 && !f.isCorner)
    const felder0 = m.fields.filter((f) => f.levelIndex === 0 && !f.isCorner)
    const mitte = (l: typeof felder) => l[Math.floor(l.length / 2)]
    for (const art of FELDBAUTEIL_ARTEN) {
      // Diagonalen und Fußplatten gibt es nur in der untersten Lage
      const f0 = art === 'f_diagonal' || art === 'f_foot' ? felder0.find((f) => m.components3D.some((c) => AUTO[art].test(c.id) && c.fieldId === f.id)) ?? mitte(felder0) : mitte(felder)
      it(`${art}: stimmt in Artikel, Maßen und Lage mit dem automatischen Teil überein`, () => {
        const lage = m.levels.find((l) => l.index === f0.levelIndex)!
        const klick: [number, number, number] = [f0.positionX, f0.positionY + lage.heightM / 2, f0.positionZ]
        const pl = platzierungAusTreffer(m, art, klick, '' as ManualPlacement['side'], -1)
        expect(pl.fieldId).toBe(f0.id)
        const m2 = addManualPlacement(JSON.parse(JSON.stringify(m)), { id: 'manual-t', ...pl } as ManualPlacement)
        const neu = m2.components3D.slice(m.components3D.length)
        expect(neu.length, art).toBeGreaterThan(0)
        expect(neu[0].id).toBe('manual-t')
        const auto = m.components3D.filter((c) => AUTO[art].test(c.id) && c.fieldId === f0.id)
        for (const c of neu) {
          const gleich = auto.find((a) => a.articleNumber === c.articleNumber && Math.abs(a.position[0] - c.position[0]) < 1e-6 && Math.abs(a.position[1] - c.position[1]) < 1e-6 && Math.abs(a.position[2] - c.position[2]) < 1e-6 && a.scale.every((s, i) => Math.abs(s - c.scale[i]) < 1e-9))
          expect(gleich, `${art} ${c.id} (${c.articleNumber})`).toBeTruthy()
          expect(c.fieldId).toBe(f0.id)
        }
        // Stückliste: genau diese Teile kommen dazu, kein anderes Bauteil ändert sich
        expect(m2.components3D.length).toBe(m.components3D.length + neu.length)
        expect(new Set(m2.components3D.map((c) => c.id)).size).toBe(m2.components3D.length)
      })
    }
    const f0 = mitte(felder)
    it('f_frame: der Klickpunkt wählt das linke oder rechte Ende des Feldes', () => {
      const lage = m.levels.find((l) => l.index === f0.levelIndex)!
      const links = m.components3D.find((c) => c.id === `frame-${f0.id}-left`)!, rechts = m.components3D.find((c) => c.id === `frame-${f0.id}-right`)!
      // Klick leicht ins Feld hinein (am Rand läge das Nachbarfeld näher)
      const hinein = (p: number[]): [number, number, number] => [p[0] + (f0.positionX - p[0]) * 0.1, p[1], p[2] + (f0.positionZ - p[2]) * 0.1]
      const baue = (nahe0: [number, number, number]) => { const nahe = hinein(nahe0); return baue0(nahe) }
      const baue0 = (nahe: [number, number, number]) => addManualPlacement(JSON.parse(JSON.stringify(m)), { id: 'manual-r', ...platzierungAusTreffer(m, 'f_frame', nahe, f0.side, f0.levelIndex) } as ManualPlacement).components3D.find((c) => c.id === 'manual-r')!
      void lage
      expect(baue(links.position).position).toEqual(links.position)
      expect(baue(rechts.position).position).toEqual(rechts.position)
    })
    it('Ziehen: das Einzelbauteil wechselt auf ein weit entferntes Feld, Teile-IDs der Platzierung bleiben zuordenbar', () => {
      const nach = felder[felder.length - 1]
      const pl = { id: 'manual-d', ...platzierungAusTreffer(m, 'f_railing', [f0.positionX, f0.positionY + 1, f0.positionZ], f0.side, f0.levelIndex) } as ManualPlacement
      const neu = verschiebePlatzierung(m, pl, [nach.positionX, nach.positionY + 1, nach.positionZ], '' as ManualPlacement['side'], -1)
      expect(neu.fieldId).toBe(nach.id)
      expect(platzierungIdVon('manual-d-1', [{ id: 'manual-d' }])).toBe('manual-d')
    })
  })
}
