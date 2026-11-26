// ============================================================
// SCAFFOLD OS – Amtliche Grundflächen für das CAD bereinigen
// LoD2-Grundflächen enthalten kleine Stufen (z. B. 0,25 m) und Punkte auf einer Geraden. Das CAD verlangt Kanten ab
// UMRISS_MIN_KANTE_M. Zu kurze Kanten werden zu einem Punkt (Mitte) zusammengezogen, Punkte auf einer Geraden entfernt.
// Die Abweichung bleibt klein (höchstens die halbe Mindestkante); die Änderung wird als Hinweis angezeigt.
// ============================================================
import { UMRISS_MIN_KANTE_M } from '@/lib/calculations/cad-umriss'

type P = { x: number; z: number }
/** etwas über der Mindestkante, damit Rundung auf 2 Nachkommastellen die Prüfung nicht wieder reißt */
const ZIEL_MIN_M = UMRISS_MIN_KANTE_M + 0.05
/** Punkt gilt als „auf der Geraden“, wenn er weniger als so weit von der Linie der Nachbarn liegt */
const GERADE_TOL_M = 0.05

const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.z - a.z)

export function bereinigeUmriss(eingabe: P[]): { punkte: P[]; entfernt: number } {
  let p = eingabe.map((q) => ({ x: q.x, z: q.z }))
  const start = p.length
  let geaendert = true
  while (geaendert && p.length > 3) {
    geaendert = false
    // kürzeste zu kurze Kante zusammenziehen
    let besteI = -1, besteL = ZIEL_MIN_M
    for (let i = 0; i < p.length; i++) {
      const l = dist(p[i], p[(i + 1) % p.length])
      if (l < besteL) { besteL = l; besteI = i }
    }
    if (besteI >= 0) {
      const j = (besteI + 1) % p.length
      const m = { x: (p[besteI].x + p[j].x) / 2, z: (p[besteI].z + p[j].z) / 2 }
      const neu: P[] = []
      for (let k = 0; k < p.length; k++) {
        if (k === besteI) neu.push(m)
        else if (k !== j) neu.push(p[k])
      }
      p = neu; geaendert = true; continue
    }
    // Punkte auf einer Geraden entfernen
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length]
      const l = dist(a, c)
      if (l < 1e-9) continue
      const abstand = Math.abs((c.x - a.x) * (a.z - b.z) - (a.x - b.x) * (c.z - a.z)) / l
      if (abstand < GERADE_TOL_M) { p = p.filter((_, k) => k !== i); geaendert = true; break }
    }
  }
  return { punkte: p, entfernt: start - p.length }
}
