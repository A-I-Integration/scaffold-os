// ============================================================
// SCAFFOLD OS – Geländelinie aus einer Ansicht lesen.
// In vielen Plänen ist die Ansicht ein Farbbild (Raster); nur Linien, Koten-Dreiecke und Texte sind Vektoren.
// Die Geländelinie (grün = geplantes, rot = bestehendes Gelände) wird daher aus den Pixeln gelesen und über die
// Höhenkoten-Dreiecke (exakte Vektoren) in Meter umgerechnet. Das Ergebnis ist ein Vorschlag, den der Mensch prüft.
// ============================================================

export interface PixelBild { data: ArrayLike<number>; width: number; height: number }
export interface Bildausschnitt {
  /** Bildpunkte je PDF-Punkt */
  pxProPt: number
  /** linke obere Ecke des Ausschnitts in Seiten-Punkten */
  x0Pt: number
  y0Pt: number
}
export interface GelaendePunktPt { xPt: number; yPt: number }

type Farbe = 'gruen' | 'rot'
const istFarbe = (f: Farbe, r: number, g: number, b: number): boolean =>
  f === 'gruen' ? g >= 90 && g - r >= 40 && g - b >= 40 : r >= 130 && r - g >= 60 && r - b >= 60

/** Geländelinie als Punkte (Seiten-Punkte): je Bildspalte der mittlere Treffer der Linienfarbe. Grün hat Vorrang, ohne Grün gilt Rot. */
export function gelaendeLinieAusPixeln(bild: PixelBild, a: Bildausschnitt): GelaendePunktPt[] {
  for (const f of ['gruen', 'rot'] as const) {
    const pts: GelaendePunktPt[] = []
    for (let x = 0; x < bild.width; x++) {
      let n = 0, sumY = 0
      for (let y = 0; y < bild.height; y++) {
        const i = (y * bild.width + x) * 4
        if (istFarbe(f, bild.data[i], bild.data[i + 1], bild.data[i + 2])) { n++; sumY += y }
      }
      if (n > 0 && n <= Math.max(12, a.pxProPt * 8)) pts.push({ xPt: a.x0Pt + (x + 0.5) / a.pxProPt, yPt: a.y0Pt + (sumY / n + 0.5) / a.pxProPt })
    }
    if (pts.length >= 40) return pts
  }
  return []
}

export interface KoteMitPosition { hoeheM: number; x: number; y: number }
export interface Dreieck { x: number; yMin: number; yMax: number; spitzeY: number }

/** Dreiecke (3 Punkte, schwarz gefüllt) aus Vektorflächen: Spitze = unterer Punkt, wenn die Kote nach unten zeigt. */
export function koteDreiecke(flaechen: { fill: string; linie?: boolean; ringe: number[][][] }[]): Dreieck[] {
  const out: Dreieck[] = []
  for (const f of flaechen) {
    if (f.linie || f.fill !== '#000000') continue
    for (const r of f.ringe) {
      const p = r.length === 4 && r[0][0] === r[3][0] && r[0][1] === r[3][1] ? r.slice(0, 3) : r
      if (p.length !== 3) continue
      const ys = p.map((q) => q[1]), xs = p.map((q) => q[0])
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
      if (w < 2 || w > 14 || h < 2 || h > 14) continue
      out.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, yMin: Math.min(...ys), yMax: Math.max(...ys), spitzeY: Math.max(...ys) })
    }
  }
  return out
}

/**
 * Höhenbezug der Ansicht: Seiten-y-Wert der Höhe 0 (y = k − h · ptJeM). Jede Kote gehört zum nächsten Dreieck in Reichweite
 * (Beschriftung steht direkt neben/über dem Dreieck); der Median über alle Paare gleicht Ausreißer aus.
 * null, wenn weniger als 3 Paare passen oder sie sich um mehr als 0,15 m widersprechen.
 */
export function hoehenBezug(koten: KoteMitPosition[], dreiecke: Dreieck[], ptJeM: number): { k: number; paare: number } | null {
  const ks: number[] = []
  for (const kt of koten) {
    let best: { d: number; t: Dreieck } | null = null
    for (const t of dreiecke) {
      const dx = Math.abs(t.x - kt.x), dy = t.yMin - kt.y
      if (dx > 40 || dy < -12 || dy > 22) continue
      const d = Math.hypot(dx, dy)
      if (!best || d < best.d) best = { d, t }
    }
    if (best) ks.push(best.t.spitzeY + kt.hoeheM * ptJeM)
  }
  if (ks.length < 3) return null
  ks.sort((p, q) => p - q)
  const med = ks[Math.floor(ks.length / 2)]
  const passend = ks.filter((v) => Math.abs(v - med) <= 0.15 * ptJeM)
  if (passend.length < 3) return null
  return { k: passend.reduce((s, v) => s + v, 0) / passend.length, paare: passend.length }
}

/** Gelände-Stützpunkte der Linie in Metern: posM ab xLinksPt, hoeheM aus dem Höhenbezug. Alle `schrittM` ein Punkt (Mittel der Nachbarpunkte). */
export function profilAusLinie(linie: GelaendePunktPt[], k: number, ptJeM: number, xLinksPt: number, xRechtsPt: number, schrittM = 1): { posM: number; hoeheM: number }[] {
  const laenge = (xRechtsPt - xLinksPt) / ptJeM
  const hoeheBei = (xPt: number): number | null => {
    const nah = linie.filter((p) => Math.abs(p.xPt - xPt) <= 3)
    if (!nah.length) return null
    return (k - nah.reduce((s, p) => s + p.yPt, 0) / nah.length) / ptJeM
  }
  const out: { posM: number; hoeheM: number }[] = []
  const n = Math.max(1, Math.round(laenge / schrittM))
  for (let i = 0; i <= n; i++) {
    const posM = (laenge * i) / n
    const h = hoeheBei(xLinksPt + posM * ptJeM) ?? hoeheBei(xLinksPt + posM * ptJeM + (i === n ? -8 : 8))
    if (h != null) out.push({ posM: Math.round(posM * 100) / 100, hoeheM: Math.round(h * 100) / 100 })
  }
  return out
}
