// ============================================================
// SCAFFOLD OS – Zwischenaufmaß je Stichtag (reine Logik)
//
// Kumuliertes Aufmaß: Zu jedem Stichtag wird die GESAMT bis dahin
// gestellte Fläche (kumuliert) festgehalten. Abgerechnet wird nur die
// neue Menge seit dem letzten bereits abgerechneten Zwischenaufmaß:
//   neue Menge = kumuliert (dieser Stichtag) − kumuliert (zuletzt abgerechnet)
// Gespeichert in projects.data.zwischenaufmasse (bestehende PATCH-Route,
// keine Schema-Änderung). Flächen in m², Preise netto.
// ============================================================

export interface Zwischenaufmass {
  id: string;
  nr: number;
  /** Stichtag (YYYY-MM-DD) */
  stichtag: string;
  /** kumulierte Fläche bis zum Stichtag in m² */
  flaecheM2: number;
  notiz: string;
  erstelltAm: string;
  /** gesetzt, sobald dieses Zwischenaufmaß abgerechnet wurde */
  rechnungId?: string;
  rechnungNr?: string;
  abgerechnetAm?: string;
}

const runde2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function zwischenaufmassNr(z: Pick<Zwischenaufmass, 'nr'>): string {
  return `ZA-${String(z.nr).padStart(2, '0')}`;
}

export function naechsteZwischenaufmassNr(liste: Pick<Zwischenaufmass, 'nr'>[]): number {
  return liste.reduce((m, z) => Math.max(m, Number(z.nr) || 0), 0) + 1;
}

/** Liest gespeicherte Zwischenaufmaße defensiv (fehlerhafte Daten brechen die Seite nicht). */
export function normalisiereZwischenaufmasse(raw: unknown): Zwischenaufmass[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object' && typeof (x as any).id === 'string')
    .map((x: any): Zwischenaufmass => ({
      id: x.id,
      nr: Number(x.nr) || 0,
      stichtag: String(x.stichtag || ''),
      flaecheM2: runde2(Number(x.flaecheM2) || 0),
      notiz: String(x.notiz || ''),
      erstelltAm: String(x.erstelltAm || ''),
      rechnungId: x.rechnungId ? String(x.rechnungId) : undefined,
      rechnungNr: x.rechnungNr ? String(x.rechnungNr) : undefined,
      abgerechnetAm: x.abgerechnetAm ? String(x.abgerechnetAm) : undefined,
    }))
    .sort((a, b) => a.nr - b.nr);
}

/** Höchste bisher erfasste kumulierte Fläche (0 ohne Zwischenaufmaß). */
export function letzteKumulierteFlaeche(liste: Zwischenaufmass[]): number {
  return liste.reduce((m, z) => Math.max(m, z.flaecheM2), 0);
}

/** Aktueller Stand = kumulierte Fläche des zuletzt erfassten Zwischenaufmaßes (höchste Nr.), auch nach einem Rückbau. */
export function aktuellerStandM2(liste: Zwischenaufmass[]): number {
  if (!liste.length) return 0;
  return [...liste].sort((a, b) => a.nr - b.nr)[liste.length - 1].flaecheM2;
}

/** Noch nicht abgerechnete Restmenge: aktueller Stand abzüglich bereits abgerechneter kumulierter Menge (nie negativ). */
export function restmengeM2(liste: Zwischenaufmass[]): number {
  return Math.max(0, runde2(aktuellerStandM2(liste) - bisherAbgerechneteM2(liste)));
}

/** Menge, die bereits über den aktuellen Stand hinaus abgerechnet wurde (nach Rückbau/Korrektur). 0 = alles stimmig. */
export function ueberabgerechnetM2(liste: Zwischenaufmass[]): number {
  return Math.max(0, runde2(bisherAbgerechneteM2(liste) - aktuellerStandM2(liste)));
}

/** True, wenn dieses Zwischenaufmaß weniger ausweist als das vorherige (Rückbau oder Korrektur). */
export function istRueckgang(z: Zwischenaufmass, liste: Zwischenaufmass[]): boolean {
  const vorher = liste.filter((x) => x.nr < z.nr).sort((a, b) => a.nr - b.nr).pop();
  return !!vorher && z.flaecheM2 < vorher.flaecheM2;
}

/** Kumulierte Fläche, die bereits abgerechnet ist (optional ohne ein bestimmtes Zwischenaufmaß). */
export function bisherAbgerechneteM2(liste: Zwischenaufmass[], ausserId?: string): number {
  return liste
    .filter((z) => z.rechnungId && z.id !== ausserId)
    .reduce((m, z) => Math.max(m, z.flaecheM2), 0);
}

