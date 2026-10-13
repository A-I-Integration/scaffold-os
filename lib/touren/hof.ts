// ============================================================
// SCAFFOLD OS – Hilfsfunktionen "Vom Hof gefahren / Zurück auf dem Hof"
//
// Reine Funktionen (kein DB-/Browser-Zugriff), damit sie testbar sind.
// Genutzt von app/api/tours/hof/route.ts, app/meine-touren/page.tsx und
// app/touren/page.tsx.
// ============================================================

/** Fahrtdauer in Minuten (Hof -> Hof). null, wenn eine Zeit fehlt oder unplausibel ist. */
export function fahrtdauerMinuten(abfahrt?: string | null, rueckkehr?: string | null): number | null {
  if (!abfahrt || !rueckkehr) return null;
  const a = Date.parse(abfahrt);
  const b = Date.parse(rueckkehr);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

/** "2 Std 33 Min", "45 Min", "3 Std" – leer bei null. */
export function formatDauer(min: number | null): string {
  if (min === null || min < 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} Min`;
  if (m === 0) return `${h} Std`;
  return `${h} Std ${m} Min`;
}

/** Uhrzeit "HH:MM" in deutscher Zeit; leer bei fehlendem/ungültigem Wert. */
export function formatUhrzeit(iso?: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}

/** Sind lat/lng echte, plausible Koordinaten? */
export function istGueltigePosition(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    && !(lat === 0 && lng === 0);
}

/**
 * Erkennt die Datenbank-Fehlermeldung "Spalte existiert nicht" für die
 * Hof-Spalten (SQL phase-100 noch nicht ausgeführt). Dann arbeitet die
 * Route ohne Zeitstempel weiter, statt den Mitarbeiter zu blockieren.
 */
export function hofSpalteFehlt(fehlertext: string): boolean {
  const t = fehlertext || '';
  const betrifftHof = /(departed|returned)_(at|lat|lng)/.test(t);
  const spalteFehlt = /PGRST204|42703|does not exist|Could not find/i.test(t);
  return betrifftHof && spalteFehlt;
}

/**
 * Ist die Standort-Erfassung bei Touren eingeschaltet? Nur ein ausdrückliches
 * `false` (Einstellungen -> "Standort bei Touren erfassen" aus) schaltet sie ab;
 * fehlt die Einstellung (Spalte noch nicht angelegt), gilt der Standard "an".
 */
export function standortErfassungAn(company: { tour_standort_erfassen?: unknown } | null | undefined): boolean {
  return !(company && company.tour_standort_erfassen === false);
}
