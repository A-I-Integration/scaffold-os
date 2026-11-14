// ============================================================
// SCAFFOLD OS – Geländelinie je Ansicht (Nord/Ost/Süd/West) aus dem Plan: Vorschlag, den der Mensch prüft.
// Baut auf gelaende-linie-raster.ts auf: Pixel → Linie → Höhenbezug aus den Koten-Dreiecken → Meter.
// ============================================================
import type { PlanQuelle } from './plan-rendern'
import type { PlanText } from './grundriss-finden'
import type { VektorFlaeche } from './pdf-vektoren'
import { kotenJeAnsicht, type Himmelsrichtung } from './koten-je-ansicht'
import { gelaendeLinieAusPixeln, koteDreiecke, hoehenBezug, profilAusLinie, fassadenAusdehnung } from './gelaende-linie-raster'

export interface GelaendeLinieAnsicht {
  art: Himmelsrichtung
  /** Stützpunkte von links nach rechts, so wie die Ansicht von außen gezeichnet ist (posM ab linker Fassadenkante) */
  profil: { posM: number; hoeheM: number }[]
  /** false: Fassadenbreite im Bild passt nicht zur Gebäudelänge, Lage der Ecken geschätzt */
  sicher: boolean
  /** Anzahl der Koten, die den Höhenbezug festlegen */
  kotenPaare: number
}

/** Ausreißer (Bäume, Hecken, Beschriftung) entfernen: Punkte, die mehr als `tolM` vom Median ihrer Nachbarn abweichen. */
export function ohneAusreisser(p: { posM: number; hoeheM: number }[], tolM = 0.7): { posM: number; hoeheM: number }[] {
  const r = p.filter((q, i) => {
    const nb = p.slice(Math.max(0, i - 2), i + 3).map((x) => x.hoeheM).sort((a, b) => a - b)
    return Math.abs(q.hoeheM - nb[Math.floor(nb.length / 2)]) <= tolM
  })
  // Endpunkte (Bewuchs am Rand): nur wenn das Gelände davor annähernd eben ist (Nachbarn < 0,1 m Unterschied) und der Randpunkt um mehr als 0,35 m abspringt, fällt er weg; ein steiler Verlauf bleibt unangetastet
  const springt = (e: { posM: number; hoeheM: number }, n1: { posM: number; hoeheM: number }, n2: { posM: number; hoeheM: number }) => {
    const d = n1.posM - n2.posM
    const erw = d === 0 ? n1.hoeheM : n1.hoeheM + ((n1.hoeheM - n2.hoeheM) / d) * (e.posM - n1.posM)
    return Math.abs(n1.hoeheM - n2.hoeheM) < 0.1 && Math.abs(e.hoeheM - erw) > 0.35
  }
  if (r.length >= 5 && springt(r[r.length - 1], r[r.length - 2], r[r.length - 3])) r.pop()
  if (r.length >= 5 && springt(r[0], r[1], r[2])) r.shift()
  return r
}

export async function gelaendeLinienAusAnsichten(
  q: PlanQuelle, nr: number, texte: PlanText[], flaechen: VektorFlaeche[], massstab: number, seitenLaengenM: number[], dbg?: (t: string) => void,
): Promise<GelaendeLinieAnsicht[]> {
  const ptJeM = 72 / 0.0254 / massstab
  const ansichten = kotenJeAnsicht(texte).filter((a) => a.art !== 'schnitt')
  const dreiecke = koteDreiecke(flaechen)
  const out: GelaendeLinieAnsicht[] = []
  for (const a of ansichten) {
    const bezug = hoehenBezug(a.koten, dreiecke, ptJeM)
    if (!bezug) { dbg?.(a.art + ': kein Höhenbezug (' + a.koten.length + ' Koten)'); continue }
    const naechster = ansichten.filter((b) => b.y === a.y && b.x > a.x).map((b) => b.x).sort((x, y) => x - y)[0]
    const x0 = a.x - 10, w = Math.min(1000, (naechster ?? a.x + 1000) - x0 - 5), y0 = a.y, h = 330
    const bild = await q.ausschnitt(nr, 0, x0, y0, w, h, 3)
    if (!bild) continue
    const aus = { pxProPt: 3, x0Pt: x0, y0Pt: y0 }
    const linie = gelaendeLinieAusPixeln(bild, aus)
    const ext = fassadenAusdehnung(bild, aus, ptJeM, seitenLaengenM)
    if (!linie.length || !ext) { dbg?.(a.art + ': linie=' + linie.length + ' ext=' + !!ext); continue }
    const profil = ohneAusreisser(profilAusLinie(linie, bezug.k, ptJeM, ext.xLinksPt, ext.xRechtsPt, 1))
    if (profil.length < 3) continue
    if (a.art === 'schnitt') continue
    out.push({ art: a.art, profil, sicher: ext.sicher, kotenPaare: bezug.paare })
  }
  return out
}
