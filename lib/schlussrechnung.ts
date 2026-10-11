import type { Nachtrag } from './nachtrag';
import { nachtragNummer } from './nachtrag';

// ============================================================
// SCAFFOLD OS – Schlussrechnung aus Auftrag (reine Logik)
//
// Baut die Rechnungspositionen aus den gespeicherten Auftragsdaten:
//   Basis 'angebot' → Hauptposition = Angebotspreis (KI-Kalkulation oder
//                     Festpreis × Fläche, wie in Aufmaß Schritt 6)
//   Basis 'aufmass' → Hauptposition = aufgemessene Fläche × Preis/m²
// plus Kran, Mietverlängerung, Nachtrag (aus den Angebots-Anpassungen),
// Statik, Sonderrabatt und – wahlweise – bestätigte Nachträge (N-01 …).
// Beträge netto. Die Positionsform entspricht /api/invoices.
// ============================================================

export interface RechnungsPosition { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }

export interface AnpassungenLike {
  miete?: { aktiv?: boolean; wochen?: string; preisProWoche?: string };
  nachtrag?: { aktiv?: boolean; text?: string; betrag?: string };
  statik?: { aktiv?: boolean; text?: string; betrag?: string };
  rabatt?: { aktiv?: boolean; betrag?: string };
  skonto?: boolean;
}

export interface RechnungsEingabe {
  kiResult: { totalAreaM2?: number; suggestedPrice?: number } | null;
  preisModus: 'ki' | 'festpreis';
  festpreisProM2: string;
  anpassungen: AnpassungenLike;
  kranAktiv: boolean;
  kranTage: number;
  kranTagessatz: number;
}

export type RechnungsBasis = 'angebot' | 'aufmass';

const runde = (n: number) => Math.round(n * 100) / 100;

export function berechneAngebotBetraege(e: RechnungsEingabe) {
  const a = e.anpassungen || {};
  const flaeche = e.kiResult?.totalAreaM2 ?? 0;
  const basis = e.preisModus === 'festpreis'
    ? (parseFloat(String(e.festpreisProM2 || '').replace(',', '.')) || 0) * flaeche
    : (e.kiResult?.suggestedPrice ?? 0);
  const mieteBetrag = a.miete?.aktiv ? (parseFloat(a.miete.wochen || '') || 0) * (parseFloat(a.miete.preisProWoche || '') || 0) : 0;
  const nachtragBetrag = a.nachtrag?.aktiv ? parseFloat(a.nachtrag.betrag || '') || 0 : 0;
  const statikBetrag = a.statik?.aktiv ? parseFloat(String(a.statik.betrag ?? '').replace(',', '.')) || 0 : 0;
  const rabattBetrag = a.rabatt?.aktiv ? parseFloat(a.rabatt.betrag || '') || 0 : 0;
  const kranBetrag = e.kranAktiv ? runde(e.kranTagessatz * e.kranTage) : 0;
  return { flaeche, basis, mieteBetrag, nachtragBetrag, statikBetrag, rabattBetrag, kranBetrag };
}

export function baueRechnungsPositionen(args: {
  eingabe: RechnungsEingabe;
  basis: RechnungsBasis;
  /** aufgemessene Fläche in m² (nur Basis 'aufmass') */
  aufmassM2?: number;
  /** Preis je m² (nur Basis 'aufmass') */
  aufmassPreisProM2?: number;
  /** bestätigte Nachträge, die mit auf die Rechnung sollen */
  nachtraege?: Nachtrag[];
}): RechnungsPosition[] {
  const { eingabe: e } = args;
  const a = e.anpassungen || {};
  const b = berechneAngebotBetraege(e);
  const pos: RechnungsPosition[] = [];

  if (args.basis === 'aufmass') {
    const m2 = runde(args.aufmassM2 ?? 0);
    const preis = runde(args.aufmassPreisProM2 ?? 0);
    pos.push({
      bezeichnung: `Gerüstbau nach Aufmaß (${m2.toLocaleString('de-DE')} m² × ${preis.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/m²)`,
      menge: m2, einheit: 'm²', einzelpreis: preis,
    });
  } else {
    pos.push({
      bezeichnung: e.preisModus === 'festpreis'
        ? `Gerüstbau gemäß Angebot (${b.flaeche || '–'} m² × ${String(e.festpreisProM2 || '').replace('.', ',')} €/m²)`
        : 'Gerüstbau gemäß Angebot (Material, Arbeit, Transport)',
      menge: 1, einheit: 'Pauschale', einzelpreis: runde(b.basis),
    });
  }
  if (b.kranBetrag > 0) {
    pos.push({ bezeichnung: `Kran (${e.kranTage} Tage à ${e.kranTagessatz} €)`, menge: 1, einheit: 'Pauschale', einzelpreis: b.kranBetrag });
  }
  if (a.miete?.aktiv && b.mieteBetrag > 0) {
    pos.push({ bezeichnung: `Mietverlängerung ${a.miete.wochen} Wo. à ${a.miete.preisProWoche} €`, menge: 1, einheit: 'Pauschale', einzelpreis: b.mieteBetrag });
  }
  if (a.nachtrag?.aktiv && b.nachtragBetrag > 0) {
    pos.push({ bezeichnung: a.nachtrag.text?.trim() || 'Nachtrag', menge: 1, einheit: 'Pauschale', einzelpreis: b.nachtragBetrag });
  }
  if (a.statik?.aktiv && b.statikBetrag > 0) {
    pos.push({ bezeichnung: a.statik.text?.trim() || 'Statik (Fremdleistung)', menge: 1, einheit: 'Pauschale', einzelpreis: b.statikBetrag });
  }
  for (const n of args.nachtraege ?? []) {
    if (n.betrag > 0) {
      const d = new Date(n.datum + 'T12:00:00');
      const datum = Number.isNaN(d.getTime()) ? n.datum : d.toLocaleDateString('de-DE');
      pos.push({ bezeichnung: `Nachtrag ${nachtragNummer(n)} vom ${datum}: ${n.titel}`, menge: 1, einheit: 'Pauschale', einzelpreis: runde(n.betrag) });
    }
  }
  if (a.rabatt?.aktiv && b.rabattBetrag > 0) {
    pos.push({ bezeichnung: 'Sonderrabatt', menge: 1, einheit: 'Pauschale', einzelpreis: -b.rabattBetrag });
  }
  return pos;
}

