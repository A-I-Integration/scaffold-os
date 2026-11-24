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
  /** Aufmaß je Position (kumuliert). Ohne Angabe: altes Aufmaß nur mit Gesamtfläche. */
  positionen?: ZaPosition[];
}

/** Eine Position im Zwischenaufmaß: kumulierte Menge bis zum Stichtag, Preis netto je Einheit. */
export interface ZaPosition {
  /**
   * Stabile Identität der Position über alle Zwischenaufmaße. Wird beim Anlegen vergeben (aus Bezeichnung und Einheit, bei Namensgleichheit
   * mit einer umbenannten Position mit Zusatz) und danach NIE mehr neu gebildet: eine Umbenennung ändert die Bezeichnung, nicht die Identität.
   * Altdaten ohne gespeicherte Identität behalten die bisherige, aus Bezeichnung und Einheit gebildete.
   */
  key: string;
  bezeichnung: string;
  einheit: string;
  einzelpreis: number;
  /** kumulierte Menge bis zum Stichtag */
  menge: number;
  /** Vertragsmenge (vereinbarte Menge) dieser Position; fehlt = nicht erfasst, dann gibt es keine Mengenprüfung gegen den Vertrag. */
  vertragsmenge?: number;
  /** Zusatzmenge, die ein vom Kunden bestätigter Nachtrag (nachtragId) zur Vertragsmenge dazugibt. Sie zählt nicht als ungedeckte Mehrmenge. */
  nachtragMenge?: number;
  nachtragId?: string;
}

/** Vereinbarte Menge insgesamt: Vertragsmenge plus genehmigte Nachtragsmenge (0 = nichts vereinbart, keine Mengenprüfung). */
export const vereinbarteMenge = (p: Pick<ZaPosition, 'vertragsmenge' | 'nachtragMenge'>): number =>
  (p.vertragsmenge ?? 0) > 0 ? runde2((p.vertragsmenge ?? 0) + (p.nachtragMenge ?? 0)) : 0;

export const positionsKey = (bezeichnung: string, einheit: string): string =>
  `${bezeichnung.trim().toLowerCase().replace(/\s+/g, ' ')}|${einheit.trim().toLowerCase()}`;

const runde2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function zwischenaufmassNr(z: Pick<Zwischenaufmass, 'nr'>): string {
  return `ZA-${String(z.nr).padStart(2, '0')}`;
}

export function naechsteZwischenaufmassNr(liste: Pick<Zwischenaufmass, 'nr'>[]): number {
  return liste.reduce((m, z) => Math.max(m, Number(z.nr) || 0), 0) + 1;
}

function normalisierePositionen(raw: unknown): ZaPosition[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const r = raw
    .filter((p) => p && typeof p === 'object' && String((p as any).bezeichnung || '').trim())
    .map((p: any): ZaPosition => {
      const bezeichnung = String(p.bezeichnung).trim().slice(0, 300);
      const einheit = String(p.einheit || 'm²').trim().slice(0, 20) || 'm²';
      const gespeichert = typeof p.key === 'string' ? p.key.trim().slice(0, 160) : '';
      const vm = runde2(Number(p.vertragsmenge) || 0);
      const nm = runde2(Number(p.nachtragMenge) || 0);
      const nid = typeof p.nachtragId === 'string' ? p.nachtragId.trim().slice(0, 80) : '';
      return { key: gespeichert || positionsKey(bezeichnung, einheit), bezeichnung, einheit, einzelpreis: runde2(Number(p.einzelpreis) || 0), menge: runde2(Number(p.menge) || 0), ...(vm > 0 ? { vertragsmenge: vm } : {}), ...(nm > 0 && nid ? { nachtragMenge: nm, nachtragId: nid } : {}) };
    });
  return r.length ? r : undefined;
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
      positionen: normalisierePositionen(x.positionen),
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


// ─── Kumuliertes Aufmaß je Position ───

/** Bisher abgerechnete kumulierte Menge je Position (höchster abgerechneter Stand), optional ohne ein bestimmtes Zwischenaufmaß. */
export function bisherAbgerechnetJePosition(liste: Zwischenaufmass[], ausserId?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const z of liste) {
    if (!z.rechnungId || z.id === ausserId) continue;
    for (const p of z.positionen || []) m.set(p.key, Math.max(m.get(p.key) ?? 0, p.menge));
  }
  return m;
}

