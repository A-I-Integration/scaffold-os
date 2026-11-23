// ============================================================
// SCAFFOLD OS – Faktura: Kennzahlen, Reiter und Filter (reine Logik, ohne Datenbank)
//
// Regeln (alle aus den vorhandenen Rechnungsdaten abgeleitet, nichts erfunden):
//   • Storniert zählt nirgends mit (die neue Version ersetzt die stornierte Rechnung).
//   • Gutschriften sind negative Belege (gross/net < 0) und mindern Forderung und Umsatz.
//   • Offener Betrag je Rechnung: AUSSCHLIESSLICH aus lib/forderung.ts (brutto − bezahlt − Gutschriften). Hier gibt es keine eigene Formel.
//   • Überfällig = Status „überfällig“ ODER Status „offen“ mit Fälligkeit vor heute (reiner Datumsvergleich, ohne Zeitzone).
//   • Umsatz = Summe netto nach Rechnungsdatum im Kalenderjahr.
// ============================================================

import { berechneForderung, statusJe, type ForderungsStatus } from './forderung';

export interface FakturaRechnung {
  id: string;
  invoice_number: string;
  customer_name: string;
  net_amount: number;
  gross_amount: number;
  paid_amount?: number | null;
  status: string;
  invoice_date: string;
  due_date: string | null;
  invoice_type?: string | null;
  reference_invoice_number?: string | null;
  projektnummer?: string | null;
}

export type FakturaReiter = 'alle' | 'rechnungen' | 'abschlag' | 'schluss' | 'gutschriften' | 'entwuerfe';

export const REITER_LABEL: Record<FakturaReiter, string> = {
  alle: 'Alle', rechnungen: 'Rechnungen', abschlag: 'Abschlagsrechnungen', schluss: 'Schlussrechnungen', gutschriften: 'Gutschriften', entwuerfe: 'Entwürfe',
};

const runde2 = (n: number) => Math.round(n * 100) / 100;
const zahl = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Heutiges Datum lokal als YYYY-MM-DD. */
export function heuteIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const istGutschrift = (r: Pick<FakturaRechnung, 'invoice_type' | 'gross_amount'>) => r.invoice_type === 'gutschrift';

export function istUeberfaellig(r: Pick<FakturaRechnung, 'status' | 'due_date' | 'invoice_type'>, heute: string): boolean {
  if (r.invoice_type === 'gutschrift') return false;
  if (r.status === 'ueberfaellig') return true;
  return r.status === 'offen' && !!r.due_date && r.due_date.slice(0, 10) < heute;
}

/**
 * Offener Betrag je Rechnung mit Gutschriften (zentral, lib/forderung.ts). Gutschriften mindern die Rechnung, auf die sie sich beziehen.
 * Schlüssel: Rechnungs-ID. Gutschriften selbst und stornierte Rechnungen stehen nicht darin (0).
 */
export function offenJeRechnung(liste: FakturaRechnung[]): Map<string, number> {
  return berechneForderung(liste as any).je;
}

export type AnzeigeStatus = ForderungsStatus;

/**
 * Angezeigter Status je Rechnung (Schlüssel: id) – aus Zahlungen UND Gutschriften der übergebenen Liste (lib/forderung.ts),
 * nicht aus dem gespeicherten Status allein. Eine durch Gutschrift ausgeglichene Rechnung ist „ausgeglichen“, nie „offen“.
 */
export function anzeigeStatusJe(liste: FakturaRechnung[], heute: string): Map<string, AnzeigeStatus> {
  return statusJe(liste as any, heute);
}

export interface Kennzahlen {
  offenAnzahl: number;
  offenBetrag: number;
  ueberfaelligAnzahl: number;
  ueberfaelligBetrag: number;
  bezahltMonatAnzahl: number;
  bezahltMonatBetrag: number;
  umsatzJahr: number;
  umsatzVorjahr: number;
  /** Veränderung zum Vorjahr in Prozent; null, wenn es im Vorjahr keinen Umsatz gab. */
  umsatzVeraenderungProzent: number | null;
}

export interface ZahlungKurz { invoice_id: string; amount: number; payment_date: string }

export function berechneKennzahlen(rechnungen: FakturaRechnung[], zahlungenImMonat: ZahlungKurz[], heute: string): Kennzahlen {
  const jahr = heute.slice(0, 4);
  const vorjahr = String(Number(jahr) - 1);
  let offenAnzahl = 0, offenBetrag = 0, ueAnzahl = 0, ueBetrag = 0, umsatzJahr = 0, umsatzVorjahr = 0;
  const offenJe = offenJeRechnung(rechnungen);
  for (const r of rechnungen) {
    if (r.status === 'storniert') continue;
    const j = String(r.invoice_date || '').slice(0, 4);
    if (j === jahr) umsatzJahr += zahl(r.net_amount);
    else if (j === vorjahr) umsatzVorjahr += zahl(r.net_amount);
    const offen = r.status === 'bezahlt' || istGutschrift(r) ? 0 : (offenJe.get(String(r.id)) ?? 0);
    if (offen > 0) {
      offenAnzahl += 1; offenBetrag += offen;
      if (istUeberfaellig(r, heute)) { ueAnzahl += 1; ueBetrag += offen; }
    }
  }
  const rechnungsIds = new Set(zahlungenImMonat.map((z) => z.invoice_id));
  umsatzJahr = runde2(umsatzJahr); umsatzVorjahr = runde2(umsatzVorjahr);
  return {
    offenAnzahl, offenBetrag: runde2(offenBetrag),
    ueberfaelligAnzahl: ueAnzahl, ueberfaelligBetrag: runde2(ueBetrag),
    bezahltMonatAnzahl: rechnungsIds.size,
    bezahltMonatBetrag: runde2(zahlungenImMonat.reduce((s, z) => s + zahl(z.amount), 0)),
    umsatzJahr, umsatzVorjahr,
    umsatzVeraenderungProzent: umsatzVorjahr > 0 ? Math.round(((umsatzJahr - umsatzVorjahr) / umsatzVorjahr) * 1000) / 10 : null,
  };
}

