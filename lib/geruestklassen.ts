// Lastklassen und Breitenklassen nach DIN EN 12811-1 für die Auswahl im Aufmaß.
// Die Lastklasse wählt der Nutzer selbst; das Gewerk liefert nur einen VORSCHLAG.

export const LASTKLASSEN: { klasse: number; q1KnM2: number }[] = [
  { klasse: 1, q1KnM2: 0.75 },
  { klasse: 2, q1KnM2: 1.5 },
  { klasse: 3, q1KnM2: 2.0 },
  { klasse: 4, q1KnM2: 3.0 },
  { klasse: 5, q1KnM2: 4.5 },
  { klasse: 6, q1KnM2: 6.0 },
];

/** Breitenklassen W06–W24: Mindest-Belagbreite in m (Obergrenze = nächste Klasse). */
export const BREITENKLASSEN: { klasse: string; vonM: number; bisM: number | null }[] = [
  { klasse: 'W06', vonM: 0.6, bisM: 0.9 },
  { klasse: 'W09', vonM: 0.9, bisM: 1.2 },
  { klasse: 'W12', vonM: 1.2, bisM: 1.5 },
  { klasse: 'W15', vonM: 1.5, bisM: 1.8 },
  { klasse: 'W18', vonM: 1.8, bisM: 2.1 },
  { klasse: 'W21', vonM: 2.1, bisM: 2.4 },
  { klasse: 'W24', vonM: 2.4, bisM: null },
];

export function breitenklasseText(b: { klasse: string; vonM: number; bisM: number | null }): string {
  const f = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return b.bisM == null ? `${b.klasse} (ab ${f(b.vonM)} m)` : `${b.klasse} (${f(b.vonM)} bis unter ${f(b.bisM)} m)`;
}

/** Breitenklasse zu einer Belagbreite in m, sonst null (unter 0,6 m gibt es keine). */
export function breitenklasseFuerBreite(breiteM: number): string | null {
  if (!(breiteM >= 0.6)) return null;
  for (let i = BREITENKLASSEN.length - 1; i >= 0; i--) if (breiteM >= BREITENKLASSEN[i].vonM) return BREITENKLASSEN[i].klasse;
  return null;
}

// Mindestklassen nach DGUV Information 201-011: Putz-, Dachdeckungs-, Maler- und
// Fassadenbekleidungsarbeiten erfordern mindestens LK 3 und W06. Dach steht hier bewusst bei LK 4 (Annahme: Material
// wird gelagert, schwere Baustoffe/Bauteile = LK 4 bis 6); das ist nicht aus der Norm abgeleitet, die Statik entscheidet.
const LK_JE_GEWERK: Record<string, number> = {
  'WDVS/Fassade': 3, Putz: 3, Maler: 3, Dach: 4,
};

/** Vorschlag aus den gewählten Gewerken: die HÖCHSTE passende Klasse (bei Dach + Putz also LK 4).
 *  Ohne bekanntes Gewerk: LK 2. */
export function vorschlagLastklasse(gewerke: string[]): { klasse: number; grund: string } {
  let best = 0; let grund = '';
  for (const g of gewerke || []) {
    const lk = LK_JE_GEWERK[g];
    if (lk && lk > best) { best = lk; grund = g; }
  }
  return best ? { klasse: best, grund } : { klasse: 2, grund: '' };
}

/** DIN EN 12811-1 (laut Baunetz Wissen): Für Lastklasse 4 bis 6 ist mindestens die Breitenklasse W09 erforderlich. */
export const MIN_BREITE_AB_LK4_M = 0.9

/** Mindest-Belagbreite in m, die die Norm für eine Lastklasse verlangt; null = keine Vorgabe bekannt (LK 1–3). */
export function mindestBreiteFuerLastklasse(lk: number | undefined): number | null {
  return lk !== undefined && lk >= 4 ? MIN_BREITE_AB_LK4_M : null
}
