// ============================================================
// SCAFFOLD OS – Lohn-Konditionen je Mitarbeiter: Urlaubsanspruch, Kündigungsfrist, Sonderzahlungen
// Es gibt keine vorbelegten Werte und keine Tarifzahlen im Code; der Betrieb trägt seine Vereinbarungen selbst ein.
// ============================================================
import { istIsoDatum } from './personalstamm';
import { zahlAusEingabeStreng } from './zahl-eingabe';

export const SONDERZAHLUNG_ARTEN = [
  { value: 'urlaubsgeld', label: 'Urlaubsgeld' },
  { value: 'weihnachtsgeld', label: 'Weihnachtsgeld' },
  { value: 'praemie', label: 'Prämie / Bonus' },
  { value: 'zuschlag', label: 'Zuschlag' },
  { value: 'ausloese', label: 'Auslöse / Fahrtkosten' },
  { value: 'sachbezug', label: 'Sachbezug' },
  { value: 'vorschuss', label: 'Vorschuss' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const;

export const SONDERZAHLUNG_LABEL: Record<string, string> = Object.fromEntries(SONDERZAHLUNG_ARTEN.map(a => [a.value, a.label]));

const leer = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

export type SonderzahlungErgebnis =
  | { ok: true; art: string; bezeichnung: string | null; betrag: number | null; monat: string; notiz: string | null }
  | { ok: false; fehler: string };

export function pruefeSonderzahlung(e: { art?: unknown; bezeichnung?: unknown; betrag?: unknown; monat?: unknown; notiz?: unknown }): SonderzahlungErgebnis {
  const art = String(e.art ?? '');
  if (!SONDERZAHLUNG_ARTEN.some(a => a.value === art)) return { ok: false, fehler: 'Bitte die Art der Zahlung wählen.' };
  const bezeichnung = leer(e.bezeichnung) ? null : String(e.bezeichnung).trim().slice(0, 120);
  if (art === 'sonstiges' && !bezeichnung) return { ok: false, fehler: 'Bei „Sonstiges“ bitte eine Bezeichnung angeben.' };
  const monat = String(e.monat ?? '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) return { ok: false, fehler: 'Bitte den Monat wählen, für den die Zahlung gilt.' };
  let betrag: number | null = null;
  if (!leer(e.betrag)) {
    const n = zahlAusEingabeStreng(e.betrag);
    if (!Number.isFinite(n) || n <= 0 || n > 100000) return { ok: false, fehler: 'Der Betrag muss eine Zahl zwischen 0,01 und 100.000 € sein (z. B. 250 oder 250,50).' };
    betrag = Math.round(n * 100) / 100;
  }
  return { ok: true, art, bezeichnung, betrag, monat, notiz: leer(e.notiz) ? null : String(e.notiz).trim().slice(0, 300) };
}

export type UrlaubErgebnis = { ok: true; tage_pro_jahr: number; gueltig_ab: string; notiz: string | null } | { ok: false; fehler: string };

export function pruefeUrlaubsanspruch(e: { tage_pro_jahr?: unknown; gueltig_ab?: unknown; notiz?: unknown }): UrlaubErgebnis {
  const n = zahlAusEingabeStreng(e.tage_pro_jahr);
  if (!Number.isFinite(n) || n <= 0 || n > 90 || Math.round(n * 2) !== n * 2) return { ok: false, fehler: 'Urlaubstage pro Jahr: Zahl in halben Tagen zwischen 0,5 und 90 (z. B. 30).' };
  if (!istIsoDatum(String(e.gueltig_ab ?? ''))) return { ok: false, fehler: 'Bitte das Datum angeben, ab dem der Anspruch gilt.' };
  return { ok: true, tage_pro_jahr: n, gueltig_ab: String(e.gueltig_ab), notiz: leer(e.notiz) ? null : String(e.notiz).trim().slice(0, 300) };
}

/** Urlaubsanspruch (Tage pro Jahr), der an einem Tag gilt; null, wenn noch keiner hinterlegt ist. */
export function urlaubsanspruchAm(historie: { tage_pro_jahr: number | string; gueltig_ab: string }[], tag: string): number | null {
  const p = historie.filter(h => h.gueltig_ab <= tag).sort((a, b) => (a.gueltig_ab < b.gueltig_ab ? 1 : -1))[0];
  return p ? Number(p.tage_pro_jahr) : null;
}

export type KonditionenErgebnis = { ok: true; kuendigungsfrist: string | null; probezeit_ende: string | null; notiz: string | null; eintrittsdatum: string | null } | { ok: false; fehler: string };

export function pruefeKonditionen(e: { kuendigungsfrist?: unknown; probezeit_ende?: unknown; notiz?: unknown; eintrittsdatum?: unknown }): KonditionenErgebnis {
  for (const [k, name] of [['probezeit_ende', 'Ende der Probezeit'], ['eintrittsdatum', 'Erster Arbeitstag']] as const) {
    const v = (e as Record<string, unknown>)[k];
    if (!leer(v) && !istIsoDatum(String(v))) return { ok: false, fehler: `${name} ist kein gültiges Datum.` };
  }
  const t = (v: unknown, max: number) => (leer(v) ? null : String(v).trim().slice(0, max));
  return { ok: true, kuendigungsfrist: t(e.kuendigungsfrist, 200), probezeit_ende: t(e.probezeit_ende, 10), notiz: t(e.notiz, 500), eintrittsdatum: t(e.eintrittsdatum, 10) };
}
