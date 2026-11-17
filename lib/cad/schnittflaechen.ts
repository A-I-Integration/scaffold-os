// ============================================================
// SCAFFOLD OS – Gebäudekörper aus den Schnittflächen eines Grundrisses (Mauerwerk als gefüllte Fläche).
//
// Pläne wie der Kirchturm-Grundriss zeichnen das Mauerwerk nicht als dünne Wandstücke, sondern als wenige große graue
// Flächen. Hier werden diese Flächen gesucht, zu Gruppen zusammengefasst (Öffnungen wie Türen trennen nicht) und die
// größte Gruppe als Gebäudekörper vorgeschlagen. Ergebnis: Hüllmaße, Fläche, Herkunft – ein VORSCHLAG zum Bestätigen.
// Die Hülle ist das umschließende Rechteck; Vorsprünge und Rücksprünge sind darin enthalten (siehe `fuellgrad`).
// Rein rechnerisch, ohne KI.
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'
import type { Massangabe } from './masse-lesen'

const METER_JE_PUNKT_PAPIER = 0.0254 / 72

export interface KoerperVorschlag {
  /** Füllfarbe der Schnittflächen im Plan */
  fill: string
  /** Hüllmaße in Metern: Breite (x im Plan), Tiefe (y im Plan) */
  breiteM: number
  tiefeM: number
  /** Summe der Flächen der Gruppe in m² (Mauerwerk selbst, ohne Hohlräume) */
  mauerflaecheM2: number
  /** Anteil der Mauerfläche an der Hülle (0–1): niedrig = viel Hohlraum oder Rücksprünge */
  fuellgrad: number
  anzahlFlaechen: number
  /** Hülle in Seiten-Punkten [x0, y0, x1, y1] */
  huelle: [number, number, number, number]
  /** Maßketten, deren bestätigtes Maß zu Breite oder Tiefe der Hülle passt (±3 %) */
  passendeMasse: { text: string; linieM: number; passtZu: 'breite' | 'tiefe' }[]
  hinweise: string[]
}

const rgb = (c: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(c)
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null
}
const istGrau = (c: string) => { const v = rgb(c); return !!v && Math.max(...v) - Math.min(...v) < 20 && v[0] > 40 && v[0] < 215 }
const istWeiss = (c: string) => { const v = rgb(c); return !v || Math.min(...v) > 245 }

interface Stueck { fill: string; bbox: [number, number, number, number]; flaechePt2: number }

function ringFlaeche(r: number[][]): number {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1])
  return Math.abs(a / 2)
}