/** Zuletzt erfasster kumulierter Stand je Position (höchste Zwischenaufmaß-Nr. mit dieser Position). */
export function aktuellerStandJePosition(liste: Zwischenaufmass[], ausserId?: string): Map<string, ZaPosition> {
  const m = new Map<string, ZaPosition>();
  for (const z of [...liste].sort((a, b) => a.nr - b.nr)) {
    if (z.id === ausserId) continue;
    for (const p of z.positionen || []) m.set(p.key, p);
  }
  return m;
}

export interface ZaZeile extends ZaPosition {
  bisher: number; neu: number; betragNeu: number; zuViel: number
  /** Menge dieser Position kumuliert über der Vertragsmenge (0 ohne Vertragsmenge). */
  mehrmenge: number
  /** Teil der neuen Menge, der über die Vertragsmenge hinausgeht (0 ohne Vertragsmenge). */
  neuMehrmenge: number
}

/** Je Position: kumuliert, bereits abgerechnet, neue Menge. `zuViel` > 0: es ist mehr abgerechnet als aufgemessen (wird nicht automatisch korrigiert). */
export function zaZeilen(z: Zwischenaufmass, liste: Zwischenaufmass[]): ZaZeile[] {
  const bisher = bisherAbgerechnetJePosition(liste, z.id);
  return (z.positionen || []).map((p) => {
    const b = bisher.get(p.key) ?? 0;
    const diff = runde2(p.menge - b);
    const vm = vereinbarteMenge(p);
    const neu = Math.max(0, diff);
    const mehr = vm > 0 ? Math.max(0, runde2(p.menge - vm)) : 0;
    // Mehrmenge, die in dieser Abrechnung NEU dazukommt: oberhalb von Vertragsmenge und bereits Abgerechnetem
    const neuMehr = vm > 0 ? Math.max(0, runde2(p.menge - Math.max(vm, b))) : 0;
    return { ...p, bisher: b, neu, betragNeu: runde2(neu * p.einzelpreis), zuViel: Math.max(0, -diff), mehrmenge: mehr, neuMehrmenge: Math.min(neu, neuMehr) };
  });
}

/** `key`: Identität der Position aus dem letzten Stand (bei Umbenennung mitgeben). Ohne `key` gilt die Zeile als Position mit diesem Namen. */
/** `vertragsmenge`: leer/undefined = die bisherige Vertragsmenge der Position bleibt erhalten. */
export type ZaPositionEingabe = { bezeichnung: string; einheit: string; einzelpreis: number; menge: number; key?: string; vertragsmenge?: number; nachtragMenge?: number; nachtragId?: string };

/**
 * Prüft ein neues Zwischenaufmaß gegen den letzten Stand (gemeinsam für Erfassung im Browser und Speichern auf dem Server):
 * Eine Position, deren Menge sinkt oder die ganz fehlt (z. B. umbenannt ohne Übernahme der Identität), braucht eine Begründung.
 * So wird eine bereits abgerechnete Menge nicht still als neue Position erneut abrechenbar.
 */
