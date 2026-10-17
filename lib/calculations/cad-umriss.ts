// ============================================================
// SCAFFOLD OS – Gebäude-Umriss (Polygon) für das CAD
//
// Reine Geometrie, ohne Abhängigkeit zur CAD-Engine.
// Koordinaten: x/z in Metern in der Szene (y = oben). Der Umriss wird
// geschlossen gedacht (letzter Punkt verbindet sich mit dem ersten).
//
// Konvention (gleich wie die bisherige Vorderseite des Rechteck-Gebäudes):
//   Kantenrichtung u = (ux, uz), Drehwinkel yaw = atan2(-uz, ux),
//   Außen-Normale n = (-uz, ux).
// Damit die Normale nach AUSSEN zeigt, muss der Umriss in dieser
// Koordinatenlage "im Uhrzeigersinn" laufen (vorzeichenbehaftete Fläche < 0).
// Die Funktion normalisiereUmriss() dreht ihn bei Bedarf um.
// ============================================================

export interface UmrissPunkt { x: number; z: number }

export interface UmrissKante {
  index: number
  von: UmrissPunkt
  bis: UmrissPunkt
  laengeM: number
  /** Einheitsvektor entlang der Kante */
  u: [number, number]
  /** Einheitsvektor nach außen */
  n: [number, number]
  yaw: number
}

export interface UmrissEcke {
  /** Ecke am ENDE der Kante `index` (= Anfang der Kante index+1) */
  index: number
  punkt: UmrissPunkt
  /** true = Außenecke (konvex), false = Innenecke (konkav) */
  konvex: boolean
  /** Winkel zwischen den beiden Kanten in Grad (Innenwinkel des Gebäudes) */
  innenwinkelGrad: number
}

export const UMRISS_MIN_PUNKTE = 3
export const UMRISS_MAX_PUNKTE = 60
export const UMRISS_MIN_KANTE_M = 0.5
export const UMRISS_MAX_KOORD_M = 500
export const UMRISS_MIN_FLAECHE_M2 = 4

/** Vorzeichenbehaftete Fläche (Schnürsenkelformel) in x/z. */
export function umrissFlaecheSigned(p: UmrissPunkt[]): number {
  let s = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length]
    s += a.x * b.z - b.x * a.z
  }
  return s / 2
}

function schneiden(a: UmrissPunkt, b: UmrissPunkt, c: UmrissPunkt, d: UmrissPunkt): boolean {
  const o = (p: UmrissPunkt, q: UmrissPunkt, r: UmrissPunkt) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b)
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
}

/** Prüft einen Umriss. Gibt Fehlertexte zurück (leer = in Ordnung). */
export function pruefeUmriss(p: UmrissPunkt[]): string[] {
  const fehler: string[] = []
  if (!Array.isArray(p) || p.length < UMRISS_MIN_PUNKTE) return [`Ein Umriss braucht mindestens ${UMRISS_MIN_PUNKTE} Eckpunkte.`]
  if (p.length > UMRISS_MAX_PUNKTE) return [`Ein Umriss darf höchstens ${UMRISS_MAX_PUNKTE} Eckpunkte haben.`]
  if (p.some((q) => !q || !Number.isFinite(q.x) || !Number.isFinite(q.z) || Math.abs(q.x) > UMRISS_MAX_KOORD_M || Math.abs(q.z) > UMRISS_MAX_KOORD_M)) {
    return [`Eckpunkte müssen Zahlen zwischen -${UMRISS_MAX_KOORD_M} und ${UMRISS_MAX_KOORD_M} m sein.`]
  }
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length]
    if (Math.hypot(b.x - a.x, b.z - a.z) < UMRISS_MIN_KANTE_M) fehler.push(`Kante ${i + 1} ist kürzer als ${UMRISS_MIN_KANTE_M} m.`)
  }
  if (Math.abs(umrissFlaecheSigned(p)) < UMRISS_MIN_FLAECHE_M2) fehler.push(`Die Grundfläche ist kleiner als ${UMRISS_MIN_FLAECHE_M2} m².`)
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      if (j === i + 1 || (i === 0 && j === p.length - 1)) continue // direkte Nachbarn
      if (schneiden(p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length])) {
        fehler.push(`Kante ${i + 1} kreuzt Kante ${j + 1} – der Umriss darf sich nicht überschneiden.`)
        return fehler
      }
    }
  }
  return fehler
}

/** Auf zwei Nachkommastellen runden und Laufrichtung so drehen, dass die Normalen nach außen zeigen. */
export function normalisiereUmriss(p: UmrissPunkt[]): UmrissPunkt[] {
  const r = p.map((q) => ({ x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100 }))
  return umrissFlaecheSigned(r) > 0 ? r.slice().reverse() : r
}

