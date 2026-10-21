// ============================================================
// SCAFFOLD OS – Amtliche 3D-Gebäudemodelle (LoD2, CityGML 1.0/2.0) einlesen
//
// Quelle: z. B. "3D-Gebäudemodell LoD2 NRW" (Kacheln LoD2_32_<Ost-km>_<Nord-km>_1_NW.gml, UTM 32 ETRS89).
// Aus einer Kachel wird je Gebäude Grundfläche, Bodenhöhe, Traufe, First und Dachform abgeleitet
// und als Vorschlag im Format der Baukörper-Erkennung ausgegeben.
// Grenzen: LoD2 hat vereinfachte Dachformen und lässt Türme, Gauben usw. teils weg. Die Person prüft das Ergebnis.
// Die Lizenz je Land (Namensnennung!) muss vor dem Einsatz im Original geprüft werden.
// ============================================================
import type { BaukoerperErgebnis, ErkannterTeil } from '@/lib/cad/baukoerper-erkennung'

export interface Lod2Gebaeude {
  id: string
  /** ALKIS-Nutzungscode (z. B. 31001_3041), falls vorhanden */
  funktion: string | null
  /** Bodenhöhe (niedrigste Grundflächenhöhe, m ü. NHN) */
  bodenZ: number
  /** Niedrigster / höchster Punkt der Dachflächen (m ü. NHN) */
  traufeZ: number
  firstZ: number
  dachForm: 'flachdach' | 'satteldach' | 'walmdach'
  /** Grundfläche in m² (Summe der Grundflächen-Polygone) */
  grundflaecheM2: number
  /** Achsenparallele Hülle in UTM (m) */
  ost0: number
  ost1: number
  nord0: number
  nord1: number
  /** Richtung der Hauptachse (Grad, gegen Ost, 0–180) */
  achsWinkelGrad: number
  /** Ausdehnung entlang / quer zur Hauptachse (m) */
  laengeM: number
  tiefeM: number
  /** Mittelpunkt der Grundfläche in UTM */
  mitteOst: number
  mitteNord: number
}

type P3 = [number, number, number]

/** WGS84 → UTM Zone 32 (ETRS89, Meter). Standard-Transversal-Mercator-Reihe, Abweichung < 1 m. */
export function utm32AusWgs84(lat: number, lon: number): { ost: number; nord: number } {
  const a = 6378137.0, f = 1 / 298.257222101, k0 = 0.9996
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const p = (lat * Math.PI) / 180, l = ((lon - 9) * Math.PI) / 180
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  const T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = l * Math.cos(p)
  const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p))
  const ost = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000
  const nord = k0 * (M + N * Math.tan(p) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720))
  return { ost, nord }
}

/** Kachelname der NRW-Dateien (1-km-Raster): LoD2_32_<Ost-km>_<Nord-km>_1_NW.gml */
export function lod2KachelNrw(ost: number, nord: number): string {
  return `LoD2_32_${Math.floor(ost / 1000)}_${Math.floor(nord / 1000)}_1_NW.gml`
}

function posListen(block: string): P3[][] {
  const out: P3[][] = []
  const re = /<gml:posList[^>]*>([^<]+)<\/gml:posList>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    const v = m[1].trim().split(/\s+/).map(Number)
    const pts: P3[] = []
    for (let i = 0; i + 2 < v.length; i += 3) pts.push([v[i], v[i + 1], v[i + 2]])
    if (pts.length >= 3 && pts.every(p => p.every(Number.isFinite))) out.push(pts)
  }
  return out
}

function flaecheNormale(p: P3[]): { a: number; nx: number; ny: number; nz: number } {
  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < p.length - 1; i++) {
    const [x1, y1, z1] = p[i], [x2, y2, z2] = p[i + 1]
    nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2)
  }
  const L = Math.hypot(nx, ny, nz) || 1
  return { a: L / 2, nx: nx / L, ny: ny / L, nz: nz / L }
}