export function pruefePositionenGegenStand(stand: Map<string, ZaPosition>, positionen: ZaPosition[], notiz: string): string | null {
  const hatGrund = !!(notiz || '').trim();
  const rueckgaenge = positionen.filter((p) => stand.has(p.key) && p.menge < stand.get(p.key)!.menge);
  if (rueckgaenge.length && !hatGrund) {
    return `Bei ${rueckgaenge.map((p) => `„${p.bezeichnung}“ (${fmt(p.menge)} statt ${fmt(stand.get(p.key)!.menge)} ${p.einheit})`).join(', ')} ist die Menge kleiner als zuletzt. Das ist nur bei Rückbau oder Korrektur sinnvoll – bitte eine Notiz als Begründung eintragen. Gib sonst die GESAMTE Menge bis zum Stichtag ein, nicht nur die neue.`;
  }
  const geaenderteVm = positionen.filter((p) => stand.get(p.key)?.vertragsmenge && p.vertragsmenge !== stand.get(p.key)!.vertragsmenge);
  if (geaenderteVm.length && !hatGrund) {
    return `Die Vertragsmenge von ${geaenderteVm.map((p) => `„${p.bezeichnung}“ (${p.vertragsmenge ? fmt(p.vertragsmenge) : 'ohne'} statt ${fmt(stand.get(p.key)!.vertragsmenge!)} ${p.einheit})`).join(', ')} wird geändert. Bitte eine Notiz als Begründung eintragen (z. B. Nachtrag oder Änderung der Vereinbarung).`;
  }
  const geaenderteNm = positionen.filter((p) => (stand.get(p.key)?.nachtragMenge ?? 0) > 0 && ((p.nachtragMenge ?? 0) !== stand.get(p.key)!.nachtragMenge || (p.nachtragId ?? '') !== (stand.get(p.key)!.nachtragId ?? '')));
  if (geaenderteNm.length && !hatGrund) {
    return `Die Nachtragsmenge von ${geaenderteNm.map((p) => `„${p.bezeichnung}“ (${p.nachtragMenge ? fmt(p.nachtragMenge) : 'ohne'} statt ${fmt(stand.get(p.key)!.nachtragMenge!)} ${p.einheit})`).join(', ')} wird geändert. Bitte eine Notiz als Begründung eintragen.`;
  }
  const nmOhneVm = positionen.filter((p) => (p.nachtragMenge ?? 0) > 0 && !((p.vertragsmenge ?? 0) > 0));
  if (nmOhneVm.length) return `Für ${nmOhneVm.map((p) => `„${p.bezeichnung}“`).join(', ')} ist eine Nachtragsmenge angegeben, aber keine Vertragsmenge. Bitte zuerst die Vertragsmenge erfassen.`;
  const fehlend = [...stand.values()].filter((p) => p.menge > 0 && !positionen.some((x) => x.key === p.key));
  if (fehlend.length && !hatGrund) {
    return `${fehlend.map((p) => `„${p.bezeichnung}“ (zuletzt ${fmt(p.menge)} ${p.einheit})`).join(', ')} ${fehlend.length > 1 ? 'fehlen' : 'fehlt'} im neuen Zwischenaufmaß. Wurde die Position umbenannt, übernimm sie in der Zeile (Name ändern statt neue Zeile anlegen). Entfällt sie, trage bitte eine Notiz als Begründung ein.`;
  }
  return null;
}

