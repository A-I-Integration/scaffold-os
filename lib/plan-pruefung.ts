// Plausibilitätsprüfung für Werte, die aus einem Plan gelesen oder abgeschrieben wurden (auch Handschrift auf Scans).
// Idee: Einzelne Ziffern werden leicht falsch gelesen. Pläne enthalten aber Summen (Teile ergeben das Ganze).
// Passt eine Summe nicht, ist mindestens ein Wert falsch. Ein Wert, der in einer STIMMIGEN Summe vorkommt, gilt als bestätigt.
// Bleibt bei einer falschen Summe genau ein unbestätigter Wert übrig, nennen wir den Wert, der die Summe stimmig machen würde.

export type PlanWerte = Record<string, number | undefined>

export interface Summenregel {
  id: string
  text: string
  /** Namen der Teile */
  teile: string[]
  /** Name der Summe */
  summe: string
  /** erlaubte Abweichung (Rundung im Plan) */
  toleranz: number
}

export interface Pruefergebnis {
  regel: Summenregel
  status: 'ok' | 'falsch' | 'unvollstaendig'
  /** gerechnete Summe der Teile (nur wenn vollständig) */
  gerechnet?: number
  /** Abweichung gerechnet minus angegeben */
  abweichung?: number
  /** Werte, die als Fehlerquelle in Frage kommen (nicht durch eine stimmige Regel oder als gesichert bestätigt) */
  kandidaten?: string[]
  /** Hinweis: dieser Wert wäre stimmig (nur wenn eindeutig) */
  hinweis?: { name: string; stimmigerWert: number }
}

const r2 = (v: number): number => Math.round(v * 100) / 100

/** `gesichert`: Werte, die als verlässlich gelten (z. B. auf mehreren Plänen gleich gelesen oder gedruckt). */
export function pruefeSummen(werte: PlanWerte, regeln: Summenregel[], gesichert: string[] = []): Pruefergebnis[] {
  const haben = (n: string): boolean => typeof werte[n] === 'number' && Number.isFinite(werte[n] as number)
  const erst: Pruefergebnis[] = regeln.map((regel) => {
    const alle = [...regel.teile, regel.summe]
    if (!alle.every(haben)) return { regel, status: 'unvollstaendig' }
    const gerechnet = r2(regel.teile.reduce((s, n) => s + (werte[n] as number), 0))
    const abweichung = r2(gerechnet - (werte[regel.summe] as number))
    return { regel, status: Math.abs(abweichung) <= regel.toleranz ? 'ok' : 'falsch', gerechnet, abweichung }
  })
  // bestätigte Werte: kommen in mindestens einer stimmigen Regel vor
  const bestaetigt = new Set<string>(gesichert)
  for (const p of erst) if (p.status === 'ok') for (const n of [...p.regel.teile, p.regel.summe]) bestaetigt.add(n)
  return erst.map((p) => {
    if (p.status !== 'falsch') return p
    const kandidaten = [...p.regel.teile, p.regel.summe].filter((n) => !bestaetigt.has(n))
    if (kandidaten.length !== 1) return { ...p, kandidaten }
    const name = kandidaten[0]
    // Wert, der diese Regel stimmig macht
    const andere = p.regel.teile.filter((n) => n !== name).reduce((s, n) => s + (werte[n] as number), 0)
    const wert = name === p.regel.summe ? andere : (werte[p.regel.summe] as number) - andere
    return wert >= 0 ? { ...p, kandidaten, hinweis: { name, stimmigerWert: r2(wert) } } : { ...p, kandidaten }
  })
}

const SEITEN: Array<[string, string]> = [['sued', 'Süd'], ['west', 'West'], ['nord', 'Nord'], ['ost', 'Ost']]

/** Standardregeln für Turmeinrüstungen mit zwei Bauabschnitten (Fassadenflächen je Seite, Höhen). */
export const TURM_REGELN: Summenregel[] = [
  ...SEITEN.map(([k, n]): Summenregel => ({ id: `seite-${k}`, text: `${n}: 1. BA + 2. BA = Fassade gesamt`, teile: [`${k}_ba1`, `${k}_ba2`], summe: `${k}_gesamt`, toleranz: 1.5 })),
  { id: 'summe-ba1', text: '1. BA: Summe der Seiten = Summe 1. BA', teile: SEITEN.map(([k]) => `${k}_ba1`), summe: 'summe_ba1', toleranz: 1.5 },
  { id: 'summe-ba2', text: '2. BA: Summe der Seiten = Summe 2. BA', teile: SEITEN.map(([k]) => `${k}_ba2`), summe: 'summe_ba2', toleranz: 1.5 },
  { id: 'hoehe', text: 'Höhe 1. BA + Höhe 2. BA = Schafthöhe gesamt', teile: ['h_ba1', 'h_ba2'], summe: 'h_gesamt', toleranz: 0.2 },
]