function teilBlock(block: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<bldg:${tag}[\\s>][\\s\\S]*?</bldg:${tag}>`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) out.push(m[0])
  return out
}

function wert(block: string, tag: string): string | null {
  const m = new RegExp(`<bldg:${tag}[^>]*>([^<]*)</bldg:${tag}>`).exec(block)
  return m ? m[1].trim() : null
}

function baueGebaeude(id: string, block: string): Lod2Gebaeude | null {
  const boden: P3[][] = teilBlock(block, 'GroundSurface').flatMap(posListen)
  const dach: P3[][] = teilBlock(block, 'RoofSurface').flatMap(posListen)
  if (!boden.length || !dach.length) return null

  let bodenZ = Infinity
  let grund = 0
  const grundPunkte: [number, number][] = []
  for (const p of boden) {
    grund += flaecheNormale(p).a
    for (const q of p) { bodenZ = Math.min(bodenZ, q[2]); grundPunkte.push([q[0], q[1]]) }
  }
  if (!grundPunkte.length || !Number.isFinite(bodenZ)) return null

  // Hauptachse = Richtung der längsten Grundrisskante (gewichtet über Kantenlänge)
  const winkel = new Map<number, number>()
  for (const p of boden) {
    for (let i = 0; i < p.length - 1; i++) {
      const dx = p[i + 1][0] - p[i][0], dy = p[i + 1][1] - p[i][1]
      const L = Math.hypot(dx, dy)
      if (L < 0.01) continue
      let w = (Math.atan2(dy, dx) * 180) / Math.PI
      w = ((w % 180) + 180) % 180
      const k = Math.round(w) % 180
      winkel.set(k, (winkel.get(k) ?? 0) + L)
    }
  }
  let best = 0, bestL = -1
  for (const [k, L] of winkel) if (L > bestL) { best = k; bestL = L }
  const c = Math.cos((best * Math.PI) / 180), s = Math.sin((best * Math.PI) / 180)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  let o0 = Infinity, o1 = -Infinity, n0 = Infinity, n1 = -Infinity
  for (const [x, y] of grundPunkte) {
    const u = x * c + y * s, v = -x * s + y * c
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
    o0 = Math.min(o0, x); o1 = Math.max(o1, x); n0 = Math.min(n0, y); n1 = Math.max(n1, y)
  }

  // Dach: Neigungen nach Fallrichtung gruppieren
  let traufeZ = Infinity, firstZ = -Infinity
  let steilFlaeche = 0, flachFlaeche = 0
  const richtungen = new Map<number, number>()
  let hauptNx = 0, hauptNy = 0, hauptA = 0
  for (const p of dach) {
    for (const q of p) { traufeZ = Math.min(traufeZ, q[2]); firstZ = Math.max(firstZ, q[2]) }
    const n = flaecheNormale(p)
    if (n.nz > 0.97) { flachFlaeche += n.a; continue }
    if (n.nz < 0.2) continue
    steilFlaeche += n.a
    if (n.a > hauptA) { hauptA = n.a; hauptNx = n.nx; hauptNy = n.ny }
    const rk = ((Math.round((Math.atan2(n.ny, n.nx) * 180) / Math.PI / 45) % 8) + 8) % 8
    richtungen.set(rk, (richtungen.get(rk) ?? 0) + n.a)
  }
  let dachForm: Lod2Gebaeude['dachForm'] = 'flachdach'
  if (steilFlaeche > flachFlaeche) dachForm = [...richtungen.values()].filter(a => a >= 0.15 * steilFlaeche).length >= 3 ? 'walmdach' : 'satteldach'
  if (dachForm === 'flachdach') traufeZ = firstZ

  // Bei einem Satteldach läuft der First quer zur Fallrichtung der größten Fläche
  let achsWinkel = best, laenge = u1 - u0, tiefe = v1 - v0
  if (dachForm === 'satteldach' && hauptA > 0) {
    let first = ((Math.atan2(hauptNx, -hauptNy) * 180) / Math.PI)
    first = ((first % 180) + 180) % 180
    const fc = Math.cos((first * Math.PI) / 180), fs = Math.sin((first * Math.PI) / 180)
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
    for (const [x, y] of grundPunkte) {
      const u = x * fc + y * fs, v = -x * fs + y * fc
      a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v)
    }
    achsWinkel = first; laenge = a1 - a0; tiefe = b1 - b0
  } else if (tiefe > laenge) {
    achsWinkel = (best + 90) % 180; const t = laenge; laenge = tiefe; tiefe = t
  }

  return {
    id,
    funktion: wert(block, 'function'),
    bodenZ,
    traufeZ,
    firstZ,
    dachForm,
    grundflaecheM2: grund,
    ost0: o0, ost1: o1, nord0: n0, nord1: n1,
    achsWinkelGrad: achsWinkel,
    laengeM: laenge,
    tiefeM: tiefe,
    mitteOst: (o0 + o1) / 2,
    mitteNord: (n0 + n1) / 2,
  }
}

/**
 * Liest alle Gebäude einer CityGML-Datei (Text). Optional nur Gebäude, deren Hülle den Suchbereich schneidet
 * (spart bei 50-MB-Kacheln viel Rechenzeit).
 */
export function leseLod2Gebaeude(xml: string, bereich?: { ost: number; nord: number; radiusM: number }): Lod2Gebaeude[] {
  const out: Lod2Gebaeude[] = []
  const re = /<bldg:Building\s[^>]*gml:id="([^"]+)"[^>]*>[\s\S]*?<\/bldg:Building>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const g = baueGebaeude(m[1], m[0])
    if (!g) continue
    if (bereich) {
      const r = bereich.radiusM
      if (g.ost1 < bereich.ost - r || g.ost0 > bereich.ost + r || g.nord1 < bereich.nord - r || g.nord0 > bereich.nord + r) continue
    }
    out.push(g)
  }
  return out
}

/** Gebäude am Punkt: das mit der Hülle, die den Punkt enthält (kleinste Fläche zuerst), sonst das nächste innerhalb von maxAbstandM. */
export function findeGebaeudeAmPunkt(liste: Lod2Gebaeude[], ost: number, nord: number, maxAbstandM = 15): Lod2Gebaeude | null {
  const drin = liste.filter(g => ost >= g.ost0 && ost <= g.ost1 && nord >= g.nord0 && nord <= g.nord1)
  const kand = drin.length ? drin : liste
  let best: Lod2Gebaeude | null = null
  let bestD = Infinity
  for (const g of kand) {
    const dx = Math.max(g.ost0 - ost, 0, ost - g.ost1), dy = Math.max(g.nord0 - nord, 0, nord - g.nord1)
    const d = Math.hypot(dx, dy)
    if (d < bestD || (d === bestD && best && g.grundflaecheM2 < best.grundflaecheM2)) { best = g; bestD = d }
  }
  return best && bestD <= maxAbstandM ? best : null
}

/** Vorschlag im Format der Baukörper-Erkennung (ein Teil, kein Turm). */
export function lod2ZuBaukoerper(g: Lod2Gebaeude): BaukoerperErgebnis {
  const traufe = Math.max(0, g.traufeZ - g.bodenZ)
  const first = Math.max(0, g.firstZ - g.bodenZ)
  const teil: ErkannterTeil = {
    laengeM: g.laengeM,
    tiefeM: g.tiefeM,
    versatzM: 0,
    hoeheM: traufe,
    dachHoeheM: g.dachForm === 'flachdach' ? 0 : Math.max(0, first - traufe),
    dachForm: g.dachForm,
  }
  return {
    teile: [teil],
    tiefeMaxM: g.tiefeM,
    laengeM: g.laengeM,
    gesamtHoeheM: first,
    turmIndex: null,
    mehrteilig: false,
    genauigkeitM: 0.5,
    hinweise: [
      `Amtliches 3D-Gebäudemodell (LoD2), Gebäude ${g.id}${g.funktion ? `, Nutzung ${g.funktion}` : ''}.`,
      'LoD2 vereinfacht Dachformen und lässt Türme, Gauben und Anbauten teils weg – bitte prüfen. Quellenangabe laut Datenlizenz des Landes nicht vergessen.',
    ],
  }
}