export function neuesZwischenaufmassJePosition(
  liste: Zwischenaufmass[],
  eingabe: { stichtag: string; positionen: ZaPositionEingabe[]; notiz?: string },
  id: string,
  jetzt: Date = new Date(),
): ErfassungsErgebnis {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.stichtag)) return { ok: false, fehler: 'Bitte einen Stichtag angeben.' };
  const rows = eingabe.positionen.filter((p) => p.bezeichnung.trim());
  if (!rows.length) return { ok: false, fehler: 'Bitte mindestens eine Position mit Bezeichnung erfassen.' };
  const stand = aktuellerStandJePosition(liste);
  const positionen: ZaPosition[] = [];
  for (const p of rows) {
    const bez = p.bezeichnung.trim().slice(0, 300); const einheit = (p.einheit || '').trim() || 'm²';
    // Identität: übernommen aus dem letzten Stand (auch bei geänderter Bezeichnung); sonst aus dem Namen – außer dieser Name gehörte
    // früher zu einer inzwischen umbenannten Position, dann bekommt die Zeile eine eigene Identität.
    let key: string;
    if (p.key && stand.has(p.key)) key = p.key;
    else {
      const k = positionsKey(bez, einheit);
      const belegt = stand.get(k);
      key = belegt && positionsKey(belegt.bezeichnung, belegt.einheit) !== k ? `${k}#${id.slice(0, 8)}` : k;
    }
    const name = positionsKey(bez, einheit);
    if (positionen.some((x) => x.key === key || positionsKey(x.bezeichnung, x.einheit) === name)) return { ok: false, fehler: `Die Position „${bez}“ (${einheit}) kommt doppelt vor.` };
    if (!(p.menge >= 0) || !Number.isFinite(p.menge)) return { ok: false, fehler: `Die Menge von „${bez}“ ist ungültig.` };
    if (!(p.einzelpreis >= 0) || !Number.isFinite(p.einzelpreis)) return { ok: false, fehler: `Der Preis von „${bez}“ ist ungültig.` };
    if (p.vertragsmenge !== undefined && (!Number.isFinite(p.vertragsmenge) || p.vertragsmenge < 0)) return { ok: false, fehler: `Die Vertragsmenge von „${bez}“ ist ungültig.` };
    // Vertragsmenge: eigene Angabe, sonst die bisherige der Position übernehmen
    const vm = runde2(p.vertragsmenge !== undefined && p.vertragsmenge > 0 ? p.vertragsmenge : (stand.get(key)?.vertragsmenge ?? 0));
    if (p.nachtragMenge !== undefined && (!Number.isFinite(p.nachtragMenge) || p.nachtragMenge < 0)) return { ok: false, fehler: `Die Nachtragsmenge von „${bez}“ ist ungültig.` };
    // Nachtragsmenge: eigene Angabe (leer/undefined = bisherige bleibt, 0 = entfernt); sie gehört immer zu einem bestätigten Nachtrag
    const nmEigen = p.nachtragMenge !== undefined;
    const nm = runde2(nmEigen ? p.nachtragMenge! : (stand.get(key)?.nachtragMenge ?? 0));
    const nid = nm > 0 ? ((nmEigen ? p.nachtragId : (p.nachtragId ?? stand.get(key)?.nachtragId)) || '').trim() : '';
    if (nm > 0 && !nid) return { ok: false, fehler: `Bitte für die Nachtragsmenge von „${bez}“ den Nachtrag auswählen.` };
    positionen.push({ key, bezeichnung: bez, einheit, einzelpreis: runde2(p.einzelpreis), menge: runde2(p.menge), ...(vm > 0 ? { vertragsmenge: vm } : {}), ...(nm > 0 ? { nachtragMenge: nm, nachtragId: nid } : {}) });
  }
  const geaendert = positionen.some((p) => !stand.has(p.key) || p.menge !== stand.get(p.key)!.menge || p.einzelpreis !== stand.get(p.key)!.einzelpreis || p.bezeichnung !== stand.get(p.key)!.bezeichnung || (p.vertragsmenge ?? 0) !== (stand.get(p.key)!.vertragsmenge ?? 0) || (p.nachtragMenge ?? 0) !== (stand.get(p.key)!.nachtragMenge ?? 0))
    || [...stand.values()].some((p) => p.menge > 0 && !positionen.some((x) => x.key === p.key));
  if (liste.length && !geaendert) return { ok: false, fehler: 'Es hat sich gegenüber dem letzten Zwischenaufmaß nichts geändert. Es gibt nichts Neues zu erfassen.' };
  const fehler = pruefePositionenGegenStand(stand, positionen, eingabe.notiz || '');
  if (fehler) return { ok: false, fehler };
  // Vorhandene Positionen dürfen nicht stillschweigend verschwinden: fehlt eine (mit Begründung), wird sie mit Menge 0 geführt.
  for (const p of stand.values()) if (p.menge > 0 && !positionen.some((x) => x.key === p.key)) positionen.push({ ...p, menge: 0 });
  const flaeche = runde2(positionen.filter((p) => p.einheit.toLowerCase() === 'm²' || p.einheit.toLowerCase() === 'm2').reduce((s, p) => s + p.menge, 0));
  return { ok: true, eintrag: { id, nr: naechsteZwischenaufmassNr(liste), stichtag: eingabe.stichtag, flaecheM2: flaeche, notiz: (eingabe.notiz || '').trim(), erstelltAm: jetzt.toISOString(), positionen } };
}

