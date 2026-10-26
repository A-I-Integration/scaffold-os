// Gebäudeteile (Haus, Garage, Anbau …) aus den Punkten einer LiDAR-Datei.
// Gemeinsam genutzt von der Upload-Route und – als Bündel (workers/punktwolke/teile.js) – vom Punktwolken-Worker.
// pts: x,y,z hintereinander in Dateieinheiten; vertAxis: 0|1|2 = welche Achse oben ist; unitScale: Faktor → Meter.
import { teileAusPunkten } from '@/lib/cad/punktwolke-teile'

export interface LidarTeil {
  id: string
  typ: string
  laengeM: number
  tiefeM: number
  traufhoeheM: number
  dachForm: 'flachdach' | 'satteldach' | 'walmdach'
  dachHoeheM: number
  versatzM: number
}

export interface LidarTeile { teile: LidarTeil[]; mehrteilig: boolean; hinweise: string[] }

const r2 = (n: number) => Math.round(n * 100) / 100

export function teileAusLidarPunkten(pts: ArrayLike<number>, vertAxis: number, unitScale: number): LidarTeile | null {
  const n = Math.floor(pts.length / 3)
  if (n < 50 || ![0, 1, 2].includes(vertAxis)) return null
  // „Oben“ muss in der dritten Reihe stehen; die Reihenfolge der beiden anderen ändert nur die Seite, nicht die Maße
  const andere = [0, 1, 2].filter((a) => a !== vertAxis)
  const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    a[i] = pts[i * 3 + andere[0]] * unitScale
    b[i] = pts[i * 3 + andere[1]] * unitScale
    c[i] = pts[i * 3 + vertAxis] * unitScale
  }
  let t
  try { t = teileAusPunkten(a, b, c) } catch { return null }
  if (!t || t.teile.length === 0) return null
  return {
    mehrteilig: t.mehrteilig,
    hinweise: t.hinweise,
    teile: t.teile.map((x) => ({
      id: x.id, typ: x.typ,
      laengeM: r2(x.laengeM), tiefeM: r2(x.tiefeM), traufhoeheM: r2(x.hoeheM),
      dachForm: x.dachForm, dachHoeheM: r2(x.dachHoeheM), versatzM: r2(x.versatzM),
    })),
  }
}
