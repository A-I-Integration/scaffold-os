import { istIsoDatum } from './personalstamm';

// ============================================================
// SCAFFOLD OS – Betriebskalender: zusätzliche freie Tage und Betriebsferien
//  • Freier Tag / Feiertag: zählt nicht als Urlaubstag (zusätzlich zu den gesetzlichen Feiertagen in NRW, die automatisch gelten).
//  • Betriebsferien: Arbeitstage darin werden bei allen Mitarbeitern fest vom Urlaub abgezogen.
// ============================================================

export const KALENDER_ARTEN = [
  { value: 'betriebsferien', label: 'Betriebsferien (vom Urlaub abgezogen)' },
  { value: 'feiertag', label: 'Freier Tag / Feiertag (kein Urlaubsabzug)' },
] as const;
export const KALENDER_LABEL: Record<string, string> = { betriebsferien: 'Betriebsferien', feiertag: 'Freier Tag' };

export const MAX_TAGE = 120;

export type KalenderErgebnis =
  | { ok: true; art: string; bezeichnung: string; von: string; bis: string }
  | { ok: false; fehler: string };

export function pruefeKalenderEintrag(e: { art?: unknown; bezeichnung?: unknown; von?: unknown; bis?: unknown }): KalenderErgebnis {
  const art = String(e.art ?? '');
  if (!KALENDER_ARTEN.some(a => a.value === art)) return { ok: false, fehler: 'Bitte die Art wählen (Betriebsferien oder freier Tag).' };
  const bezeichnung = String(e.bezeichnung ?? '').trim().slice(0, 80);
  if (!bezeichnung) return { ok: false, fehler: 'Bitte eine Bezeichnung angeben (z. B. „Betriebsferien Sommer“ oder „Heiligabend“).' };
  const von = String(e.von ?? ''), bis = String(e.bis ?? e.von ?? '');
  if (!istIsoDatum(von) || !istIsoDatum(bis)) return { ok: false, fehler: 'Bitte Von und Bis als Datum angeben.' };
  if (bis < von) return { ok: false, fehler: '„Bis“ darf nicht vor „Von“ liegen.' };
  const tage = Math.round((Date.parse(bis + 'T00:00:00Z') - Date.parse(von + 'T00:00:00Z')) / 86400000) + 1;
  if (tage > MAX_TAGE) return { ok: false, fehler: `Der Zeitraum darf höchstens ${MAX_TAGE} Tage umfassen.` };
  return { ok: true, art, bezeichnung, von, bis };
}