/** Gebäudekörper aus Schnittflächen: größte Gruppe grauer Flächen (Abstand bis `luckeM`, Standard 2 m). */
export function koerperAusSchnittflaechen(fl: VektorFlaeche[], massstab: number, masse: Massangabe[] = [], luckeM = 2): KoerperVorschlag | null {
  if (!(massstab > 0)) return null
  const mpp = massstab * METER_JE_PUNKT_PAPIER
  const stuecke: Stueck[] = []
  for (const f of fl) {
    if (f.linie || istWeiss(f.fill)) continue
    for (const ring of f.ringe) {
      if (ring.length < 3) continue
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
      const bbox: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      const a = ringFlaeche(ring) * mpp * mpp
      if (a < 1) continue // unter 1 m²: Symbole, Pfeile, Fenstermarken
      stuecke.push({ fill: f.fill, bbox, flaechePt2: ringFlaeche(ring) })
    }
  }
  // Farbe mit der größten Gesamtfläche, bevorzugt Grau (Mauerwerk im Schnitt)
  const summe = new Map<string, number>()
  for (const s of stuecke) summe.set(s.fill, (summe.get(s.fill) ?? 0) + s.flaechePt2)
  const farben = [...summe.entries()].sort((a, b) => b[1] - a[1])
  const wahl = farben.find(([c]) => istGrau(c)) ?? farben[0]
  if (!wahl) return null
  const dieseFarbe = stuecke.filter((s) => s.fill === wahl[0])
  // Gruppen: Stücke, deren Hüllen näher als luckeM beieinander liegen
  const luecke = luckeM / mpp
  const nah = (a: Stueck, b: Stueck) => !(a.bbox[0] - luecke > b.bbox[2] || b.bbox[0] - luecke > a.bbox[2] || a.bbox[1] - luecke > b.bbox[3] || b.bbox[1] - luecke > a.bbox[3])
  const gruppe = new Array<number>(dieseFarbe.length).fill(-1)
  let n = 0
  for (let i = 0; i < dieseFarbe.length; i++) {
    if (gruppe[i] >= 0) continue
    gruppe[i] = n
    const stapel = [i]
    while (stapel.length) { const k = stapel.pop()!; for (let j = 0; j < dieseFarbe.length; j++) if (gruppe[j] < 0 && nah(dieseFarbe[k], dieseFarbe[j])) { gruppe[j] = n; stapel.push(j) } }
    n++
  }
  let besteGruppe = -1, besteFlaeche = 0
  for (let g = 0; g < n; g++) { const a = dieseFarbe.filter((_, i) => gruppe[i] === g).reduce((s, x) => s + x.flaechePt2, 0); if (a > besteFlaeche) { besteFlaeche = a; besteGruppe = g } }
  const inGruppe = dieseFarbe.filter((_, i) => gruppe[i] === besteGruppe)
  if (!inGruppe.length) return null
  // Kleine Anhängsel (Wandstummel, Pfeiler < 25 % des größten Stücks) bestimmen die Hülle nicht
  const groesstes = Math.max(...inGruppe.map((t) => t.flaechePt2))
  const teile = inGruppe.filter((t) => t.flaechePt2 >= 0.25 * groesstes)
  const huelle: [number, number, number, number] = [Math.min(...teile.map((t) => t.bbox[0])), Math.min(...teile.map((t) => t.bbox[1])), Math.max(...teile.map((t) => t.bbox[2])), Math.max(...teile.map((t) => t.bbox[3]))]
  const breiteM = Math.round((huelle[2] - huelle[0]) * mpp * 100) / 100
  const tiefeM = Math.round((huelle[3] - huelle[1]) * mpp * 100) / 100
  const mauer = Math.round(teile.reduce((q, t) => q + t.flaechePt2, 0) * mpp * mpp * 10) / 10
  const passende: KoerperVorschlag['passendeMasse'] = []
  for (const m of masse) {
    if (m.status !== 'bestaetigt' || m.linieM === undefined) continue
    if (Math.abs(m.linieM - breiteM) <= 0.03 * breiteM) passende.push({ text: m.text, linieM: m.linieM, passtZu: 'breite' })
    else if (Math.abs(m.linieM - tiefeM) <= 0.03 * tiefeM) passende.push({ text: m.text, linieM: m.linieM, passtZu: 'tiefe' })
  }
  const hinweise: string[] = []
  const fuellgrad = Math.round((mauer / Math.max(0.01, breiteM * tiefeM)) * 100) / 100
  if (inGruppe.length > teile.length) hinweise.push(`${inGruppe.length - teile.length} kleine Fläche(n) neben dem Körper (unter 25 % des größten Stücks) sind nicht in der Hülle.`)
  if (n > 1) hinweise.push(`${n - 1} weitere Gruppe(n) gleicher Farbe liegen abseits (Anbauten, Nachbargebäude) und sind nicht im Körper.`)
  if (!passende.length) hinweise.push('Keine bestätigte Maßkette passt zu Breite oder Tiefe der Hülle: Maße bitte im Plan nachprüfen.')
  if (fuellgrad < 0.6) hinweise.push(`Die Hülle ist nur zu ${Math.round(fuellgrad * 100)} % Mauerwerk: Hohlräume oder Rücksprünge, die Hülle ist größer als der tragende Körper.`)
  return { fill: wahl[0], breiteM, tiefeM, mauerflaecheM2: mauer, fuellgrad, anzahlFlaechen: teile.length, huelle, passendeMasse: passende, hinweise }
}
