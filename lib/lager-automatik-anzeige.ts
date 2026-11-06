// ============================================================
// SCAFFOLD OS – Anzeige des Ergebnisses der Annahme-Automatik
//
// Bei der Annahme eines Angebots reserviert lib/angebot-annahme.ts Material,
// legt Transportaufträge und eine Fahrt an. Das Ergebnis steht in
// projects.data.lagerAutomatikErgebnis. Diese reine Funktion (ohne Browser/DB)
// macht daraus Anzeigezeilen, damit nicht gefundene Artikel, fehlender Bestand
// und fehlgeschlagene Transportaufträge nicht untergehen.
// ============================================================

export type AnzeigeTon = 'ok' | 'warn' | 'fehler'
export interface AnzeigeZeile { ton: AnzeigeTon; text: string }

const liste = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [])
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export function lagerAutomatikZeilen(ergebnis: unknown): AnzeigeZeile[] {
  if (!ergebnis || typeof ergebnis !== 'object' || Array.isArray(ergebnis)) return []
  const r = ergebnis as Record<string, unknown>
  const z: AnzeigeZeile[] = []

  const fehler = text(r.fehler)
  if (fehler) z.push({ ton: 'fehler', text: `Die Lager-Automatik ist mit einem Fehler abgebrochen: ${fehler}` })
  const hinweis = text(r.hinweis)
  if (hinweis) z.push({ ton: 'warn', text: hinweis })

  const reserviert = liste(r.reserviert)
  if (reserviert.length > 0) z.push({ ton: 'ok', text: `${reserviert.length} Position${reserviert.length === 1 ? '' : 'en'} im Lager reserviert.` })

  for (const t of liste(r.transportFehler)) z.push({ ton: 'fehler', text: `Transportauftrag fehlt: ${t}` })

  const gruppen: [unknown, string][] = [
    [r.nichtGefunden, 'Nicht im Lager gefunden (bitte von Hand reservieren)'],
    [r.nichtGenugBestand, 'Zu wenig Bestand'],
    [r.einheitenKonflikt, 'Einheiten passen nicht (nichts gebucht)'],
  ]
  for (const [wert, titel] of gruppen) {
    const l = liste(wert)
    if (l.length > 0) z.push({ ton: 'warn', text: `${titel}: ${l.join('; ')}` })
  }

  const tour = r.tour && typeof r.tour === 'object' && !Array.isArray(r.tour) ? (r.tour as Record<string, unknown>) : null
  if (tour) {
    const name = text(tour.tourName)
    if (name) {
      const teile = [text(tour.fahrzeug), text(tour.fahrer), text(tour.datum)].filter(Boolean)
      z.push({ ton: 'ok', text: `Fahrt angelegt: ${name}${teile.length > 0 ? ` (${teile.join(', ')})` : ''}.` })
    }
    const th = text(tour.hinweis)
    if (th) z.push({ ton: 'warn', text: `Fahrt: ${th}` })
  }
  return z
}
