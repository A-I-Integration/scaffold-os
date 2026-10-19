// ============================================================
// SCAFFOLD OS – Umriss per Klick zeichnen: Fangen (Raster, Punkte, Waagerecht/Senkrecht)
// und Umwandlung der gezeichneten Figuren in einen DXF-Text, der durch denselben Leseweg
// läuft wie eine hochgeladene DXF (lib/cad/dxf-umriss.ts): Teile, Höhen, Hinweise.
// Koordinaten in Metern; x nach rechts, z nach unten (wie die Vorschau im Umriss-Editor).
// ============================================================

export interface ZPunkt { x: number; z: number }

export interface FangOptionen {
  /** Rasterweite in m (0 = aus) */
  rasterM: number
  /** Fangradius in m für vorhandene Punkte */
  punktRadiusM: number
  /** Fangradius in m für Waagerecht/Senkrecht zum vorigen Punkt */
  achsenRadiusM: number
}

export type FangArt = 'punkt' | 'achse' | 'raster' | 'frei'

const r3 = (v: number) => Math.round(v * 1000) / 1000

/**
 * Rastet den Mauspunkt `p` ein. Reihenfolge: vorhandener Punkt (auch der Startpunkt der Figur) →
 * Achse zum vorigen Punkt (mit Raster auf der anderen Koordinate) → Raster → frei.
 */
export function fangePunkt(p: ZPunkt, vorher: ZPunkt | null, andere: ZPunkt[], opt: FangOptionen): { punkt: ZPunkt; art: FangArt } {
  let best: ZPunkt | null = null, bestD = opt.punktRadiusM
  for (const q of andere) {
    const d = Math.hypot(q.x - p.x, q.z - p.z)
    if (d <= bestD) { best = q; bestD = d }
  }
  if (best) return { punkt: { x: best.x, z: best.z }, art: 'punkt' }
  const raster = (v: number) => (opt.rasterM > 0 ? r3(Math.round(v / opt.rasterM) * opt.rasterM) : r3(v))
  if (vorher) {
    const dx = Math.abs(p.x - vorher.x), dz = Math.abs(p.z - vorher.z)
    if (dz <= opt.achsenRadiusM && dz <= dx) return { punkt: { x: raster(p.x), z: vorher.z }, art: 'achse' }
    if (dx <= opt.achsenRadiusM && dx < dz) return { punkt: { x: vorher.x, z: raster(p.z) }, art: 'achse' }
  }
  return { punkt: { x: raster(p.x), z: raster(p.z) }, art: opt.rasterM > 0 ? 'raster' : 'frei' }
}

/** Länge einer Kante in m */
export const kantenLaenge = (a: ZPunkt, b: ZPunkt) => Math.hypot(b.x - a.x, b.z - a.z)

/** Eine Figur (≥ 3 Ecken) ist brauchbar, wenn sie keine doppelten Nachbarpunkte und eine Fläche > 0 hat. */
export function figurPruefen(f: ZPunkt[]): string | null {
  if (f.length < 3) return 'Eine Figur braucht mindestens 3 Ecken.'
  for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length]
    if (kantenLaenge(a, b) < 0.01) return 'Zwei Ecken liegen auf demselben Punkt.'
  }
  let s = 0
  for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; s += a.x * b.z - b.x * a.z }
  if (Math.abs(s) / 2 < 0.01) return 'Die Figur hat keine Fläche.'
  return null
}

/**
 * DXF-Text (ASCII, Meter via $INSUNITS = 6) aus gezeichneten Figuren: je Figur eine geschlossene LWPOLYLINE auf der Ebene WAND.
 * DXF-y = −z, damit „vorne/hinten“ so ankommt, wie es gezeichnet wurde (die Szene dreht y wieder zu z).
 */
export function figurenZuDxf(figuren: ZPunkt[][]): string {
  const z = (...p: (string | number)[]) => p.join('\n') + '\n'
  let out = z(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC')
  out += z(0, 'SECTION', 2, 'ENTITIES')
  for (const f of figuren) {
    out += z(0, 'LWPOLYLINE', 8, 'WAND', 90, f.length, 70, 1)
    for (const p of f) out += z(10, r3(p.x), 20, r3(-p.z))
  }
  out += z(0, 'ENDSEC', 0, 'EOF')
  return out
}