export function summeNetto(positions: RechnungsPosition[]): number {
  return runde(positions.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0));
}

/** Eingabe aus den gespeicherten Projektdaten (projects.data) ableiten. */
export function eingabeAusProjektData(data: any, kranTagessatz: number): RechnungsEingabe {
  const d = data || {};
  return {
    kiResult: d.kiResult ?? null,
    preisModus: d.preisModus === 'festpreis' ? 'festpreis' : 'ki',
    festpreisProM2: String(d.festpreisProM2 ?? ''),
    anpassungen: d.angebotAnpassungen || {},
    kranAktiv: !!d.step4?.kranErforderlich,
    kranTage: parseInt(String(d.step1?.dauer || '1')) || 1,
    kranTagessatz: Number(kranTagessatz) || 850,
  };
}

// ============================================================
// Abzug bereits gestellter Abschlagsrechnungen (§ 14 Abs. 5 UStG)
//
// Die Endrechnung muss die vereinnahmten Teilbeträge und die darauf
// entfallende Umsatzsteuer absetzen. Wir ziehen NETTO ab (Restnetto →
// USt auf den Rest), damit Netto und USt der Abschläge nicht doppelt
// berechnet werden. Je Abschlag eine eigene Zeile mit Nummer und Datum.
// Abgezogen wird der tatsächlich bezahlte Teil (bezahlt = voll,
// Teilzahlung = anteilig); eine unbezahlte Abschlagsrechnung wird nur
// auf ausdrückliche Auswahl mit dem vollen Rechnungsbetrag abgezogen.
// ============================================================

export interface AbschlagLike {
  id: string;
  invoice_number: string;
  invoice_date: string;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
  status: string;
  paid_amount?: number | null;
}

export interface AbschlagAbzug {
  id: string;
  nummer: string;
  datum: string;
  netto: number;
  ust: number;
  brutto: number;
  /** wurde (teilweise) bezahlt */
  gezahlt: boolean;
  /** nur ein Teil wurde bezahlt */
  teilweise: boolean;
  /** Steuersatz der Abschlagsrechnung passt zur Schlussrechnung */
  abziehbar: boolean;
}

const fmtZahl = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function abschlagAbzug(inv: AbschlagLike, satz = 19): AbschlagAbzug {
  const gross = runde(Number(inv.gross_amount) || 0);
  const net = runde(Number(inv.net_amount) || 0);
  const paidRaw = inv.status === 'bezahlt' ? gross : Math.min(Math.max(Number(inv.paid_amount) || 0, 0), gross);
  const gezahlt = paidRaw > 0;
  // keine Zahlung → voller Rechnungsbetrag (nur bei ausdrücklicher Auswahl relevant)
  const basis = gezahlt ? paidRaw : gross;
  const anteil = gross > 0 ? basis / gross : 0;
  const netto = basis === gross ? net : runde(net * anteil);
  const brutto = basis;
  return {
    id: inv.id,
    nummer: inv.invoice_number,
    datum: inv.invoice_date,
    netto,
    ust: runde(brutto - netto),
    brutto,
    gezahlt,
    teilweise: gezahlt && paidRaw < gross,
    abziehbar: Number(inv.tax_rate) === satz,
  };
}

export function baueAbzugsPositionen(abzuege: AbschlagAbzug[]): RechnungsPosition[] {
  return abzuege.map((a) => {
    const m = String(a.datum || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const datum = m ? `${m[3]}.${m[2]}.${m[1]}` : a.datum;
    const zusatz = a.teilweise ? ', anteilig bezahlt' : !a.gezahlt ? ', noch nicht bezahlt' : '';
    return {
      bezeichnung: `abzüglich Abschlagsrechnung ${a.nummer} vom ${datum} (netto ${fmtZahl(a.netto)} €, USt ${fmtZahl(a.ust)} €, brutto ${fmtZahl(a.brutto)} €${zusatz})`,
      menge: 1, einheit: 'Pauschale', einzelpreis: -a.netto,
    };
  });
}

/** Kurzer Hinweistext für die Rechnung: Gesamtleistung und abgezogene Abschläge. */
export function abzugsHinweis(gesamtNetto: number, abzuege: AbschlagAbzug[], satz = 19): string | undefined {
  if (abzuege.length === 0) return undefined;
  const abNetto = runde(abzuege.reduce((s, a) => s + a.netto, 0));
  const abUst = runde(abzuege.reduce((s, a) => s + a.ust, 0));
  const gesUst = runde(gesamtNetto * satz / 100);
  return `Gesamtleistung netto ${fmtZahl(gesamtNetto)} € (USt ${fmtZahl(gesUst)} €), abzüglich vereinnahmter Abschläge netto ${fmtZahl(abNetto)} € (USt ${fmtZahl(abUst)} €).`;
}