/**
 * Verschiebt den Umriss in die Lage, die der Rest des CAD für ein Gebäude erwartet:
 * x symmetrisch um 0, Vorderkante (größtes z) des umschließenden Rechtecks bei z = -0,5
 * (Gebäude liegt hinter der Nulllinie, das Gerüst davor – Boden, Kamera und
 * Umgebung im 3D gehen von dieser Lage aus).
 */
export function zentriereUmriss(p: UmrissPunkt[]): UmrissPunkt[] {
  const b = umrissBox(p)
  const dx = -b.mitteX
  const dz = -0.5 - (b.mitteZ + b.widthM / 2)
  return p.map((q) => ({ x: Math.round((q.x + dx) * 100) / 100, z: Math.round((q.z + dz) * 100) / 100 }))
}

/** Kanten eines (bereits normalisierten) Umrisses. */
export function umrissKanten(p: UmrissPunkt[]): UmrissKante[] {
  return p.map((a, i) => {
    const b = p[(i + 1) % p.length]
    const dx = b.x - a.x, dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    const ux = dx / len, uz = dz / len
    return { index: i, von: a, bis: b, laengeM: len, u: [ux, uz], n: [-uz, ux], yaw: Math.atan2(-uz, ux) }
  })
}

/** Ecken (am Ende jeder Kante) mit Außen-/Innenecke-Kennzeichnung. */
export function umrissEcken(kanten: UmrissKante[]): UmrissEcke[] {
  return kanten.map((k, i) => {
    const m = kanten[(i + 1) % kanten.length]
    const kreuz = k.u[0] * m.u[1] - k.u[1] * m.u[0]
    const punktprodukt = k.u[0] * m.u[0] + k.u[1] * m.u[1]
    // Abbiegewinkel (0 = geradeaus); Innenwinkel = 180° - Abbiegewinkel (bei Außenecke)
    const abbiege = Math.abs(Math.atan2(kreuz, punktprodukt)) * 180 / Math.PI
    const konvex = kreuz < 0 // im normalisierten Umlauf (Uhrzeigersinn) biegt eine Außenecke nach rechts
    return { index: i, punkt: k.bis, konvex, innenwinkelGrad: konvex ? 180 - abbiege : 180 + abbiege }
  })
}

/**
 * Eckpunkt der Gerüst-Innenlinie: Schnitt der um `abstandM` nach außen
 * verschobenen Linien der Kante i und der Kante i+1.
 * Gibt null zurück, wenn die Kanten fast gegenläufig sind (Spitze).
 */
export function geruestEckpunkt(k: UmrissKante, m: UmrissKante, abstandM: number): UmrissPunkt | null {
  const dot = k.n[0] * m.n[0] + k.n[1] * m.n[1]
  if (1 + dot < 0.05) return null
  const f = abstandM / (1 + dot)
  return { x: k.bis.x + (k.n[0] + m.n[0]) * f, z: k.bis.z + (k.n[1] + m.n[1]) * f }
}

/** Umschließendes Rechteck: Länge (x), Breite (z), Mittelpunkt. */
export function umrissBox(p: UmrissPunkt[]): { lengthM: number; widthM: number; mitteX: number; mitteZ: number } {
  const xs = p.map((q) => q.x), zs = p.map((q) => q.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
  return { lengthM: maxX - minX, widthM: maxZ - minZ, mitteX: (minX + maxX) / 2, mitteZ: (minZ + maxZ) / 2 }
}

/** Rechteck als Umriss (Startpunkt/Beispiel für den Editor). Läuft bereits im richtigen Umlauf. */
export function rechteckUmriss(laengeM: number, breiteM: number): UmrissPunkt[] {
  return normalisiereUmriss([
    { x: 0, z: 0 }, { x: laengeM, z: 0 }, { x: laengeM, z: breiteM }, { x: 0, z: breiteM },
  ])
}

/** L-förmiger Beispiel-Umriss (Winkelhaus). */
export function lFormUmriss(laengeM: number, breiteM: number, schenkelLaengeM: number, schenkelBreiteM: number): UmrissPunkt[] {
  return normalisiereUmriss([
    { x: 0, z: 0 }, { x: laengeM, z: 0 }, { x: laengeM, z: schenkelBreiteM }, { x: schenkelLaengeM, z: schenkelBreiteM },
    { x: schenkelLaengeM, z: breiteM }, { x: 0, z: breiteM },
  ])
}
