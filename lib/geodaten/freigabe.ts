// ============================================================
// SCAFFOLD OS – Prüfen, Korrigieren, Freigeben importierter Gebäude (Paket 8)
// Jede Änderung wird protokolliert. Freigabe nur, wenn die Pflichtwerte vorhanden und plausibel sind.
// ============================================================
import { pruefeUmriss } from '@/lib/calculations/cad-umriss'
import type { GebaeudeImport } from '@/lib/geodaten/typen'

export type Korrigierbar = 'traufeM' | 'firstM' | 'dachForm'

export function korrigiere(imp: GebaeudeImport, feld: Korrigierbar, neu: number | GebaeudeImport['dachForm'], am = new Date().toISOString()): GebaeudeImport {
  if (imp.status === 'freigegeben') throw new Error('Freigegebene Gebäude sind gesperrt; zuerst die Freigabe zurücknehmen.')
  const alt = feld === 'dachForm' ? imp.dachForm : imp.hoehen[feld]
  if (feld !== 'dachForm' && !(typeof neu === 'number' && Number.isFinite(neu) && neu > 0 && neu < 200)) throw new Error('Höhe muss zwischen 0 und 200 m liegen.')
  const kopie: GebaeudeImport = {
    ...imp,
    hoehen: { ...imp.hoehen },
    status: 'vorschlag',
    korrekturen: [...imp.korrekturen, { feld, alt: alt == null ? null : String(alt), neu: String(neu), am }],
  }
  if (feld === 'dachForm') kopie.dachForm = neu as GebaeudeImport['dachForm']
  else kopie.hoehen[feld] = neu as number
  return kopie
}

export function pruefeFreigabe(imp: GebaeudeImport): string[] {
  const p: string[] = []
  if (imp.fussabdruck.length < 3) p.push('Grundfläche fehlt.')
  else p.push(...pruefeUmriss(imp.fussabdruck))
  const { traufeM, firstM } = imp.hoehen
  if (!(firstM && firstM > 0)) p.push('Gebäudehöhe (First) fehlt.')
  if (traufeM != null && firstM != null && traufeM > firstM + 0.01) p.push('Traufe liegt über dem First.')
  if (!imp.dachForm) p.push('Dachform fehlt.')
  return p
}

export function gibFrei(imp: GebaeudeImport): GebaeudeImport {
  const p = pruefeFreigabe(imp)
  if (p.length) throw new Error(`Freigabe nicht möglich: ${p.join(' ')}`)
  return { ...imp, status: 'freigegeben' }
}

export const nimmFreigabeZurueck = (imp: GebaeudeImport): GebaeudeImport => ({ ...imp, status: 'geprueft' })
export const verwerfe = (imp: GebaeudeImport): GebaeudeImport => ({ ...imp, status: 'verworfen' })
