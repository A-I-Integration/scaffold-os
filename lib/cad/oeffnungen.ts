// ============================================================
// SCAFFOLD OS – Öffnungen (Türen, Fenster) in den Fassaden aus der Punktwolke erkennen – nur als VORSCHLAG
//
// Idee: Jede Fassade ist eine Ebene. Punkte in der Ebene (± 6 cm) bilden die Wand; Stellen ohne Wandpunkte innerhalb der Wandfläche sind
// Öffnungen (Glas wirft oft keine Punkte zurück, Laibungen liegen tiefer). Zusammenhängende leere Zellen mit rechteckiger Form werden
// nach Maßen eingeordnet: Unterkante am Boden und 1,7–3 m hoch = Tür, sonst Fenster.
// Grenzen (bewusst offen genannt):
//  • Nur Rechteck-Gebäude ohne Abschnitte/Umriss; Giebelwände (Dreieck) und Wände mit Anbau davor werden nicht gesondert behandelt.
//  • Verdeckungen (Bäume, Autos, Gerüst, Gelände) und nicht gescannte Bereiche sehen wie Öffnungen aus: Die Person prüft jeden Vorschlag.
//  • Ist weniger als 30 % der Wandfläche mit Punkten belegt, wird die Fassade nicht ausgewertet.
// Koordinaten wie im CAD-Modell: x, Höhe, z (px = x, py = z, pz = Höhe). Position „ab Fassadenmitte“ wie bei CadTuer.offsetAlongM:
// vorne/hinten entlang +x, links/rechts entlang +z.
// ============================================================
import type { CadTuer } from '@/lib/calculations/cad-engine'

export type OeffnungsSeite = CadTuer['side']
export interface Oeffnung {
  seite: OeffnungsSeite
  typ: 'tuer' | 'fenster'
  /** Mitte ab Fassadenmitte (m) */
  mitteM: number
  breiteM: number
  hoeheM: number
  /** Unterkante über Gelände (m) */
  unterkanteM: number
}
export interface WandBefund { seite: OeffnungsSeite; ebeneM: number; abdeckung: number; ausgewertet: boolean }
export interface OeffnungsErgebnis { oeffnungen: Oeffnung[]; waende: WandBefund[]; hinweise: string[] }

export interface OeffnungsGebaeude { lengthM: number; widthM: number; heightM: number; sides: OeffnungsSeite[]; sections?: unknown[]; umriss?: unknown[] }
export interface OeffnungsOptionen { zelleM?: number; ebeneToleranzM?: number; minAbdeckung?: number }

const SEITEN_NAME: Record<OeffnungsSeite, string> = { front: 'vorne', back: 'hinten', left: 'links', right: 'rechts' }
const r05 = (v: number): number => Math.round(v / 0.05) * 0.05
const r2 = (v: number): number => Math.round(v * 100) / 100

