// ============================================================
// SCAFFOLD OS – Materialmanager: Stückliste in Bauabschnitte teilen (reine Logik, ohne DB)
//
// Regeln (stehen auch im Ergebnis unter „hinweise“, damit nichts verdeckt passiert):
//   • Eine Position ist über die Artikelnummer, sonst über den Namen (klein geschrieben, getrimmt) eindeutig.
//     Mehrfach vorkommende Positionen werden zusammengezählt.
//   • Jeder Abschnitt bekommt je Position eine Menge. Summe über alle Abschnitte ≤ Gesamtmenge.
//     Was nicht verteilt ist, steht als „Rest“ (nicht zugeordnet). Wird mehr verteilt als vorhanden, gibt es eine Warnung –
//     es wird nichts stillschweigend gekürzt.
//   • Automatisch verteilen (gleichmäßig oder nach Anteil, z. B. m²): ganze Stückzahlen, Summe bleibt exakt gleich
//     (größter Rest zuerst). Nichts geht beim Runden verloren.
//   • Preise kommen hier nicht vor: Verladelisten sind für Lager und Fahrer.
// ============================================================

export interface MaterialPosition {
  name: string
  quantity: number
  unit?: string
  articleNumber?: string | null
  category?: string
  /** Gewicht je Stück in kg; 0/leer = unbekannt */
  weightKg?: number
}

export interface Bauabschnitt {
  id: string
  name: string
  /** Menge je Positions-Schlüssel (siehe positionsSchluessel) */
  mengen: Record<string, number>
}

export interface ListenZeile {
  schluessel: string
  articleNumber: string
  name: string
  category: string
  menge: number
  einheit: string
  gewichtKg: number
}

export interface AbschnittErgebnis {
  id: string
  name: string
  zeilen: ListenZeile[]
  summeMenge: number
  gewichtKg: number
}

export interface Teilung {
  gesamt: ListenZeile[]
  abschnitte: AbschnittErgebnis[]
  /** nicht verteilter Rest je Position (nur Zeilen mit Menge > 0) */
  rest: ListenZeile[]
  warnungen: string[]
  hinweise: string[]
}

const r1 = (n: number) => Math.round(n * 10) / 10
const zahl = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

export function positionsSchluessel(p: { articleNumber?: string | null; name: string }): string {
  const nr = (p.articleNumber ?? '').toString().trim()
  return nr ? `nr:${nr.toLowerCase()}` : `name:${(p.name ?? '').toString().trim().toLowerCase()}`
}

/** Gleiche Positionen zusammenzählen; Reihenfolge der ersten Nennung bleibt. Zeilen ohne Menge fallen weg. */
export function fasseZusammen(positionen: MaterialPosition[]): ListenZeile[] {
  const map = new Map<string, ListenZeile>()
  for (const p of positionen) {
    const menge = zahl(p.quantity)
    if (menge <= 0) continue
    const schluessel = positionsSchluessel(p)
    const vorhanden = map.get(schluessel)
    if (vorhanden) {
      vorhanden.menge += menge
      if (!vorhanden.gewichtKg) vorhanden.gewichtKg = zahl(p.weightKg)
    } else {
      map.set(schluessel, {
        schluessel,
        articleNumber: (p.articleNumber ?? '').toString().trim(),
        name: (p.name ?? '').toString().trim(),
        category: p.category ?? '',
        menge,
        einheit: p.unit || 'Stk',
        gewichtKg: zahl(p.weightKg),
      })
    }
  }
  return [...map.values()]
}

const zeileMit = (z: ListenZeile, menge: number): ListenZeile => ({ ...z, menge })

