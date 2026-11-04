// ============================================================
// SCAFFOLD OS – Gerüstmaße direkt aus der GLB-Hülle eines einzelnen Hauses
//
// Regel: Ein Haus aus einem Körper wird NICHT in Teile zerlegt, sondern nur vermessen:
//   Länge/Breite = Umschlagsrechteck, Gesamthöhe = Oberkante – Unterkante.
//   Traufe = höchste Höhe, bis zu der die Grundfläche noch voll (≥ 97 %) ausgefüllt ist; darüber ist Dach.
//   Dachform: ein Maß schrumpft, das andere bleibt ≈ voll bis zur Spitze → Satteldach, beide schrumpfen → Walmdach.
// Annahme: Haus ist an den Achsen ausgerichtet (gedrehte Häuser werden nur grob vermessen). Ergebnis ist ein Vorschlag.
// ============================================================
export interface GlbMasse {
  lengthM: number
  widthM: number
  heightM: number
  eavesHeightM: number
  roofHeightM: number
  roofForm: 'flachdach' | 'satteldach' | 'walmdach'
  /** true: lange Seite liegt in Modell-Z → Ansicht um 90° drehen, damit sie zur Gerüst-Länge (X) passt */
  drehen90: boolean
}

/** dreiecke: Float32Array x,y,z je Ecke (glTF: Meter, Y oben) */
export function masseAusDreiecken(dreiecke: Float32Array, oben: 'x' | 'y' | 'z' = 'y', faktor = 1): GlbMasse | null {
  const n = Math.floor(dreiecke.length / 3)
  if (n < 3) return null
  const h = oben === 'y' ? 1 : oben === 'z' ? 2 : 0
  const [a, b] = [0, 1, 2].filter((k) => k !== h)
  let hMin = Infinity, hMax = -Infinity
  let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity
  for (let i = 0; i < n; i++) {
    const hv = dreiecke[i * 3 + h] * faktor, av = dreiecke[i * 3 + a] * faktor, bv = dreiecke[i * 3 + b] * faktor
    if (!Number.isFinite(hv + av + bv)) continue
    if (hv < hMin) hMin = hv; if (hv > hMax) hMax = hv
    if (av < aMin) aMin = av; if (av > aMax) aMax = av
    if (bv < bMin) bMin = bv; if (bv > bMax) bMax = bv
  }
  const hoehe = hMax - hMin, ra = aMax - aMin, rb = bMax - bMin
  if (!(hoehe > 1) || !(ra > 1) || !(rb > 1)) return null
  // Schnitte alle 0,25 m: Dreiecke werden an waagerechten Ebenen geschnitten (Dachflächen sind große Dreiecke
  // ohne Eckpunkte in der Mitte – nur Eckpunkte zu zählen würde sie übersehen)
  const SCHEIBE = 0.25
  const anz = Math.max(1, Math.ceil(hoehe / SCHEIBE))
  const mnA = new Array<number>(anz).fill(Infinity), mxA = new Array<number>(anz).fill(-Infinity)
  const mnB = new Array<number>(anz).fill(Infinity), mxB = new Array<number>(anz).fill(-Infinity)
  const ebene = (s: number) => (s + 0.5) * SCHEIBE
  const merke = (s: number, av: number, bv: number) => {
    if (av < mnA[s]) mnA[s] = av; if (av > mxA[s]) mxA[s] = av
    if (bv < mnB[s]) mnB[s] = bv; if (bv > mxB[s]) mxB[s] = bv
  }
  const E = [[0, 1], [1, 2], [2, 0]]
  for (let i = 0; i < n; i += 3) {
    if (i + 2 >= n) break
    const H = [0, 1, 2].map((k) => dreiecke[(i + k) * 3 + h] * faktor - hMin)
    const A = [0, 1, 2].map((k) => dreiecke[(i + k) * 3 + a] * faktor)
    const Bq = [0, 1, 2].map((k) => dreiecke[(i + k) * 3 + b] * faktor)
    if (![...H, ...A, ...Bq].every(Number.isFinite)) continue
    const s0 = Math.max(0, Math.ceil(Math.min(...H) / SCHEIBE - 0.5)), s1 = Math.min(anz - 1, Math.floor(Math.max(...H) / SCHEIBE - 0.5))
    for (let s = s0; s <= s1; s++) {
      const eh = ebene(s)
      for (const [p, q] of E) {
        const lo = Math.min(H[p], H[q]), hi = Math.max(H[p], H[q])
        if (eh < lo || eh > hi) continue
        const t = hi === lo ? 0 : (eh - H[p]) / (H[q] - H[p])
        merke(s, A[p] + t * (A[q] - A[p]), Bq[p] + t * (Bq[q] - Bq[p]))
      }
    }
  }
  const ext = (s: number) => ({ a: Number.isFinite(mnA[s]) ? mxA[s] - mnA[s] : 0, b: Number.isFinite(mnB[s]) ? mxB[s] - mnB[s] : 0 })
  const ab = Math.floor(anz * 0.3)
  let maxA = 0, maxB = 0
  for (let s = ab; s < anz; s++) { const e = ext(s); if (e.a > maxA) maxA = e.a; if (e.b > maxB) maxB = e.b }
  if (!(maxA > 1) || !(maxB > 1)) return null
  // Traufe je Richtung: höchster Schnitt, der noch ≥ 98 % der größten Ausdehnung im oberen Bereich hat
  // (bei Dachüberstand ist das die Dachkante). Die Richtung, die schrumpft, bestimmt die Traufe; die First-Richtung bleibt voll.
  const hoechster = (achse: 'a' | 'b', max: number) => { let r = -1; for (let s = ab; s < anz; s++) if (ext(s)[achse] >= 0.98 * max) r = s; return r }
  const traufeS = Math.min(hoechster('a', maxA), hoechster('b', maxB))
  // Oberkante ohne Schornstein/Antenne: höchster Schnitt, in dem eine Richtung noch ≥ 30 % der Maximalausdehnung hat
  let firstS = -1
  for (let s = 0; s < anz; s++) { const e = ext(s); if (e.a >= 0.3 * maxA || e.b >= 0.3 * maxB) firstS = s }
  if (traufeS < 0 || firstS < 0) return null
  const firstH = Math.min(hoehe, ebene(firstS) + SCHEIBE / 2)
  const traufe = Math.min(firstH, ebene(traufeS))
  let dachH = firstH - traufe
  let form: GlbMasse['roofForm'] = 'flachdach'
  if (dachH >= 0.5) {
    const e = ext(Math.min(anz - 1, Math.max(0, Math.round((traufe + 0.7 * dachH) / SCHEIBE - 0.5))))
    form = Math.max(e.a / maxA, e.b / maxB) >= 0.85 ? 'satteldach' : 'walmdach'
  } else { dachH = 0 }
  const r = (v: number) => Math.round(v * 100) / 100
  // Länge/Breite = Wandmaß (Median der Schnitte unterhalb der Traufe), NICHT Dachüberstand oder Vorbauten
  const med = (w: number[]) => { const t = [...w].sort((x, y) => x - y); return t.length ? t[Math.floor(t.length / 2)] : 0 }
  const wa: number[] = [], wb: number[] = []
  for (let s = 0; s < anz; s++) if (ebene(s) >= 0.15 * traufe && ebene(s) <= traufe - 0.5) { const e = ext(s); if (e.a > 0 && e.b > 0) { wa.push(e.a); wb.push(e.b) } }
  const wandA = wa.length ? med(wa) : ra, wandB = wb.length ? med(wb) : rb
  const lang = Math.max(wandA, wandB), kurz = Math.min(wandA, wandB)
  return { lengthM: r(lang), widthM: r(kurz), heightM: r(traufe + dachH), eavesHeightM: r(traufe), roofHeightM: r(dachH), roofForm: form, drehen90: wandA < wandB }
}

/** Hat die GLB einen benannten Turmkörper (Kirche o. Ä.)? Dann übernimmt die Turm-Ausrichtung, nicht die Einzelhaus-Vermessung. */
export function glbHatTurmKoerper(daten: ArrayBuffer, istTurm: (name: string) => boolean): boolean {
  try {
    const v = new DataView(daten)
    const laenge = v.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(daten, 20, laenge))) as { nodes?: { name?: string }[] }
    return (json.nodes ?? []).some((nd) => !!nd.name && istTurm(nd.name))
  } catch { return false }
}