/** Rechnungspositionen aus einem Zwischenaufmaß je Position: nur die neue Menge je Position. Mengenrückgänge werden NICHT automatisch verrechnet, sondern als Hinweis geliefert. */
export function baueTeilleistungsPositionen(z: Zwischenaufmass, liste: Zwischenaufmass[]): {
  positionen: { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }[]; fehler: string | null; hinweise: string[]
} {
  if (z.rechnungId) return { positionen: [], fehler: `${zwischenaufmassNr(z)} ist bereits mit Rechnung ${z.rechnungNr || ''} abgerechnet.`.replace('  ', ' '), hinweise: [] };
  const zeilen = zaZeilen(z, liste);
  const d = new Date(z.stichtag + 'T12:00:00');
  const datum = Number.isNaN(d.getTime()) ? z.stichtag : d.toLocaleDateString('de-DE');
  const hinweise = zeilen.filter((r) => r.zuViel > 0).map((r) => `„${r.bezeichnung}“: ${fmt(r.zuViel)} ${r.einheit} mehr abgerechnet (${fmt(r.bisher)}) als aufgemessen (${fmt(r.menge)}). Nicht automatisch korrigiert – bitte Gutschrift oder Korrektur prüfen.`);
  for (const r of zeilen) {
    if (r.mehrmenge > 0) hinweise.push(`„${r.bezeichnung}“: ${fmt(r.menge)} ${r.einheit} aufgemessen, vereinbart waren ${fmt(vereinbarteMenge(r))} ${r.einheit}${r.nachtragMenge ? ` (Vertrag ${fmt(r.vertragsmenge!)} + Nachtrag ${fmt(r.nachtragMenge)})` : ''} – Mehrmenge ${fmt(r.mehrmenge)} ${r.einheit}${r.neuMehrmenge > 0 ? `, davon ${fmt(r.neuMehrmenge)} ${r.einheit} in dieser Rechnung` : ''}. Bitte Nachtrag bzw. Vereinbarung mit dem Auftraggeber prüfen.`);
  }
  const positionen = zeilen.filter((r) => r.neu > 0 && r.einzelpreis > 0).map((r) => ({
    bezeichnung: `${r.bezeichnung} – Zwischenaufmaß ${zwischenaufmassNr(z)} vom ${datum}: kumuliert ${fmt(r.menge)} ${r.einheit} abzüglich bereits abgerechnet ${fmt(r.bisher)} ${r.einheit}`.slice(0, 500),
    menge: r.neu, einheit: r.einheit, einzelpreis: r.einzelpreis,
  }));
  const ohnePreis = zeilen.filter((r) => r.neu > 0 && !(r.einzelpreis > 0));
  if (ohnePreis.length) return { positionen: [], fehler: `Für ${ohnePreis.map((r) => `„${r.bezeichnung}“`).join(', ')} fehlt der Preis.`, hinweise };
  if (!positionen.length) return { positionen: [], fehler: `Für ${zwischenaufmassNr(z)} gibt es keine neue Menge: alles bis zum Stichtag ist schon abgerechnet.`, hinweise };
  return { positionen, fehler: null, hinweise };
}

/** True, wenn dieses Zwischenaufmaß der aktuellste Stand ist (höchste Nr.). Nur dann kann es das Schlussaufmaß sein. */
export function istLetzterStand(z: Zwischenaufmass, liste: Zwischenaufmass[]): boolean {
  return liste.every((x) => x.nr <= z.nr);
}

/**
 * Schlussrechnung aus dem Schlussaufmaß: Die Schlussrechnung weist die GESAMTLEISTUNG aus (kumulierte Menge je Position × Preis); bereits
 * gestellte Abschläge werden in der Rechnung abgezogen (netto, siehe lib/schlussrechnung.ts). Die Differenz zur schon abgerechneten Menge
 * ist damit der Zahlbetrag und wird zusätzlich als Mengenübersicht im Rechnungstext ausgewiesen. Bereits abgerechnete Mengen werden
 * nicht einzeln gekürzt, sondern über den Abzug der Abschläge verrechnet (§ 14 Abs. 5 UStG).
 */