/** Neue (noch nicht abgerechnete) Menge dieses Zwischenaufmaßes in m². */
export function neueMengeM2(z: Zwischenaufmass, liste: Zwischenaufmass[]): number {
  return runde2(z.flaecheM2 - bisherAbgerechneteM2(liste, z.id));
}

export type ErfassungsErgebnis = { ok: true; eintrag: Zwischenaufmass } | { ok: false; fehler: string };

export function neuesZwischenaufmass(
  liste: Zwischenaufmass[],
  eingabe: { stichtag: string; flaecheM2: number; notiz?: string },
  id: string,
  jetzt: Date = new Date(),
): ErfassungsErgebnis {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.stichtag)) return { ok: false, fehler: 'Bitte einen Stichtag angeben.' };
  const flaeche = runde2(eingabe.flaecheM2);
  if (!(flaeche > 0)) return { ok: false, fehler: 'Bitte die bis zum Stichtag gestellte Gesamtfläche (kumuliert) in m² eingeben.' };
  const aktuell = aktuellerStandM2(liste);
  if (liste.length && flaeche === aktuell) {
    return { ok: false, fehler: `Die kumulierte Fläche entspricht dem letzten Zwischenaufmaß (${fmt(aktuell)} m²). Es gibt nichts Neues zu erfassen.` };
  }
  // Weniger als zuletzt = Rückbau oder Korrektur: erlaubt, aber nur mit Begründung (Nachvollziehbarkeit).
  if (flaeche < aktuell && !(eingabe.notiz || '').trim()) {
    return { ok: false, fehler: `Die Fläche ist kleiner als beim letzten Zwischenaufmaß (${fmt(aktuell)} m²). Das ist nur bei Rückbau oder Korrektur sinnvoll – bitte unten eine Notiz als Begründung eintragen. Gib sonst die GESAMTE Fläche bis zum Stichtag ein, nicht nur die neue.` };
  }
  return {
    ok: true,
    eintrag: {
      id, nr: naechsteZwischenaufmassNr(liste), stichtag: eingabe.stichtag, flaecheM2: flaeche,
      notiz: (eingabe.notiz || '').trim(), erstelltAm: jetzt.toISOString(),
    },
  };
}

/** Positionszeile für die Abschlagsrechnung: nur die neue Menge × Preis/m². */
export function baueTeilleistungsPosition(args: {
  z: Zwischenaufmass;
  liste: Zwischenaufmass[];
  preisProM2: number;
}): { position: { bezeichnung: string; menge: number; einheit: string; einzelpreis: number } | null; fehler: string | null } {
  const { z, liste, preisProM2 } = args;
  if (z.rechnungId) return { position: null, fehler: `${zwischenaufmassNr(z)} ist bereits mit Rechnung ${z.rechnungNr || ''} abgerechnet.`.replace('  ', ' ') };
  if (!(preisProM2 > 0)) return { position: null, fehler: 'Bitte den Preis je m² (netto) eingeben.' };
  const bisher = bisherAbgerechneteM2(liste, z.id);
  const neu = runde2(z.flaecheM2 - bisher);
  if (!(neu > 0)) return { position: null, fehler: `Für ${zwischenaufmassNr(z)} gibt es keine neue Menge: ${fmt(bisher)} m² sind schon abgerechnet.` };
  const d = new Date(z.stichtag + 'T12:00:00');
  const datum = Number.isNaN(d.getTime()) ? z.stichtag : d.toLocaleDateString('de-DE');
  const preis = runde2(preisProM2);
  return {
    position: {
      bezeichnung: `Teilleistung nach Zwischenaufmaß ${zwischenaufmassNr(z)} vom ${datum}: kumuliert ${fmt(z.flaecheM2)} m² abzüglich bereits abgerechnet ${fmt(bisher)} m²`,
      menge: neu, einheit: 'm²', einzelpreis: preis,
    },
    fehler: null,
  };
}

export function markiereAbgerechnet(
  liste: Zwischenaufmass[],
  id: string,
  rechnung: { id: string; nummer: string },
  heute: string,
): Zwischenaufmass[] {
  return liste.map((z) => (z.id === id ? { ...z, rechnungId: rechnung.id, rechnungNr: rechnung.nummer, abgerechnetAm: heute } : z));
}

/** Löschen nur, solange das Zwischenaufmaß nicht abgerechnet ist. */
export function loescheZwischenaufmass(liste: Zwischenaufmass[], id: string): Zwischenaufmass[] {
  return liste.filter((z) => z.id !== id || !!z.rechnungId);
}