export function gehoertZuReiter(r: FakturaRechnung, reiter: FakturaReiter): boolean {
  const art = r.invoice_type || 'standard';
  switch (reiter) {
    case 'alle': return true;
    case 'rechnungen': return art === 'standard';
    case 'abschlag': return art === 'abschlag';
    case 'schluss': return art === 'schluss';
    case 'gutschriften': return art === 'gutschrift';
    case 'entwuerfe': return false; // Entwürfe sind keine Rechnungen (eigene Tabelle invoice_drafts, ohne Nummer)
  }
}

export interface FakturaFilter {
  reiter: FakturaReiter;
  suche: string;
  /** 'alle' oder 'offen' | 'ueberfaellig' | 'bezahlt' | 'storniert' */
  status: 'alle' | 'offen' | 'ueberfaellig' | 'bezahlt' | 'storniert';
  /** 'alle' oder Jahr als Text, z. B. '2026' (nach Rechnungsdatum) */
  jahr: string;
}

export function filtereRechnungen(liste: FakturaRechnung[], f: FakturaFilter, heute: string): FakturaRechnung[] {
  const q = f.suche.trim().toLowerCase();
  const statusMap = f.status !== 'alle' ? anzeigeStatusJe(liste, heute) : null;
  return liste.filter((r) => {
    if (!gehoertZuReiter(r, f.reiter)) return false;
    if (f.jahr !== 'alle' && String(r.invoice_date || '').slice(0, 4) !== f.jahr) return false;
    if (f.status !== 'alle') {
      const s = statusMap?.get(String(r.id)) ?? 'offen';
      // „bezahlt“ umfasst auch durch Gutschrift ausgeglichene Rechnungen; „offen“ nur, was wirklich noch offen ist (auch teilweise gutgeschrieben)
      const passt = f.status === 'offen' ? (s === 'offen' || s === 'teilbezahlt' || s === 'teilausgeglichen')
        : f.status === 'bezahlt' ? (s === 'bezahlt' || s === 'ausgeglichen')
        : s === f.status;
      if (!passt) return false;
    }
    if (q && !`${r.invoice_number} ${r.customer_name} ${r.projektnummer || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Entwürfe zählt die Seite selbst (eigene Tabelle); hier ist der Wert immer 0. */
export function zaehleJeReiter(liste: FakturaRechnung[]): Record<FakturaReiter, number> {
  const alle: FakturaReiter[] = ['alle', 'rechnungen', 'abschlag', 'schluss', 'gutschriften', 'entwuerfe'];
  return Object.fromEntries(alle.map((k) => [k, liste.filter((r) => gehoertZuReiter(r, k)).length])) as Record<FakturaReiter, number>;
}

/** Jahre, in denen es Rechnungen gibt (neueste zuerst) – für die Jahresauswahl. */
export function rechnungsJahre(liste: FakturaRechnung[], heute: string): string[] {
  const s = new Set<string>([heute.slice(0, 4)]);
  for (const r of liste) { const j = String(r.invoice_date || '').slice(0, 4); if (/^\d{4}$/.test(j)) s.add(j); }
  return [...s].sort((a, b) => b.localeCompare(a));
}

export function monatsGrenzen(heute: string): { von: string; bis: string } {
  const [y, m] = heute.split('-').map(Number);
  const letzter = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { von: `${y}-${mm}-01`, bis: `${y}-${mm}-${String(letzter).padStart(2, '0')}` };
}

/** Offene Posten: Rechnungen mit offenem Betrag, nach Fälligkeit (älteste zuerst; ohne Fälligkeit zuletzt). */
export function offenePosten<T extends FakturaRechnung>(liste: T[]): T[] {
  const offenJe = offenJeRechnung(liste);
  return liste
    .filter((r) => r.status !== 'bezahlt' && !istGutschrift(r) && (offenJe.get(String(r.id)) ?? 0) > 0)
    .sort((a, b) => (a.due_date ? a.due_date.slice(0, 10) : '9999-12-31').localeCompare(b.due_date ? b.due_date.slice(0, 10) : '9999-12-31') || a.invoice_number.localeCompare(b.invoice_number));
}

/** Überfällige Rechnungen (mit offenem Betrag), am längsten überfällig zuerst. */
export function ueberfaelligeRechnungen<T extends FakturaRechnung>(liste: T[], heute: string): T[] {
  return offenePosten(liste).filter((r) => istUeberfaellig(r, heute));
}

/** Rechnungen, die in den nächsten `tage` Tagen fällig werden (inklusive heute), noch nicht überfällig. */
export function baldFaellig<T extends FakturaRechnung>(liste: T[], heute: string, tage: number): T[] {
  const [y, m, d] = heute.split('-').map(Number);
  const grenze = heuteIso(new Date(y, m - 1, d + tage));
  return offenePosten(liste).filter((r) => !istUeberfaellig(r, heute) && !!r.due_date && r.due_date.slice(0, 10) >= heute && r.due_date.slice(0, 10) <= grenze);
}
