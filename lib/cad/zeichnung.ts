// ============================================================
// SCAFFOLD OS – freie Zeichnung im Grundriss: Linie, Polylinie, Kreis, Maßlinie.
// Koordinaten in Metern im Grundriss (x nach rechts, z nach unten, wie die Grundriss-Ansicht).
// Die Figuren sind reine Planungshilfen (Hilfslinien, Maße, Bemerkungen im Plan) und
// verändern weder Gerüst noch Stückliste.
// ============================================================

export interface ZeichnungsPunkt { x: number; z: number }
export type FigurArt = 'linie' | 'polylinie' | 'kreis' | 'mass'

export interface Figur {
  id: string
  art: FigurArt
  /** linie/mass: 2 Punkte; polylinie: ≥ 2; kreis: 1 Punkt (Mitte) */
  punkte: ZeichnungsPunkt[]
  /** nur Kreis, in m */
  radiusM?: number
}

export const FIGUR_NAME: Record<FigurArt, string> = { linie: 'Linie', polylinie: 'Polylinie', kreis: 'Kreis', mass: 'Maß' }

const r2 = (v: number) => Math.round(v * 100) / 100
export const abstand = (a: ZeichnungsPunkt, b: ZeichnungsPunkt) => Math.hypot(b.x - a.x, b.z - a.z)

/** Länge einer Linie/Polylinie/Maßlinie bzw. Umfang eines Kreises, in m */
export function figurLaenge(f: Figur): number {
  if (f.art === 'kreis') return r2(2 * Math.PI * (f.radiusM ?? 0))
  let s = 0
  for (let i = 1; i < f.punkte.length; i++) s += abstand(f.punkte[i - 1], f.punkte[i])
  return r2(s)
}

/** Fläche eines Kreises in m²; sonst null */
export function figurFlaeche(f: Figur): number | null {
  return f.art === 'kreis' ? r2(Math.PI * (f.radiusM ?? 0) ** 2) : null
}

const de = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })

/** Kurzbeschreibung für Listen und Beschriftung im Plan */
export function beschreibeFigur(f: Figur): string {
  if (f.art === 'kreis') return `Kreis, Radius ${de(f.radiusM ?? 0)} m, Umfang ${de(figurLaenge(f))} m, Fläche ${de(figurFlaeche(f) ?? 0)} m²`
  if (f.art === 'polylinie') return `Polylinie, ${f.punkte.length} Punkte, Länge ${de(figurLaenge(f))} m`
  if (f.art === 'mass') return `Maß ${de(figurLaenge(f))} m`
  return `Linie, Länge ${de(figurLaenge(f))} m`
}

/** Ist die Figur brauchbar (genug Punkte, keine Länge/Radius 0, endliche Zahlen)? */
export function figurGueltig(f: Figur): boolean {
  if (!f.punkte.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))) return false
  if (f.art === 'kreis') return f.punkte.length === 1 && Number.isFinite(f.radiusM) && (f.radiusM as number) >= 0.01
  if (f.art === 'polylinie') return f.punkte.length >= 2 && figurLaenge(f) >= 0.01
  return f.punkte.length === 2 && figurLaenge(f) >= 0.01
}

/** Figuren aus einer Projektdatei: unbekannte oder kaputte Einträge werden verworfen. */
export function leseFiguren(roh: unknown): Figur[] {
  if (!Array.isArray(roh)) return []
  const aus: Figur[] = []
  for (const x of roh.slice(0, 500)) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (typeof o.id !== 'string' || !['linie', 'polylinie', 'kreis', 'mass'].includes(o.art as string) || !Array.isArray(o.punkte)) continue
    const punkte = (o.punkte as unknown[]).slice(0, 500).map((p) => {
      const q = p as Record<string, unknown> | null
      return q && typeof q.x === 'number' && typeof q.z === 'number' ? { x: q.x, z: q.z } : null
    })
    if (punkte.some((p) => p === null)) continue
    const f: Figur = { id: o.id.slice(0, 60), art: o.art as FigurArt, punkte: punkte as ZeichnungsPunkt[], ...(typeof o.radiusM === 'number' ? { radiusM: o.radiusM } : {}) }
    if (figurGueltig(f)) aus.push(f)
  }
  return aus
}
