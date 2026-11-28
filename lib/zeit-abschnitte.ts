// ============================================================
// SCAFFOLD OS – Tagesabschnitte der Zeiterfassung
// Ein Arbeitstag wird in Abschnitte gegliedert: Baustelle, Fahrt vom Hof, Pause, Schlechtwetter, Fortbildung.
// Die Stempelzeit (time_entries) bleibt die Grundlage für die Stunden; die Abschnitte zeigen, wie der Tag verlief,
// und machen Lücken und Abweichungen sichtbar. Sie ändern die gebuchten Stunden nicht.
// ============================================================

export const ABSCHNITT_ARTEN = [
  { value: 'baustelle', label: 'Zeit auf der Baustelle', arbeit: true, zulagen: true },
  { value: 'fahrt_hof', label: 'Fahrt vom Hof', arbeit: true, zulagen: true },
  { value: 'fahrt_zum_hof', label: 'Fahrt zum Hof', arbeit: true, zulagen: true },
  { value: 'pause', label: 'Pause', arbeit: false, zulagen: true },
  { value: 'schlechtwetter', label: 'Schlechtwetter', arbeit: false, zulagen: true },
  { value: 'fortbildung', label: 'Fortbildung (ohne Zulagen)', arbeit: true, zulagen: false },
] as const;

export type AbschnittArt = (typeof ABSCHNITT_ARTEN)[number]['value'];
export const ABSCHNITT_LABEL: Record<string, string> = Object.fromEntries(ABSCHNITT_ARTEN.map(a => [a.value, a.label]));
/** Abschnittsarten, für die es keine Zulagen (z. B. Spesen) gibt. Wird in Paket 2 (Spesen) ausgewertet. */
export const OHNE_ZULAGEN: string[] = ABSCHNITT_ARTEN.filter(a => !a.zulagen).map(a => a.value);

export interface Abschnitt { id?: string; employee_id: string; work_date: string; art: string; start_time: string; end_time: string; project_id?: string | null; note?: string | null; quelle?: string }

const MAX_MINUTEN = 24 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kalendertag (JJJJ-MM-TT) eines Zeitpunkts in deutscher Zeit. */
export function berlinDatum(iso: string): string {
  const d = new Date(iso);
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return t;
}

export const minutenZwischen = (von: string, bis: string) => Math.round((Date.parse(bis) - Date.parse(von)) / 60000);

export type AbschnittErgebnis =
  | { ok: true; daten: { employee_id: string; work_date: string; art: string; start_time: string; end_time: string; project_id: string | null; note: string | null } }
  | { ok: false; fehler: string };

export function pruefeAbschnitt(e: Record<string, unknown>): AbschnittErgebnis {
  if (!UUID.test(String(e.employee_id ?? ''))) return { ok: false, fehler: 'Bitte einen Mitarbeiter wählen.' };
  const art = String(e.art ?? '');
  if (!ABSCHNITT_ARTEN.some(a => a.value === art)) return { ok: false, fehler: 'Bitte die Art des Abschnitts wählen.' };
  const von = String(e.start_time ?? ''), bis = String(e.end_time ?? '');
  if (!von || !bis || Number.isNaN(Date.parse(von)) || Number.isNaN(Date.parse(bis))) return { ok: false, fehler: 'Bitte Von und Bis als Uhrzeit angeben.' };
  const dauer = minutenZwischen(von, bis);
  if (dauer <= 0) return { ok: false, fehler: 'Das Ende liegt nicht nach dem Beginn.' };
  if (dauer > MAX_MINUTEN) return { ok: false, fehler: 'Ein Abschnitt darf höchstens 24 Stunden dauern.' };
  const tag = String(e.work_date ?? berlinDatum(von));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag) || Number.isNaN(Date.parse(tag + 'T00:00:00Z'))) return { ok: false, fehler: 'Das Datum ist ungültig.' };
  if (berlinDatum(von) !== tag) return { ok: false, fehler: 'Der Beginn liegt nicht an dem gewählten Tag.' };
  const projekt = e.project_id ? String(e.project_id) : null;
  if (projekt && !UUID.test(projekt)) return { ok: false, fehler: 'Die Baustelle ist ungültig.' };
  const note = e.note ? String(e.note).trim().slice(0, 300) || null : null;
  return { ok: true, daten: { employee_id: String(e.employee_id), work_date: tag, art, start_time: new Date(von).toISOString(), end_time: new Date(bis).toISOString(), project_id: projekt, note } };
}

/** Überschneidet sich der neue Abschnitt mit einem vorhandenen? (ignoreId: der Abschnitt, der gerade geändert wird) */
export function ueberschneidet(neu: { start_time: string; end_time: string }, vorhanden: { id?: string; start_time: string; end_time: string }[], ignoreId?: string): boolean {
  const a = Date.parse(neu.start_time), b = Date.parse(neu.end_time);
  return vorhanden.some(v => v.id !== ignoreId && Date.parse(v.start_time) < b && Date.parse(v.end_time) > a);
}

export interface TagesEintrag { employee_id: string; start_time: string | null; end_time: string | null; hours: number | null; break_minutes: number | null }

