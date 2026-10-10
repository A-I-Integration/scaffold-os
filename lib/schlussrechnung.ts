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
