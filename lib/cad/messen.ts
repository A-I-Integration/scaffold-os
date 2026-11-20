// ============================================================
// SCAFFOLD OS – Messfunktionen (reine Rechnung auf angeklickten Punkten, ändern das Modell nicht)
// Koordinaten wie im Modell: x/z liegen im Grundriss, y ist die Höhe (alles in Metern).
// ============================================================
export type V3 = [number, number, number]
export type Messart = 'abstand' | 'hoehe' | 'winkel' | 'flaeche' | 'koordinaten'

/** Anzahl Klicks, nach denen eine Messung fertig ist (Fläche: mindestens 3, Abschluss per Knopf). */
export const MESS_PUNKTE: Record<Messart, number> = { abstand: 2, hoehe: 2, winkel: 3, flaeche: 3, koordinaten: 1 }
export const MESS_NAME: Record<Messart, string> = { abstand: 'Abstand', hoehe: 'Höhe', winkel: 'Winkel', flaeche: 'Fläche', koordinaten: 'Koordinaten' }
export const MESS_HINWEIS: Record<Messart, string> = {
  abstand: 'Zwei Punkte anklicken', hoehe: 'Zwei Punkte anklicken (Höhenunterschied)', winkel: 'Drei Punkte anklicken: Schenkel, Scheitel, Schenkel',
  flaeche: 'Mindestens drei Punkte anklicken, dann „Fläche abschließen“', koordinaten: 'Einen Punkt anklicken',
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
const kreuz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

export const abstandM = (a: V3, b: V3) => len(sub(a, b))
/** Höhenunterschied (y) zwischen zwei Punkten, immer ≥ 0 */
export const hoeheM = (a: V3, b: V3) => Math.abs(a[1] - b[1])
/** Winkel am Scheitel `b` in Grad (0–180); null, wenn ein Schenkel die Länge 0 hat */
export function winkelGrad(a: V3, b: V3, c: V3): number | null {
  const u = sub(a, b), v = sub(c, b)
  const lu = len(u), lv = len(v)
  if (lu < 1e-9 || lv < 1e-9) return null
  const cos = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv)))
  return (Math.acos(cos) * 180) / Math.PI
}
/** Fläche eines Polygons im Raum (Summe der Kreuzprodukte); Punkte in Reihenfolge um die Fläche herum. null bei weniger als 3 Punkten. */
export function flaecheM2(punkte: V3[]): number | null {
  if (punkte.length < 3) return null
  let s: V3 = [0, 0, 0]
  for (let i = 0; i < punkte.length; i++) {
    const k = kreuz(punkte[i], punkte[(i + 1) % punkte.length])
    s = [s[0] + k[0], s[1] + k[1], s[2] + k[2]]
  }
  return len(s) / 2
}

const z = (v: number, st = 2) => v.toLocaleString('de-DE', { minimumFractionDigits: st, maximumFractionDigits: st })

export interface MessErgebnis { id: string; art: Messart; text: string; punkte: V3[] }

/** Ergebnis einer fertigen Messung oder null, wenn die Punkte nicht reichen oder nicht messbar sind. */
export function messe(art: Messart, punkte: V3[]): { text: string } | null {
  if (punkte.length < MESS_PUNKTE[art]) return null
  switch (art) {
    case 'abstand': return { text: `${z(abstandM(punkte[0], punkte[1]))} m` }
    case 'hoehe': return { text: `${z(hoeheM(punkte[0], punkte[1]))} m` }
    case 'winkel': { const w = winkelGrad(punkte[0], punkte[1], punkte[2]); return w === null ? null : { text: `${z(w, 1)}°` } }
    case 'flaeche': { const f = flaecheM2(punkte); return f === null ? null : { text: `${z(f)} m²` } }
    case 'koordinaten': return { text: `X ${z(punkte[0][0])} · Y ${z(punkte[0][1])} · Z ${z(punkte[0][2])} m` }
  }
}