export interface Tageszeile {
  employee_id: string;
  beginn: string | null; ende: string | null;
  bruttoMinuten: number;          // Stempelzeit von Beginn bis Ende
  gebuchtStunden: number;         // netto laut Stempelzeit
  pauseGebucht: number;           // Pause, die die Stempelzeit abzieht
  pauseErfasst: number;           // Pausen-Abschnitte
  minuten: Record<string, number>; // je Art
  erfasstMinuten: number;         // alle Abschnitte außer Pause
  hinweise: string[];
}

/** Fasst Stempelzeit und Abschnitte eines Mitarbeiters für einen Tag zusammen und nennt Auffälligkeiten. */
export function tageszeile(employeeId: string, eintraege: TagesEintrag[], abschnitte: Abschnitt[]): Tageszeile {
  const e = eintraege.filter(x => x.employee_id === employeeId);
  const a = abschnitte.filter(x => x.employee_id === employeeId);
  const starts = e.map(x => x.start_time).filter(Boolean) as string[];
  const ends = e.map(x => x.end_time).filter(Boolean) as string[];
  const beginn = starts.length ? starts.reduce((m, s) => (Date.parse(s) < Date.parse(m) ? s : m)) : null;
  const ende = ends.length ? ends.reduce((m, s) => (Date.parse(s) > Date.parse(m) ? s : m)) : null;
  const brutto = beginn && ende && Date.parse(ende) > Date.parse(beginn) ? minutenZwischen(beginn, ende) : 0;
  const minuten: Record<string, number> = {};
  for (const x of a) minuten[x.art] = (minuten[x.art] || 0) + minutenZwischen(x.start_time, x.end_time);
  const pauseGebucht = e.reduce((s, x) => s + (x.break_minutes || 0), 0);
  const pauseErfasst = minuten.pause || 0;
  const erfasst = Object.entries(minuten).filter(([k]) => k !== 'pause').reduce((s, [, v]) => s + v, 0);
  const gebucht = Math.round(e.reduce((s, x) => s + (x.hours || 0), 0) * 100) / 100;

  const hinweise: string[] = [];
  if (e.some(x => x.start_time && !x.end_time)) hinweise.push('Der Tag ist noch nicht ausgestempelt.');
  if (a.length && pauseGebucht !== pauseErfasst && brutto > 0) hinweise.push(`Pause: ${pauseErfasst} min eingetragen, die Stempelzeit zieht ${pauseGebucht} min ab.`);
  if (brutto > 0 && a.length) {
    const lueckeMin = brutto - erfasst - pauseErfasst;
    if (lueckeMin > 15) hinweise.push(`${lueckeMin} min der Stempelzeit sind keinem Abschnitt zugeordnet.`);
  }
  if (beginn && ende) {
    const aussen = a.filter(x => Date.parse(x.start_time) < Date.parse(beginn) || Date.parse(x.end_time) > Date.parse(ende));
    if (aussen.length) hinweise.push('Ein Abschnitt liegt außerhalb der Stempelzeit.');
  } else if (a.length && !e.length) hinweise.push('Abschnitte ohne Stempelzeit an diesem Tag.');
  return { employee_id: employeeId, beginn, ende, bruttoMinuten: brutto, gebuchtStunden: gebucht, pauseGebucht, pauseErfasst, minuten, erfasstMinuten: erfasst, hinweise };
}

export const fmtMinuten = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;

// ---------- Zusammengeführte Stunden (nur Auswertung) ----------

export interface Zusammenfassung {
  /** aktiv gearbeitet: Baustelle, Fahrten, Fortbildung (alle Arten mit arbeit = true) */
  aktivMinuten: number;
  baustelleMinuten: number; fahrtMinuten: number; fortbildungMinuten: number;
  pauseMinuten: number; pauseAnzahl: number;
  schlechtwetterMinuten: number;
  /** ein Abschnitt läuft noch; seine Zeit bis jetzt ist enthalten */
  laeuft: boolean;
}

export interface LaufenderAbschnitt { art: string; start_time: string }

/** Zählt die aktiv gearbeiteten Minuten und die Pausen getrennt zusammen. Ein laufender Abschnitt zählt bis „jetzt“. */
export function zusammenfassung(abschnitte: { art: string; start_time: string; end_time: string }[], lauf: LaufenderAbschnitt | null, jetzt: Date = new Date()): Zusammenfassung {
  const teile = abschnitte.map(a => ({ art: a.art, min: Math.max(0, minutenZwischen(a.start_time, a.end_time)) }));
  if (lauf) teile.push({ art: lauf.art, min: Math.max(0, minutenZwischen(lauf.start_time, jetzt.toISOString())) });
  const summe = (f: (art: string) => boolean) => teile.filter(t => f(t.art)).reduce((s, t) => s + t.min, 0);
  const arbeitsArt = (art: string) => ABSCHNITT_ARTEN.some(a => a.value === art && a.arbeit);
  return {
    aktivMinuten: summe(arbeitsArt),
    baustelleMinuten: summe(a => a === 'baustelle'),
    fahrtMinuten: summe(a => a === 'fahrt_hof' || a === 'fahrt_zum_hof'),
    fortbildungMinuten: summe(a => a === 'fortbildung'),
    pauseMinuten: summe(a => a === 'pause'),
    pauseAnzahl: teile.filter(t => t.art === 'pause').length,
    schlechtwetterMinuten: summe(a => a === 'schlechtwetter'),
    laeuft: !!lauf,
  };
}
