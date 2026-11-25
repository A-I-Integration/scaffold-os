// ============================================================
// SCAFFOLD OS – Lohnpfändung nach § 850c ZPO (monatlich)
// Aus dem Nettoeinkommen und der Zahl der Unterhaltsberechtigten ergibt sich der pfändbare Betrag.
// Die Freigrenzen ändern sich jedes Jahr zum 1. Juli und stehen mit Gültig-ab in der Tabelle pfaendung_grenzen.
// Die Rechnung folgt dem Gesetzestext (zentgenau). Die amtliche Tabelle arbeitet in 10-Euro-Stufen, deshalb kann
// einzelnes um wenige Euro abweichen: Der Betrag lässt sich je Monat von Hand überschreiben.
// ============================================================
import { istIsoDatum } from './personalstamm';
import { zahlAusEingabeStreng } from './zahl-eingabe';

export interface Grenze { gueltig_ab: string; grundbetrag: number; erhoehung_erste: number; erhoehung_weitere: number; obergrenze: number }

/** Eingebaute Werte (Pfändungsfreigrenzenbekanntmachungen 2025 und 2026), falls die Tabelle fehlt oder leer ist. */
export const STANDARD_GRENZEN: Grenze[] = [
  { gueltig_ab: '2025-07-01', grundbetrag: 1555.0, erhoehung_erste: 585.23, erhoehung_weitere: 326.04, obergrenze: 4766.99 },
  { gueltig_ab: '2026-07-01', grundbetrag: 1587.4, erhoehung_erste: 597.42, erhoehung_weitere: 332.83, obergrenze: 4866.3 },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Anteil des Mehrbetrags, der pfändbar ist: 70 % ohne Unterhalt, 50 % bei 1, dann je weitere Person 10 Punkte weniger (min. 10 %). */
export const PFAENDBARER_ANTEIL = [0.7, 0.5, 0.4, 0.3, 0.2, 0.1];

/** Die Grenze, die für einen Lohnmonat (JJJJ-MM) gilt: neueste mit Gültig-ab am Monatsersten oder früher. */
export function grenzeFuer(monat: string, grenzen: Grenze[] = STANDARD_GRENZEN): Grenze | null {
  const tag = `${monat}-01`;
  return [...grenzen].filter(g => g.gueltig_ab <= tag).sort((a, b) => (a.gueltig_ab < b.gueltig_ab ? 1 : -1))[0] ?? null;
}

/** Unpfändbarer Betrag (Freibetrag) bei n Unterhaltsberechtigten (0 bis 5; mehr zählt wie 5). */
export function freibetrag(personen: number, g: Grenze): number {
  const n = Math.max(0, Math.min(5, Math.trunc(personen)));
  return r2(g.grundbetrag + (n >= 1 ? g.erhoehung_erste : 0) + Math.max(0, n - 1) * g.erhoehung_weitere);
}

/** Pfändbarer Betrag aus dem Nettoeinkommen eines Monats. Über der Obergrenze ist der Mehrbetrag voll pfändbar. */
export function pfaendbarerBetrag(netto: number, personen: number, g: Grenze): number {
  if (!(netto > 0)) return 0;
  const n = Math.max(0, Math.min(5, Math.trunc(personen)));
  const frei = freibetrag(n, g);
  const anteil = PFAENDBARER_ANTEIL[n];
  if (netto <= frei) return 0;
  const bis = Math.min(netto, g.obergrenze);
  const normal = anteil * (bis - frei);
  const voll = netto > g.obergrenze ? netto - g.obergrenze : 0;
  return r2(Math.max(0, normal) + voll);
}

export interface PfaendungEintrag { id: string; glaeubiger: string; aktenzeichen?: string | null; rang: number; unterhaltspersonen: number; gueltig_ab: string; gueltig_bis?: string | null; forderung_offen?: number | null }

/** Welche Pfändungen gelten in dem Monat? (Beginn bis Ende, nach Rang geordnet) */
export function geltendeImMonat(liste: PfaendungEintrag[], monat: string): PfaendungEintrag[] {
  const erster = `${monat}-01`;
  const letzter = `${monat}-31`;
  return liste.filter(p => p.gueltig_ab <= letzter && (!p.gueltig_bis || p.gueltig_bis >= erster)).sort((a, b) => a.rang - b.rang || a.gueltig_ab.localeCompare(b.gueltig_ab));
}

export interface PfaendungMonat {
  monat: string; netto: number; personen: number;
  grenze: Grenze | null; freibetrag: number; pfaendbar: number;   // berechnet
  einbehalt: number;                                               // tatsächlich (berechnet oder von Hand)
  manuell: boolean; verteilung: { id: string; glaeubiger: string; betrag: number }[]; nichtVerteilt: number;
  hinweise: string[];
}

/** Berechnung für einen Mitarbeiter und Monat. Die Unterhaltsberechtigten stammen von der Pfändung mit dem besten Rang. */
export function berechnePfaendung(netto: number, monat: string, liste: PfaendungEintrag[], grenzen: Grenze[] = STANDARD_GRENZEN, betragManuell?: number | null): PfaendungMonat | null {
  const gelten = geltendeImMonat(liste, monat);
  if (!gelten.length) return null;
  const hinweise: string[] = [];
  const personen = gelten[0].unterhaltspersonen;
  if (new Set(gelten.map(p => p.unterhaltspersonen)).size > 1) hinweise.push('Die Pfändungen nennen unterschiedlich viele Unterhaltsberechtigte; es gilt die Angabe der Pfändung mit dem besten Rang.');
  const g = grenzeFuer(monat, grenzen);
  if (!g) hinweise.push('Für diesen Monat ist keine Pfändungsfreigrenze hinterlegt.');
  const frei = g ? freibetrag(personen, g) : 0;
  const pfaendbar = g ? pfaendbarerBetrag(netto, personen, g) : 0;
  const manuell = betragManuell !== null && betragManuell !== undefined;
  const einbehalt = manuell ? r2(betragManuell as number) : pfaendbar;
  if (manuell && Math.abs(einbehalt - pfaendbar) > 0.005) hinweise.push(`Von Hand geändert: berechnet wären ${pfaendbar.toFixed(2).replace('.', ',')} €.`);
  let rest = einbehalt;
  const verteilung = gelten.map(p => {
    const cap = p.forderung_offen == null ? Infinity : Number(p.forderung_offen);
    const b = r2(Math.min(rest, cap));
    rest = r2(rest - b);
    return { id: p.id, glaeubiger: p.glaeubiger, betrag: b };
  });
  if (rest > 0.005) hinweise.push('Ein Teil des pfändbaren Betrags ist keiner Forderung zugeordnet (alle offenen Forderungen sind gedeckt).');
  return { monat, netto: r2(netto), personen, grenze: g, freibetrag: frei, pfaendbar, einbehalt, manuell, verteilung, nichtVerteilt: rest > 0.005 ? rest : 0, hinweise };
}

// ─── Eingaben prüfen ───
const leer = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
export type PfaendungErgebnis =
  | { ok: true; glaeubiger: string; aktenzeichen: string | null; rang: number; unterhaltspersonen: number; gueltig_ab: string; gueltig_bis: string | null; forderung_offen: number | null; notiz: string | null }
  | { ok: false; fehler: string };

export function pruefePfaendung(e: Record<string, unknown>): PfaendungErgebnis {
  const glaeubiger = String(e.glaeubiger ?? '').trim().slice(0, 120);
  if (!glaeubiger) return { ok: false, fehler: 'Bitte den Gläubiger angeben.' };
  const personen = leer(e.unterhaltspersonen) ? 0 : zahlAusEingabeStreng(e.unterhaltspersonen);
  if (!Number.isInteger(personen) || personen < 0 || personen > 5) return { ok: false, fehler: 'Unterhaltsberechtigte: ganze Zahl von 0 bis 5.' };
  const rang = leer(e.rang) ? 1 : zahlAusEingabeStreng(e.rang);
  if (!Number.isInteger(rang) || rang < 1 || rang > 99) return { ok: false, fehler: 'Rang: ganze Zahl von 1 bis 99.' };
  if (!istIsoDatum(String(e.gueltig_ab ?? ''))) return { ok: false, fehler: 'Bitte angeben, ab wann die Pfändung gilt.' };
  const bis = leer(e.gueltig_bis) ? null : String(e.gueltig_bis);
  if (bis && !istIsoDatum(bis)) return { ok: false, fehler: 'Das Enddatum ist kein gültiges Datum.' };
  if (bis && bis < String(e.gueltig_ab)) return { ok: false, fehler: 'Das Ende liegt vor dem Beginn.' };
  let forderung: number | null = null;
  if (!leer(e.forderung_offen)) {
    const n = zahlAusEingabeStreng(e.forderung_offen);
    if (!Number.isFinite(n) || n < 0 || n > 10000000) return { ok: false, fehler: 'Die offene Forderung muss eine Zahl ab 0 sein.' };
    forderung = r2(n);
  }
  return { ok: true, glaeubiger, aktenzeichen: leer(e.aktenzeichen) ? null : String(e.aktenzeichen).trim().slice(0, 80), rang, unterhaltspersonen: personen, gueltig_ab: String(e.gueltig_ab), gueltig_bis: bis, forderung_offen: forderung, notiz: leer(e.notiz) ? null : String(e.notiz).trim().slice(0, 300) };
}

export type PfaendungMonatErgebnis = { ok: true; monat: string; netto: number; betrag_manuell: number | null; begruendung: string | null } | { ok: false; fehler: string };
export function pruefePfaendungMonat(e: Record<string, unknown>): PfaendungMonatErgebnis {
  const monat = String(e.monat ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) return { ok: false, fehler: 'Bitte den Monat wählen.' };
  const netto = zahlAusEingabeStreng(e.netto);
  if (!Number.isFinite(netto) || netto < 0 || netto > 1000000) return { ok: false, fehler: 'Das Nettoeinkommen muss eine Zahl ab 0 sein (z. B. 2150,40).' };
  let manuell: number | null = null;
  if (!leer(e.betrag_manuell)) {
    const m = zahlAusEingabeStreng(e.betrag_manuell);
    if (!Number.isFinite(m) || m < 0 || m > netto) return { ok: false, fehler: 'Der Betrag von Hand muss zwischen 0 und dem Nettoeinkommen liegen.' };
    manuell = r2(m);
  }
  const begr = leer(e.begruendung) ? null : String(e.begruendung).trim().slice(0, 300);
  if (manuell !== null && !begr) return { ok: false, fehler: 'Bitte eine Begründung für den Betrag von Hand angeben.' };
  return { ok: true, monat, netto: r2(netto), betrag_manuell: manuell, begruendung: begr };
}
