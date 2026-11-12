// ============================================================
// SCAFFOLD OS – Maße aus einer Ansicht (Vektor-PDF, z. B. „Ansicht West 1:100“) lesen.
//
// Eingabe: gefüllte Flächen (pdf-vektoren.ts) und Texte einer Plan-Seite. Der Maßstab kommt aus dem Schriftfeld.
// Ausgabe sind VORSCHLÄGE (Körper, Türen, Teilung), keine Entscheidungen: Welcher Körper der Turm ist und ob eine
// Fläche wirklich eine Tür ist, bestätigt die Person. Rein rechnerisch, ohne KI; Scans ohne Vektoren liefern nichts.
// Annahmen: Der Boden ist die tiefste Unterkante der größeren farbigen Flächen; Türen sind dunkle Rechtecke knapp über dem Boden.
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'
import type { PlanText } from './grundriss-finden'
import { massstabAusTexten, meterJePunkt } from './plan-vorlage'

export interface AnsichtKoerper {
  /** Füllfarbe der Fläche im Plan (nur zur Wiedererkennung in der Auswahl) */
  fill: string
  breiteM: number
  /** Höhe der Oberkante über dem Boden der Zeichnung */
  hoeheM: number
  /** false: Fläche endet über dem Boden (z. B. vom Nachbardach abgeschnitten) */
  reichtBisBoden: boolean
  /** Mitte in Seiten-Punkten (x) */
  mitteXPt: number
}

export interface AnsichtTuer {
  breiteM: number
  hoeheM: number
  /** Höhe der Unterkante über dem Boden (Schwelle, Stufen) */
  schwelleM: number
  mitteXPt: number
  /** Abstand der Türmitte von der Mitte des Körpers, in dem sie liegt (m, + = rechts im Plan); fehlt, wenn kein Körper passt */
  mitteAbKoerperM?: number
}

export interface AnsichtErgebnis {
  massstab: number
  bodenYPt: number
  koerper: AnsichtKoerper[]
  /** Höhe der Linie zwischen „1.BA“ und „2.BA“ über dem Boden in m */
  teilungM?: number
  tueren: AnsichtTuer[]
  hinweise: string[]
}

const flaeche = (f: VektorFlaeche) => (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
const rgb = (c: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(c)
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null
}
const istWeiss = (c: string) => { const v = rgb(c); return !v || (v[0] > 245 && v[1] > 245 && v[2] > 245) }
const istDunkel = (c: string) => { const v = rgb(c); return !!v && v[0] < 50 && v[1] < 50 && v[2] < 50 }
const r2 = (x: number) => Math.round(x * 100) / 100

export function ansichtLesen(flaechen: VektorFlaeche[], texte: PlanText[], massstabVorgabe?: number): AnsichtErgebnis | null {
  const hinweise: string[] = []
  const massstab = massstabVorgabe ?? massstabAusTexten(texte.map((t) => t.s))
  if (!massstab) return null
  const mpp = meterJePunkt(massstab)
  const farbig = flaechen.filter((f) => !f.linie && !istWeiss(f.fill) && flaeche(f) > 0)
  if (farbig.length === 0) return null
  const groesste = Math.max(...farbig.map(flaeche))
  const gross = farbig.filter((f) => flaeche(f) >= groesste * 0.02)
  const bodenYPt = Math.max(...gross.map((f) => f.bbox[3]))

  const koerper: AnsichtKoerper[] = farbig
    .filter((f) => flaeche(f) >= groesste * 0.05)
    .map((f) => ({
      fill: f.fill,
      breiteM: r2((f.bbox[2] - f.bbox[0]) * mpp),
      hoeheM: r2((bodenYPt - f.bbox[1]) * mpp),
      reichtBisBoden: bodenYPt - f.bbox[3] <= 1 / mpp * 0.5,
      mitteXPt: (f.bbox[0] + f.bbox[2]) / 2,
    }))
    .sort((a, b) => b.hoeheM - a.hoeheM)
    .slice(0, 6)
  if (koerper.every((k) => !k.reichtBisBoden)) hinweise.push('Keine Fläche reicht bis zum Boden der Zeichnung: Höhen über Boden sind unsicher (Ansicht evtl. abgeschnitten).')

  // Teilung 1. BA / 2. BA: zwei Beschriftungen übereinander, 1.BA oben, kleiner Abstand (die Legende hat einen größeren)
  let teilungM: number | undefined
  const ba1 = texte.filter((t) => /^\s*1\s*\.?\s*BA\s*$/i.test(t.s)), ba2 = texte.filter((t) => /^\s*2\s*\.?\s*BA\s*$/i.test(t.s))
  for (const a of ba1) {
    const b = ba2.find((t) => Math.abs(t.x - a.x) < 20 && t.y > a.y && t.y - a.y < 30)
    if (b) { teilungM = r2((bodenYPt - (a.y + b.y) / 2) * mpp); break }
  }

  // Türen: dunkle Rechtecke mit Türmaßen, Unterkante höchstens 1,2 m über dem Boden
  const tueren: AnsichtTuer[] = farbig
    .filter((f) => istDunkel(f.fill))
    .map((f) => ({ f, b: (f.bbox[2] - f.bbox[0]) * mpp, h: (f.bbox[3] - f.bbox[1]) * mpp, s: (bodenYPt - f.bbox[3]) * mpp }))
    .filter(({ b, h, s }) => b >= 0.7 && b <= 3 && h >= 1.6 && h <= 3.5 && s >= -0.05 && s <= 1.2)
    .map(({ f, b, h, s }) => {
      const mitteXPt = (f.bbox[0] + f.bbox[2]) / 2
      const k = koerper.find((q) => q.reichtBisBoden && Math.abs(mitteXPt - q.mitteXPt) * mpp <= q.breiteM / 2)
      return { breiteM: r2(b), hoeheM: r2(h), schwelleM: r2(Math.max(0, s)), mitteXPt, ...(k ? { mitteAbKoerperM: r2((mitteXPt - k.mitteXPt) * mpp) } : {}) }
    })
  if (tueren.length === 0) hinweise.push('Keine Tür erkannt (nur dunkle Rechtecke mit Türmaßen knapp über dem Boden zählen).')
  return { massstab, bodenYPt, koerper, teilungM, tueren, hinweise }
}
