// ============================================================
// SCAFFOLD OS – Geländeebenen: Flächen mit eigener Höhe (Terrasse, Hof, Beet, Zufahrt) → Geländeprofil je Gerüstseite.
// Die Engine bleibt unverändert: Sie liest weiter gelaendeProfilM. Dieses Modul rechnet nur die Flächen in diese Linien um
// (Position ab Seitenanfang wie im Profil: vorne/hinten links→rechts, links/rechts hinten→vorne; Höhe bezogen auf ±0,00).
// Gemessen wird auf der Gerüstlinie im Abstand `abstandM` zur Wand. Zwischen zwei Ebenen verläuft eine Böschung der Breite `boeschungM`.
// Koordinaten der Flächen: Gebäudemitte = 0/0, x nach rechts, z nach vorne (wie die 3D-Szene und gelaendeHoeheFn).
// ============================================================

import type { GelaendeProfil, GelaendePunkt, GelaendeSeite } from '@/lib/calculations/gelaende'

export interface GelaendeEbene {
  id: string
  name: string
  x0: number; x1: number
  z0: number; z1: number
  /** Höhe der Fläche in m, bezogen auf ±0,00 (Fußboden Erdgeschoss); minus = tiefer */
  hoeheM: number
  /** Nur zur Beschriftung/Darstellung, geht nicht in die Berechnung */
  material?: 'rasen' | 'schotter' | 'pflaster' | 'erde' | 'beton'
}

export interface EbenenOptionen {
  /** Höhe außerhalb aller Flächen (Standard 0 = ±0,00) */
  basisM?: number
  /** Breite der Böschung zwischen zwei Ebenen in m (Standard 0,5) */
  boeschungM?: number
  /** Abstand der Gerüstlinie zur Wand in m (Standard 1,0) */
  abstandM?: number
}

export const MAX_HOEHE_M = 15 // wie bereinigeLinie in gelaende.ts

export function normalisiere(e: GelaendeEbene): GelaendeEbene {
  return { ...e, x0: Math.min(e.x0, e.x1), x1: Math.max(e.x0, e.x1), z0: Math.min(e.z0, e.z1), z1: Math.max(e.z0, e.z1) }
}

export function pruefeEbene(e: GelaendeEbene): string | null {
  const n = [e.x0, e.x1, e.z0, e.z1, e.hoeheM]
  if (n.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return 'Alle Werte müssen Zahlen sein.'
  if (Math.abs(e.hoeheM) > MAX_HOEHE_M) return `Höhe über ±${MAX_HOEHE_M} m wird nicht übernommen.`
  if (Math.abs(e.x1 - e.x0) < 0.05 || Math.abs(e.z1 - e.z0) < 0.05) return 'Die Fläche ist zu schmal (unter 5 cm).'
  return null
}

/** Höhe an einer Stelle: die zuletzt eingetragene Fläche, die den Punkt enthält, sonst Basis. */
export function ebeneHoeheAn(ebenen: GelaendeEbene[], x: number, z: number, basisM = 0): number {
  for (let i = ebenen.length - 1; i >= 0; i--) {
    const e = normalisiere(ebenen[i])
    if (x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1) return e.hoeheM
  }
  return basisM
}

const SEITEN: GelaendeSeite[] = ['front', 'back', 'left', 'right']

export function ebenenZuProfil(ebenenRoh: GelaendeEbene[], gebaeude: { lengthM: number; widthM: number }, opt: EbenenOptionen = {}): GelaendeProfil {
  const basis = opt.basisM ?? 0
  const b = Math.max(0.05, opt.boeschungM ?? 0.5)
  const d = opt.abstandM ?? 1.0
  const L = gebaeude.lengthM, W = gebaeude.widthM
  const ebenen = ebenenRoh.filter((e) => pruefeEbene(e) === null).map(normalisiere)
  const profil: GelaendeProfil = {}
  if (!ebenen.length || !(L > 0) || !(W > 0)) return profil

  for (const sd of SEITEN) {
    const laenge = sd === 'front' || sd === 'back' ? L : W
    // Gerüstlinie: feste Koordinate (quer) und laufende Koordinate (pos)
    const quer = sd === 'front' ? W / 2 + d : sd === 'back' ? -W / 2 - d : sd === 'left' ? -L / 2 - d : L / 2 + d
    const alongIsX = sd === 'front' || sd === 'back'
    const versatz = (alongIsX ? L : W) / 2
    const hoeheBei = (pos: number) => (alongIsX ? ebeneHoeheAn(ebenen, pos - versatz, quer, basis) : ebeneHoeheAn(ebenen, quer, pos - versatz, basis))

    // Kanten der Flächen, die diese Linie schneiden
    const kanten = new Set<number>()
    for (const e of ebenen) {
      const [q0, q1, a0, a1] = alongIsX ? [e.z0, e.z1, e.x0, e.x1] : [e.x0, e.x1, e.z0, e.z1]
      if (quer < q0 || quer > q1) continue
      for (const k of [a0 + versatz, a1 + versatz]) if (k > 0.01 && k < laenge - 0.01) kanten.add(Math.round(k * 100) / 100)
    }
    const grenzen = [0, ...[...kanten].sort((x, y) => x - y), laenge]
    const hSeg = grenzen.slice(0, -1).map((g, i) => hoeheBei((g + grenzen[i + 1]) / 2))
    const punkte: GelaendePunkt[] = [{ posM: 0, hoeheM: hSeg[0] }]
    for (let i = 1; i < hSeg.length; i++) {
      if (Math.abs(hSeg[i] - hSeg[i - 1]) < 0.005) continue
      const e = grenzen[i]
      const halb = Math.min(b / 2, (e - grenzen[i - 1]) / 2, (grenzen[i + 1] - e) / 2)
      punkte.push({ posM: e - halb, hoeheM: hSeg[i - 1] }, { posM: e + halb, hoeheM: hSeg[i] })
    }
    punkte.push({ posM: laenge, hoeheM: hSeg[hSeg.length - 1] })
    if (punkte.every((p) => Math.abs(p.hoeheM) < 0.005)) continue // flach auf ±0,00: Seite bleibt ohne Linie
    profil[sd] = punkte
  }
  return profil
}
