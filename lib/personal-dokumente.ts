// ============================================================
// SCAFFOLD OS – Mitarbeiter-Dokumente: Kategorien und Fälligkeit
// Vorwarnzeit: 60 Tage (Annahme, kann je Aufruf anders gesetzt werden).
// ============================================================

export const DOKUMENT_KATEGORIEN = [
  { value: 'personalien', label: 'Personalien', beispiel: 'Ausweis, SV-Ausweis, Steuer-ID-Bescheid' },
  { value: 'lehrgang', label: 'Lehrgänge', beispiel: 'Gerüstbauer-Qualifikation, Absturzsicherung, Ersthelfer' },
  { value: 'g_untersuchung', label: 'G-Untersuchungen', beispiel: 'G 41 Arbeiten mit Absturzgefahr (nur Bescheinigung, keine Befunde)' },
  { value: 'fuehrerschein', label: 'Führer- und Kranscheine', beispiel: 'Führerschein, Kranschein, Staplerschein' },
  { value: 'sonstiges', label: 'Sonstiges', beispiel: '' },
] as const;

export type DokumentKategorie = typeof DOKUMENT_KATEGORIEN[number]['value'];

export const VORWARN_TAGE = 60;

export type Faelligkeit = 'abgelaufen' | 'bald' | 'gueltig' | 'unbefristet';

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(bis + 'T00:00:00Z') - Date.parse(von + 'T00:00:00Z')) / 86400000);
}

/** Tage bis zum Ablauf (negativ = schon abgelaufen); null ohne Ablaufdatum. */
export function tageBisAblauf(gueltigBis: string | null | undefined, heute: string): number | null {
  return gueltigBis ? tageZwischen(heute, gueltigBis) : null;
}

export function faelligkeit(gueltigBis: string | null | undefined, heute: string, vorwarnTage = VORWARN_TAGE): Faelligkeit {
  const t = tageBisAblauf(gueltigBis, heute);
  if (t === null) return 'unbefristet';
  if (t < 0) return 'abgelaufen';
  return t <= vorwarnTage ? 'bald' : 'gueltig';
}

export function faelligkeitText(gueltigBis: string | null | undefined, heute: string, vorwarnTage = VORWARN_TAGE): string {
  const t = tageBisAblauf(gueltigBis, heute);
  if (t === null) return 'unbefristet';
  const d = gueltigBis!.split('-').reverse().join('.');
  if (t < 0) return `abgelaufen seit ${d} (${-t} ${-t === 1 ? 'Tag' : 'Tage'})`;
  if (t === 0) return `läuft heute ab (${d})`;
  if (t <= vorwarnTage) return `läuft in ${t} ${t === 1 ? 'Tag' : 'Tagen'} ab (${d})`;
  return `gültig bis ${d}`;
}

const REIHENFOLGE: Record<Faelligkeit, number> = { abgelaufen: 0, bald: 1, gueltig: 2, unbefristet: 3 };

/** Sortiert: abgelaufen zuerst, dann bald fällig (nach Datum), dann der Rest. */
export function sortiereNachFaelligkeit<T extends { gueltig_bis: string | null }>(liste: T[], heute: string): T[] {
  return [...liste].sort((a, b) => {
    const fa = REIHENFOLGE[faelligkeit(a.gueltig_bis, heute)], fb = REIHENFOLGE[faelligkeit(b.gueltig_bis, heute)];
    if (fa !== fb) return fa - fb;
    return (a.gueltig_bis || '9999').localeCompare(b.gueltig_bis || '9999');
  });
}

export type DokumentEingabe = { employee_id?: unknown; kategorie?: unknown; bezeichnung?: unknown; ausgestellt_am?: unknown; gueltig_bis?: unknown; notiz?: unknown };

export function pruefeDokumentEingabe(e: DokumentEingabe):
  | { ok: true; kategorie: DokumentKategorie; bezeichnung: string; ausgestellt_am: string | null; gueltig_bis: string | null; notiz: string | null }
  | { ok: false; fehler: string } {
  const kat = String(e.kategorie || '');
  if (!DOKUMENT_KATEGORIEN.some(k => k.value === kat)) return { ok: false, fehler: 'Bitte eine Kategorie wählen.' };
  const bez = String(e.bezeichnung ?? '').trim();
  if (!bez) return { ok: false, fehler: 'Bitte eine Bezeichnung angeben (z. B. „G 41“ oder „Kranschein“).' };
  const iso = (v: unknown, name: string) => {
    if (v === undefined || v === null || String(v).trim() === '') return { wert: null as string | null };
    const s = String(v).trim();
    const gueltig = /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
    return gueltig ? { wert: s } : { fehler: `${name} ist kein gültiges Datum.` };
  };
  const a = iso(e.ausgestellt_am, 'Ausgestellt am'), g = iso(e.gueltig_bis, 'Gültig bis');
  if ('fehler' in a) return { ok: false, fehler: a.fehler! };
  if ('fehler' in g) return { ok: false, fehler: g.fehler! };
  if (a.wert && g.wert && g.wert < a.wert) return { ok: false, fehler: '„Gültig bis“ liegt vor „Ausgestellt am“.' };
  const notiz = e.notiz === undefined || e.notiz === null || String(e.notiz).trim() === '' ? null : String(e.notiz).trim().slice(0, 500);
  return { ok: true, kategorie: kat as DokumentKategorie, bezeichnung: bez.slice(0, 120), ausgestellt_am: a.wert, gueltig_bis: g.wert, notiz };
}
