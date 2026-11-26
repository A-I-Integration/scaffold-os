// ============================================================
// SCAFFOLD OS – Übergabe eines FREIGEGEBENEN Gebäudeimports an die Gerüstplanung (Paket 9)
// Setzt nur Gebäudeparameter; die Gerüstberechnung selbst bleibt unverändert.
// Achsen: x = Ost, z = −Nord, unrotiert → nordrichtungGrad = 0 (Rückseite zeigt nach Norden).
// ============================================================
import type { BuildingParams } from '@/lib/calculations/cad-engine'
import { kantenHoehenNormalisiert, normalisiereUmriss } from '@/lib/calculations/cad-umriss'
import type { GebaeudeImport } from '@/lib/geodaten/typen'

const r2 = (x: number) => Math.round(x * 100) / 100

export function zuBuildingParams(imp: GebaeudeImport, bestehend: BuildingParams): BuildingParams {
  if (imp.status !== 'freigegeben') throw new Error('Nur freigegebene Gebäude können übernommen werden.')
  const first = imp.hoehen.firstM, traufe = imp.hoehen.traufeM
  if (!(first && first > 0) || !imp.dachForm || imp.fussabdruck.length < 3) throw new Error('Pflichtwerte fehlen (Umriss, Höhe, Dachform).')
  const umriss = normalisiereUmriss(imp.fussabdruck)
  const xs = umriss.map((p) => p.x), zs = umriss.map((p) => p.z)
  const flach = imp.dachForm === 'flachdach'
  const t = flach ? first : (traufe && traufe > 0 ? Math.min(traufe, first) : first)
  // Dach und Giebel nur bei geneigtem Dach mit Daten; Giebelkanten auf die Reihenfolge des normalisierten Umrisses übertragen
  const mitDach = !flach && !!imp.oberbau && imp.oberbau.length > 0
  const flags = imp.giebelKanten ? kantenHoehenNormalisiert(imp.fussabdruck, imp.fussabdruck.map((_, i) => (imp.giebelKanten!.includes(i) ? 2 : 1))) : null
  const giebelKanten = flags ? flags.map((f, i) => (f > 1.5 ? i : -1)).filter((i) => i >= 0) : undefined
  return {
    ...bestehend,
    oberbau: mitDach ? imp.oberbau : undefined,
    giebelKanten: mitDach ? giebelKanten : undefined,
    umriss,
    umrissKantenHoeheM: undefined,
    sections: undefined,
    geschossKoerper: undefined,
    lengthM: r2(Math.max(...xs) - Math.min(...xs)),
    widthM: r2(Math.max(...zs) - Math.min(...zs)),
    heightM: r2(first),
    eavesHeightM: r2(t),
    roofHeightM: r2(first - t),
    roofForm: imp.dachForm,
    nordrichtungGrad: 0,
  }
}
