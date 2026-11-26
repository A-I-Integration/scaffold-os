// ============================================================
// SCAFFOLD OS – Fassadengrundlage aus dem freigegebenen Umriss (Paket 7)
// Nur Geometrie: je Grundrisskante Länge, Himmelsrichtung der Außennormale und Wandhöhe. LoD2 enthält KEINE Fenster/Türen
// in verlässlicher Form; deshalb gibt es hier keine Öffnungen – die bleiben Handarbeit oder kommen aus Plänen/Fotos.
// ============================================================
import { normalisiereUmriss, umrissKanten } from '@/lib/calculations/cad-umriss'
import type { GebaeudeImport } from '@/lib/geodaten/typen'

export interface FassadenKante { index: number; laengeM: number; richtung: 'Nord' | 'Ost' | 'Süd' | 'West'; wandHoeheM: number }

export function fassadenGrundlage(imp: GebaeudeImport): FassadenKante[] {
  const h = imp.dachForm === 'flachdach' ? imp.hoehen.firstM : (imp.hoehen.traufeM ?? imp.hoehen.firstM)
  if (!h || imp.fussabdruck.length < 3) return []
  return umrissKanten(normalisiereUmriss(imp.fussabdruck)).map((k) => {
    // Außennormale n = (nx, nz); lokal ist Norden = −z, Osten = +x
    const [nx, nz] = k.n
    const richtung = Math.abs(nx) >= Math.abs(nz) ? (nx > 0 ? 'Ost' : 'West') : (nz < 0 ? 'Nord' : 'Süd')
    return { index: k.index, laengeM: Math.round(k.laengeM * 100) / 100, richtung, wandHoeheM: Math.round(h * 100) / 100 }
  })
}
