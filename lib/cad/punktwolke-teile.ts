// Einstiegspunkt für den KI-Worker (Punktwolke PLY): liefert die Gebäudeteile als einfaches JSON.
// Der Worker bekommt diese Datei als gebündeltes JavaScript (workers/ki/teile.js, Skript: npm run build:worker-teile).
import { analysierePunkte, type GebaeudeTeil } from '@/lib/cad/modell-analyse'

export interface PunktwolkeTeile { teile: GebaeudeTeil[]; mehrteilig: boolean; gesamtHoeheM: number; tiefeMaxM: number; laengeM: number; hinweise: string[] }

export function teileAusPunkten(px: ArrayLike<number>, py: ArrayLike<number>, pz: ArrayLike<number>): PunktwolkeTeile | null {
  const a = analysierePunkte(px, py, pz)
  if (!a) return null
  return { teile: a.teile, mehrteilig: a.ergebnis.mehrteilig, gesamtHoeheM: a.ergebnis.gesamtHoeheM, tiefeMaxM: a.ergebnis.tiefeMaxM, laengeM: a.ergebnis.laengeM, hinweise: a.hinweise }
}