export function baueSchlussaufmassPositionen(z: Zwischenaufmass, liste: Zwischenaufmass[]): {
  positionen: { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }[]
  fehler: string | null
  hinweise: string[]
  /** Text für die Rechnung: je Position Gesamt, bereits abgerechnet, Rest */
  mengenuebersicht: string
  /** bereits über Zwischenaufmaße abgerechneter Wert (Menge × Preis), netto – Vergleichswert für den Abzug der Abschläge */
  bisherNetto: number
  /** Gesamtleistung dieser Positionen, netto */
  gesamtNetto: number
} {
  const leer = (fehler: string) => ({ positionen: [], fehler, hinweise: [] as string[], mengenuebersicht: '', bisherNetto: 0, gesamtNetto: 0 })
  const nr = zwischenaufmassNr(z)
  if (z.rechnungId) return leer(`${nr} ist bereits mit Rechnung ${z.rechnungNr || ''} abgerechnet.`.replace('  ', ' '))
  if (!z.positionen?.length) return leer(`${nr} wurde nur mit der Gesamtfläche erfasst. Für das Schlussaufmaß je Position bitte ein Zwischenaufmaß je Position erfassen.`)
  if (!istLetzterStand(z, liste)) return leer(`${nr} ist nicht der letzte Stand. Das Schlussaufmaß muss das aktuellste Zwischenaufmaß sein.`)
  const zeilen = zaZeilen(z, liste).filter((r) => r.menge > 0)
  const ohnePreis = zeilen.filter((r) => !(r.einzelpreis > 0))
  if (ohnePreis.length) return leer(`Für ${ohnePreis.map((r) => `„${r.bezeichnung}“`).join(', ')} fehlt der Preis.`)
  if (!zeilen.length) return leer(`${nr} enthält keine Menge.`)
  const d = new Date(z.stichtag + 'T12:00:00')
  const datum = Number.isNaN(d.getTime()) ? z.stichtag : d.toLocaleDateString('de-DE')
  const positionen = zeilen.map((r) => ({
    bezeichnung: `${r.bezeichnung} – Schlussaufmaß ${nr} vom ${datum}: Gesamtleistung ${fmt(r.menge)} ${r.einheit}`.slice(0, 500),
    menge: r.menge, einheit: r.einheit, einzelpreis: r.einzelpreis,
  }))
  const hinweise: string[] = []
  for (const r of zaZeilen(z, liste)) {
    if (r.mehrmenge > 0) hinweise.push(`„${r.bezeichnung}“: ${fmt(r.menge)} ${r.einheit} aufgemessen, vereinbart waren ${fmt(vereinbarteMenge(r))} ${r.einheit}${r.nachtragMenge ? ` (Vertrag ${fmt(r.vertragsmenge!)} + Nachtrag ${fmt(r.nachtragMenge)})` : ''} – Mehrmenge ${fmt(r.mehrmenge)} ${r.einheit}. Bitte Nachtrag bzw. Vereinbarung mit dem Auftraggeber prüfen.`)
    if (r.zuViel > 0) hinweise.push(`„${r.bezeichnung}“: ${fmt(r.zuViel)} ${r.einheit} mehr abgerechnet (${fmt(r.bisher)}) als aufgemessen (${fmt(r.menge)}). Nicht automatisch korrigiert – bitte Gutschrift oder Korrektur prüfen.`)
  }
  const mengenuebersicht = `Schlussaufmaß ${nr} (Stichtag ${datum}): ` + zeilen.map((r) => `${r.bezeichnung} ${fmt(r.menge)} ${r.einheit} gesamt, davon bereits abgerechnet ${fmt(r.bisher)} ${r.einheit}, Rest ${fmt(r.neu)} ${r.einheit}`).join('; ') + '.'
  return {
    positionen, fehler: null, hinweise, mengenuebersicht,
    bisherNetto: runde2(zeilen.reduce((s, r) => s + Math.min(r.bisher, r.menge) * r.einzelpreis, 0)),
    gesamtNetto: runde2(zeilen.reduce((s, r) => s + r.menge * r.einzelpreis, 0)),
  }
}