export function erkenneOeffnungen(px: ArrayLike<number>, py: ArrayLike<number>, pz: ArrayLike<number>, b: OeffnungsGebaeude, opt: OeffnungsOptionen = {}): OeffnungsErgebnis {
  const zelle = opt.zelleM ?? 0.15, tol = opt.ebeneToleranzM ?? 0.06, minAbd = opt.minAbdeckung ?? 0.3
  const hinweise: string[] = [], oeffnungen: Oeffnung[] = [], waende: WandBefund[] = []
  if ((b.sections && b.sections.length > 0) || (b.umriss && b.umriss.length > 0)) return { oeffnungen, waende, hinweise: ['Öffnungen werden nur für ein einfaches Rechteck-Gebäude erkannt (nicht bei Abschnitten oder Umriss).'] }
  const n = Math.min(px.length, py.length, pz.length)
  if (n < 200) return { oeffnungen, waende, hinweise: ['Zu wenige Punkte für die Erkennung von Öffnungen.'] }
  const L = b.lengthM, W = b.widthM, H = b.heightM
  if (!(L > 0 && W > 0 && H > 0)) return { oeffnungen, waende, hinweise: ['Gebäudemaße fehlen.'] }
  const zc = -W / 2 - 0.5

  for (const seite of b.sides) {
    // Ebene, Richtung nach außen, Länge der Wand und Lage der Koordinaten
    const quer = seite === 'front' || seite === 'back'
    const erwartet = seite === 'front' ? -0.5 : seite === 'back' ? -W - 0.5 : seite === 'left' ? -L / 2 : L / 2
    const laenge = quer ? L : W
    const hole = (i: number): { nn: number; a: number; h: number } => quer ? { nn: py[i], a: px[i], h: pz[i] } : { nn: px[i], a: py[i] - zc, h: pz[i] }
    // Ebene: Spitze der Verteilung der Wand-Koordinate im Band ± 0,8 m (2-cm-Klassen)
    const BAND = 0.8, KL = 0.02, nk = Math.round((2 * BAND) / KL) + 1
    const hist = new Uint32Array(nk)
    let imBand = 0
    for (let i = 0; i < n; i++) {
      const { nn, a, h } = hole(i)
      if (Math.abs(a) > laenge / 2 + 0.3 || h < 0.3 || h > H) continue
      const k = Math.round((nn - erwartet + BAND) / KL)
      if (k >= 0 && k < nk) { hist[k]++; imBand++ }
    }
    if (imBand < 200) { waende.push({ seite, ebeneM: erwartet, abdeckung: 0, ausgewertet: false }); hinweise.push(`Fassade ${SEITEN_NAME[seite]}: zu wenige Punkte an der erwarteten Stelle, nicht ausgewertet (Lage der Punktwolke zum Gebäude prüfen).`); continue }
    let bk = 0, bs = -1
    for (let k = 1; k < nk - 1; k++) { const s = hist[k - 1] + hist[k] * 2 + hist[k + 1]; if (s > bs) { bs = s; bk = k } }
    const ebene = erwartet - BAND + bk * KL

    // Raster Länge × Höhe: Zelle belegt, wenn ein Punkt in der Ebene liegt
    const nx = Math.max(1, Math.round(laenge / zelle)), ny = Math.max(1, Math.round(H / zelle))
    const dx = laenge / nx, dy = H / ny
    const wand = new Uint8Array(nx * ny)
    for (let i = 0; i < n; i++) {
      const { nn, a, h } = hole(i)
      if (Math.abs(nn - ebene) > tol) continue
      const cx = Math.floor((a + laenge / 2) / dx), cy = Math.floor(h / dy)
      if (cx >= 0 && cx < nx && cy >= 0 && cy < ny) wand[cy * nx + cx] = 1
    }
    let belegt = 0
    for (let k = 0; k < wand.length; k++) belegt += wand[k]
    const abdeckung = belegt / wand.length
    if (abdeckung < minAbd) { waende.push({ seite, ebeneM: r2(ebene), abdeckung: r2(abdeckung), ausgewertet: false }); hinweise.push(`Fassade ${SEITEN_NAME[seite]}: nur ${(abdeckung * 100).toFixed(0)} % der Wandfläche mit Punkten belegt, nicht ausgewertet.`); continue }
    waende.push({ seite, ebeneM: r2(ebene), abdeckung: r2(abdeckung), ausgewertet: true })

    // Leere Zellen zu Gruppen zusammenfassen (4er-Nachbarschaft); Randzellen der Wand zählen nicht mit
    const marke = new Int32Array(nx * ny).fill(-1)
    for (let sy = 0; sy < ny; sy++) for (let sx = 0; sx < nx; sx++) {
      const s0 = sy * nx + sx
      if (wand[s0] || marke[s0] >= 0) continue
      const stapel = [s0]; marke[s0] = s0
      let x0 = sx, x1 = sx, y0 = sy, y1 = sy, anz = 0
      while (stapel.length) {
        const c = stapel.pop()!, cx = c % nx, cy = Math.floor(c / nx)
        anz++
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy
        for (const [ex, ey] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (ex < 0 || ey < 0 || ex >= nx || ey >= ny) continue
          const k = ey * nx + ex
          if (!wand[k] && marke[k] < 0) { marke[k] = s0; stapel.push(k) }
        }
      }
      const breite = (x1 - x0 + 1) * dx, hoehe = (y1 - y0 + 1) * dy
      const fuell = anz / ((x1 - x0 + 1) * (y1 - y0 + 1))
      // Wand zu Ende (Rand, Traufe) oder unförmig: keine Öffnung
      if (x0 === 0 || x1 === nx - 1 || y1 === ny - 1) continue
      if (fuell < 0.75 || breite < 0.4 || hoehe < 0.4) continue
      const unten = y0 * dy, mitte = ((x0 + x1 + 1) / 2) * dx - laenge / 2
      if (unten <= 0.3 + 1e-9 && hoehe >= 1.7 && hoehe <= 3.0 && breite >= 0.6 && breite <= 3.0) oeffnungen.push({ seite, typ: 'tuer', mitteM: r05(mitte), breiteM: r05(breite), hoeheM: r05(hoehe), unterkanteM: 0 })
      else if (unten > 0.3 && breite <= 4 && hoehe <= 3) oeffnungen.push({ seite, typ: 'fenster', mitteM: r05(mitte), breiteM: r05(breite), hoeheM: r05(hoehe), unterkanteM: r05(unten) })
    }
  }
  oeffnungen.sort((a, b) => (a.seite === b.seite ? a.mitteM - b.mitteM : a.seite.localeCompare(b.seite)))
  if (oeffnungen.length === 0 && waende.some((w) => w.ausgewertet)) hinweise.push('Keine Öffnungen gefunden. Das ist normal, wenn die Fassade keine Lücken im Scan hat (Glas liefert oft Punkte); es kann auch heißen, dass Fenster nicht erkannt wurden.')
  if (oeffnungen.length > 0) hinweise.push('Vorschläge aus Lücken in der Punktwolke. Auch Verdeckungen (Bäume, Autos) und nicht gescannte Stellen sehen so aus: bitte jede Öffnung prüfen.')
  return { oeffnungen, waende, hinweise }
}

/** Türvorschläge als CadTuer (Aufschlag nach innen, einflügelig) */
export function oeffnungenAlsTueren(o: Oeffnung[]): CadTuer[] {
  return o.filter((x) => x.typ === 'tuer').map((x, i) => ({ id: `scan-${i + 1}`, side: x.seite, offsetAlongM: x.mitteM, widthM: x.breiteM, heightM: x.hoeheM }))
}