/** Teilt die Stückliste nach den Mengen der Abschnitte auf. */
export function teileStueckliste(positionen: MaterialPosition[], abschnitte: Bauabschnitt[]): Teilung {
  const gesamt = fasseZusammen(positionen)
  const bekannt = new Map(gesamt.map((z) => [z.schluessel, z]))
  const warnungen: string[] = []
  const verteilt = new Map<string, number>()

  const ergebnis: AbschnittErgebnis[] = abschnitte.map((a) => {
    const zeilen: ListenZeile[] = []
    for (const [schluessel, roh] of Object.entries(a.mengen ?? {})) {
      const menge = zahl(roh)
      if (menge <= 0) continue
      const z = bekannt.get(schluessel)
      if (!z) {
        warnungen.push(`Abschnitt „${a.name}“: Position „${schluessel.replace(/^(nr|name):/, '')}“ steht nicht mehr in der Stückliste und wird nicht ausgegeben.`)
        continue
      }
      if (z.einheit.toLowerCase() === 'stk' && !Number.isInteger(menge)) {
        warnungen.push(`Abschnitt „${a.name}“: ${z.name} hat ${menge} Stk – Stückzahlen sollten ganze Zahlen sein.`)
      }
      zeilen.push(zeileMit(z, menge))
      verteilt.set(schluessel, (verteilt.get(schluessel) ?? 0) + menge)
    }
    // Reihenfolge wie in der Stückliste
    const index = new Map(gesamt.map((z, i) => [z.schluessel, i]))
    zeilen.sort((x, y) => (index.get(x.schluessel)! - index.get(y.schluessel)!))
    return {
      id: a.id,
      name: a.name,
      zeilen,
      summeMenge: zeilen.reduce((s, z) => s + z.menge, 0),
      gewichtKg: r1(zeilen.reduce((s, z) => s + z.menge * z.gewichtKg, 0)),
    }
  })

  const rest: ListenZeile[] = []
  for (const z of gesamt) {
    const v = verteilt.get(z.schluessel) ?? 0
    if (v > z.menge + 1e-9) warnungen.push(`${z.name}: ${v} auf Abschnitte verteilt, aber nur ${z.menge} in der Stückliste.`)
    else if (z.menge - v > 1e-9) rest.push(zeileMit(z, Math.round((z.menge - v) * 1e6) / 1e6))
  }

  return {
    gesamt,
    abschnitte: ergebnis,
    rest,
    warnungen,
    hinweise: [
      'Positionen werden über die Artikelnummer, sonst über den Namen zusammengeführt.',
      'Der Rest ist Material, das noch keinem Abschnitt zugeordnet ist.',
      'Gewichte stammen aus der Stückliste; Positionen ohne Gewicht zählen mit 0 kg.',
    ],
  }
}

/** Verteilt eine ganze Menge nach Gewichten (größter Rest zuerst); Summe bleibt exakt `menge`. */
export function verteileGanzzahlig(menge: number, gewichte: number[]): number[] {
  const n = gewichte.length
  if (!n) return []
  const m = Math.max(0, Math.floor(zahl(menge)))
  const g = gewichte.map(zahl)
  const summe = g.reduce((s, x) => s + x, 0)
  const anteile = summe > 0 ? g.map((x) => (m * x) / summe) : g.map(() => m / n)
  const unten = anteile.map((a) => Math.floor(a + 1e-9))
  let fehlt = m - unten.reduce((s, x) => s + x, 0)
  const ordnung = anteile
    .map((a, i) => ({ i, rest: a - Math.floor(a + 1e-9) }))
    .sort((x, y) => y.rest - x.rest || x.i - y.i)
  for (let k = 0; fehlt > 0 && k < ordnung.length; k++, fehlt--) unten[ordnung[k].i]++
  return unten
}

/**
 * Verteilt alle Positionen auf neue Abschnitte nach Anteil (z. B. m² je Abschnitt; ohne Anteile: gleichmäßig).
 * Nicht ganzzahlige Mengen (z. B. Meter) werden auf zwei Stellen verteilt, die Summe bleibt erhalten.
 */
export function verteileAufAbschnitte(
  positionen: MaterialPosition[],
  abschnitte: { id: string; name: string; anteil?: number }[],
): Bauabschnitt[] {
  const gesamt = fasseZusammen(positionen)
  const gewichte = abschnitte.map((a) => zahl(a.anteil) || (abschnitte.some((x) => zahl(x.anteil)) ? 0 : 1))
  const aus: Bauabschnitt[] = abschnitte.map((a) => ({ id: a.id, name: a.name, mengen: {} }))
  for (const z of gesamt) {
    const teile = Number.isInteger(z.menge)
      ? verteileGanzzahlig(z.menge, gewichte)
      : verteileGanzzahlig(Math.round(z.menge * 100), gewichte).map((x) => x / 100)
    teile.forEach((t, i) => { if (t > 0) aus[i].mengen[z.schluessel] = t })
  }
  return aus
}

/** Ein Abschnitt bekommt den kompletten Rest (praktisch für „letzter Abschnitt = alles übrige“). */
export function restInAbschnitt(positionen: MaterialPosition[], abschnitte: Bauabschnitt[], zielId: string): Bauabschnitt[] {
  const t = teileStueckliste(positionen, abschnitte)
  return abschnitte.map((a) => {
    if (a.id !== zielId) return a
    const mengen = { ...a.mengen }
    for (const z of t.rest) mengen[z.schluessel] = (zahl(mengen[z.schluessel])) + z.menge
    return { ...a, mengen }
  })
}