// ─── Änderungsverlauf (Menge je Position, wer/wann/warum) ───

export interface AufmassAenderung {
  aktion: 'aufmass_erfasst' | 'aufmass_geloescht' | 'aufmass_abgerechnet'
  nr: string
  stichtag: string
  notiz: string
  rechnungNr?: string
  flaecheM2: { von: number | null; auf: number | null }
  positionen: { bezeichnung: string; einheit: string; von: number | null; auf: number | null }[]
}

/** Vergleicht zwei Stände der Zwischenaufmaße und liefert, was neu erfasst, gelöscht oder abgerechnet wurde. */
export function aenderungenZwischenaufmasse(alt: unknown, neu: unknown): AufmassAenderung[] {
  const a = normalisiereZwischenaufmasse(alt); const n = normalisiereZwischenaufmasse(neu);
  const out: AufmassAenderung[] = [];
  const stand = (liste: Zwischenaufmass[], vorNr: number) => { const m = new Map<string, number>(); for (const z of [...liste].sort((x, y) => x.nr - y.nr)) { if (z.nr >= vorNr) break; for (const p of z.positionen || []) m.set(p.key, p.menge); } return m; };
  const pos = (z: Zwischenaufmass, liste: Zwischenaufmass[], loeschen: boolean) => {
    const vor = stand(liste, z.nr);
    return (z.positionen || []).map((p) => ({ bezeichnung: p.bezeichnung, einheit: p.einheit, von: vor.get(p.key) ?? null, auf: loeschen ? null : p.menge }));
  };
  const vorFlaeche = (liste: Zwischenaufmass[], nr: number) => [...liste].filter((x) => x.nr < nr).sort((x, y) => x.nr - y.nr).pop()?.flaecheM2 ?? null;
  for (const z of n) {
    const o = a.find((x) => x.id === z.id);
    if (!o) out.push({ aktion: 'aufmass_erfasst', nr: zwischenaufmassNr(z), stichtag: z.stichtag, notiz: z.notiz, flaecheM2: { von: vorFlaeche(n, z.nr), auf: z.flaecheM2 }, positionen: pos(z, n, false) });
    else if (!o.rechnungId && z.rechnungId) out.push({ aktion: 'aufmass_abgerechnet', nr: zwischenaufmassNr(z), stichtag: z.stichtag, notiz: z.notiz, rechnungNr: z.rechnungNr, flaecheM2: { von: o.flaecheM2, auf: z.flaecheM2 }, positionen: pos(z, n, false) });
  }
  for (const o of a) if (!n.some((z) => z.id === o.id)) out.push({ aktion: 'aufmass_geloescht', nr: zwischenaufmassNr(o), stichtag: o.stichtag, notiz: o.notiz, flaecheM2: { von: o.flaecheM2, auf: null }, positionen: pos(o, a, true) });
  return out;
}

/** Nachträge (IDs), deren Menge über ein Zwischenaufmaß abgerechnet wird; ihr Betrag darf nicht zusätzlich als Nachtrags-Pauschale berechnet werden. */
export function nachtraegeUeberAufmass(liste: Zwischenaufmass[]): Set<string> {
  const ids = new Set<string>();
  for (const z of liste) for (const p of z.positionen || []) if ((p.nachtragMenge ?? 0) > 0 && p.nachtragId) ids.add(p.nachtragId);
  return ids;
}

/** IDs der Rechnungen, mit denen Zwischenaufmaße (vor dem Schlussaufmaß) bereits abgerechnet wurden: genau diese Abschläge gehören beim Schlussaufmaß in den Abzug. */
export function rechnungenAusAufmass(liste: Zwischenaufmass[], schlussId: string): Set<string> {
  return new Set(liste.filter((z) => z.id !== schlussId && z.rechnungId).map((z) => z.rechnungId!));
}
