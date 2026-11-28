// ============================================================
// SCAFFOLD OS – Zeit-Knöpfe der Mitarbeiter (reine Logik)
// Ein Mitarbeiter hat höchstens einen LAUFENDEN Abschnitt. Jeder Knopf beendet den laufenden Abschnitt (zur eingestellten Zeit)
// und startet gegebenenfalls den nächsten. Nur Auswertung: die gebuchten Stunden (Stempelzeit) bleiben unberührt.
// ============================================================

import { ABSCHNITT_LABEL, berlinDatum, minutenZwischen, pruefeAbschnitt } from '@/lib/zeit-abschnitte';

export type Aktion = 'abfahrt' | 'ankunft' | 'pause' | 'pause_ende' | 'rueckfahrt' | 'hof' | 'stopp';

export interface Lauf { art: string; start_time: string; project_id: string | null; davor_art: string | null }

export interface KnopfInfo { aktion: Aktion; label: string }
const K: Record<Aktion, string> = {
  abfahrt: '🚛 Vom Hof gefahren', ankunft: '🏗 Auf der Baustelle angekommen', pause: '☕ Pause beginnen', pause_ende: '▶ Pause beenden – weiter',
  rueckfahrt: '🚛 Fahrt zum Hof', hof: '🏠 Zurück auf dem Hof', stopp: '⏹ Stoppen',
};

/** Welche Knöpfe sind im aktuellen Zustand sinnvoll? Der Reihe nach, so wie sie angezeigt werden. */
export function verfuegbareKnoepfe(lauf: Lauf | null): KnopfInfo[] {
  const l = (...a: Aktion[]): KnopfInfo[] => a.map((aktion) => ({ aktion, label: K[aktion] }));
  if (!lauf) return l('abfahrt', 'ankunft');
  switch (lauf.art) {
    case 'fahrt_hof': return l('ankunft', 'pause', 'stopp');
    case 'baustelle': return l('pause', 'rueckfahrt', 'hof', 'stopp');
    case 'pause': return l('pause_ende', 'stopp');
    case 'fahrt_zum_hof': return l('hof', 'pause', 'stopp');
    default: return l('stopp'); // z. B. Fortbildung oder Schlechtwetter, die Chef/Dispo eingetragen hat
  }
}

export interface Uebergang {
  /** der beendete Abschnitt (nur wenn einer lief) */
  abschliessen: { art: string; start_time: string; end_time: string; project_id: string | null } | null
  neuerLauf: Lauf | null
}
export type UebergangErgebnis = ({ ok: true } & Uebergang) | { ok: false; fehler: string }

const TOLERANZ_MS = 90 * 1000;
const MAX_LAUF_MS = 24 * 3600 * 1000;

/** Setzt einen Knopfdruck um. zeit: eingestellte Uhrzeit (ISO), sonst jetzt. */
export function uebergang(lauf: Lauf | null, aktion: Aktion, jetzt: Date, opts: { zeit?: string | null; projectId?: string | null } = {}): UebergangErgebnis {
  if (!verfuegbareKnoepfe(lauf).some((k) => k.aktion === aktion)) {
    return { ok: false, fehler: lauf ? `Das geht jetzt nicht: „${ABSCHNITT_LABEL[lauf.art] || lauf.art}“ läuft gerade.` : 'Das geht jetzt nicht: es läuft nichts.' };
  }
  let t = jetzt.getTime();
  if (opts.zeit) {
    const z = Date.parse(opts.zeit);
    if (Number.isNaN(z)) return { ok: false, fehler: 'Die Uhrzeit ist ungültig.' };
    if (z > jetzt.getTime() + TOLERANZ_MS) return { ok: false, fehler: 'Die Uhrzeit liegt in der Zukunft.' };
    t = Math.min(z, jetzt.getTime());
  }
  const zeit = new Date(t).toISOString();
  let abschliessen: Uebergang['abschliessen'] = null;
  if (lauf) {
    const dauer = Date.parse(zeit) - Date.parse(lauf.start_time);
    if (dauer <= 0) return { ok: false, fehler: `Die Uhrzeit liegt nicht nach dem Beginn (${new Date(lauf.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr).` };
    if (dauer > MAX_LAUF_MS) return { ok: false, fehler: 'Dieser Abschnitt läuft seit mehr als 24 Stunden. Bitte die Uhrzeit des Endes einstellen.' };
    abschliessen = { art: lauf.art, start_time: lauf.start_time, end_time: zeit, project_id: lauf.project_id };
  }
  const projekt = opts.projectId ?? lauf?.project_id ?? null;
  const neu = (art: string, extra: Partial<Lauf> = {}): Lauf => ({ art, start_time: zeit, project_id: projekt, davor_art: null, ...extra });
  switch (aktion) {
    case 'abfahrt': return { ok: true, abschliessen, neuerLauf: neu('fahrt_hof') };
    case 'ankunft': return { ok: true, abschliessen, neuerLauf: neu('baustelle') };
    case 'rueckfahrt': return { ok: true, abschliessen, neuerLauf: neu('fahrt_zum_hof') };
    case 'pause': return { ok: true, abschliessen, neuerLauf: neu('pause', { davor_art: lauf && ['baustelle', 'fahrt_hof', 'fahrt_zum_hof'].includes(lauf.art) ? lauf.art : null }) };
    case 'pause_ende': return { ok: true, abschliessen, neuerLauf: neu(lauf?.davor_art || 'baustelle') };
    case 'hof':
    case 'stopp': return { ok: true, abschliessen, neuerLauf: null };
  }
}

// ---------- Nachtragen durch den Mitarbeiter ----------

export const ARTEN_MITARBEITER = ['baustelle', 'fahrt_hof', 'fahrt_zum_hof', 'pause'] as const;
export const NACHTRAG_TAGE = 7;

/** Prüft einen vom Mitarbeiter nachgetragenen Abschnitt (nur eigene Arten, höchstens 7 Tage zurück, nicht in der Zukunft). */
export function pruefeNachtrag(e: Record<string, unknown>, employeeId: string, jetzt: Date = new Date()) {
  if (!(ARTEN_MITARBEITER as readonly string[]).includes(String(e.art ?? ''))) return { ok: false as const, fehler: 'Diese Art kannst du nicht selbst eintragen. Bitte an Chef oder Disposition wenden.' };
  const von = Date.parse(String(e.start_time ?? '')), bis = Date.parse(String(e.end_time ?? ''));
  if (Number.isNaN(von) || Number.isNaN(bis)) return { ok: false as const, fehler: 'Bitte Von und Bis als Uhrzeit angeben.' };
  if (bis > jetzt.getTime() + TOLERANZ_MS) return { ok: false as const, fehler: 'Das Ende liegt in der Zukunft.' };
  if (jetzt.getTime() - von > NACHTRAG_TAGE * 24 * 3600 * 1000) return { ok: false as const, fehler: `Nachtragen geht höchstens ${NACHTRAG_TAGE} Tage zurück. Bitte an Chef oder Disposition wenden.` };
  return pruefeAbschnitt({ employee_id: employeeId, art: e.art, start_time: new Date(von).toISOString(), end_time: new Date(bis).toISOString(), work_date: berlinDatum(new Date(von).toISOString()), project_id: e.project_id, note: e.note });
}

export { minutenZwischen };
