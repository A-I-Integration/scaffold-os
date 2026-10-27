// ============================================================
// SCAFFOLD OS – Nachträge am Auftrag (reine Logik)
//
// Ein Nachtrag ist eine zusätzliche Leistung, die erst NACH dem Angebot
// entsteht (z. B. Bauherr will Gerüst verlängern). Er wird beim Auftrag
// (projects.data.nachtraege) mit Grund, Datum, Fotos, Betrag und Status
// festgehalten. Beträge netto (zzgl. gesetzlicher MwSt.).
// ============================================================

export type NachtragStatus = 'offen' | 'bestaetigt' | 'abgelehnt';

export type NachtragArt = 'verlaengerung' | 'regie';

/** Standzeit-Verlängerung: Wochen × Preis je Woche (netto). */
export interface Verlaengerung { wochen: number; preisProWoche: number; bis?: string }

/** Stundenabrechnung (Regie): je Zeile Personen × Stunden × Satz (netto). */
export interface RegieZeile { bezeichnung: string; personen: number; stunden: number; satz: number }

export interface NachtragFoto { url: string; file_name: string }

export interface Nachtrag {
  id: string;
  nr: number;
  /** Datum der Leistung/Anforderung (YYYY-MM-DD) */
  datum: string;
  /** Kurzbeschreibung der zusätzlichen Leistung */
  titel: string;
  /** Anlass / Grund des Nachtrags */
  grund: string;
  /** Betrag netto in € */
  betrag: number;
  fotos: NachtragFoto[];
  status: NachtragStatus;
  /** Datum der letzten Statusänderung (YYYY-MM-DD) */
  statusDatum?: string;
  erstelltAm: string;
  /** Auf der Baustelle gemeldet (Meine Touren); Betrag darf zunächst 0 sein und wird vom Büro ergänzt. */
  vorOrt?: boolean;
  /** Art der Zusatzleistung; ohne Angabe ein frei erfasster Nachtrag mit Pauschalbetrag. */
  art?: NachtragArt;
  verlaengerung?: Verlaengerung;
  regie?: RegieZeile[];
}

export const NACHTRAG_STATUS_LABEL: Record<NachtragStatus, string> = {
  offen: 'Offen',
  bestaetigt: 'Vom Kunden bestätigt',
  abgelehnt: 'Abgelehnt',
};

export function nachtragNummer(n: Pick<Nachtrag, 'nr'>): string {
  return `N-${String(n.nr).padStart(2, '0')}`;
}

export function naechsteNachtragNr(liste: Pick<Nachtrag, 'nr'>[]): number {
  return liste.reduce((m, n) => Math.max(m, Number(n.nr) || 0), 0) + 1;
}

const STATUS = new Set<string>(['offen', 'bestaetigt', 'abgelehnt']);

/** Liest gespeicherte Nachträge defensiv (alte/fehlerhafte Daten brechen die Seite nicht). */
export function normalisiereNachtraege(raw: unknown): Nachtrag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object' && typeof (x as any).id === 'string')
    .map((x: any): Nachtrag => ({
      id: x.id,
      nr: Number(x.nr) || 0,
      datum: String(x.datum || ''),
      titel: String(x.titel || ''),
      grund: String(x.grund || ''),
      betrag: Number(x.betrag) || 0,
      fotos: Array.isArray(x.fotos)
        ? x.fotos.filter((f: any) => f && typeof f.url === 'string').map((f: any) => ({ url: f.url, file_name: String(f.file_name || '') }))
        : [],
      status: STATUS.has(x.status) ? x.status : 'offen',
      statusDatum: x.statusDatum ? String(x.statusDatum) : undefined,
      erstelltAm: String(x.erstelltAm || ''),
      ...(x.vorOrt === true ? { vorOrt: true } : {}),
      ...(x.art === 'verlaengerung' && x.verlaengerung ? { art: 'verlaengerung' as const, verlaengerung: normVerlaengerung(x.verlaengerung) } : {}),
      ...(x.art === 'regie' && Array.isArray(x.regie) ? { art: 'regie' as const, regie: x.regie.map(normRegie) } : {}),
    }));
}

const zahl0 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 };
const runde2 = (n: number) => Math.round(n * 100) / 100;

function normVerlaengerung(v: any): Verlaengerung {
  return { wochen: zahl0(v?.wochen), preisProWoche: zahl0(v?.preisProWoche), ...(v?.bis ? { bis: String(v.bis) } : {}) };
}
function normRegie(z: any): RegieZeile {
  return { bezeichnung: String(z?.bezeichnung || ''), personen: zahl0(z?.personen), stunden: zahl0(z?.stunden), satz: zahl0(z?.satz) };
}

export function verlaengerungBetrag(v: Verlaengerung): number { return runde2(zahl0(v.wochen) * zahl0(v.preisProWoche)); }
export function regieBetrag(zeilen: RegieZeile[]): number { return runde2(zeilen.reduce((s, z) => s + zahl0(z.personen) * zahl0(z.stunden) * zahl0(z.satz), 0)); }
export function regieStunden(zeilen: RegieZeile[]): number { return runde2(zeilen.reduce((s, z) => s + zahl0(z.personen) * zahl0(z.stunden), 0)); }

/** Fehlende Angaben einer Verlängerung bzw. Stundenabrechnung (leer = vollständig). */
export function artFehlt(art: NachtragArt | undefined, v?: Verlaengerung, regie?: RegieZeile[]): string[] {
  const f: string[] = [];
  if (art === 'verlaengerung') {
    if (!(zahl0(v?.wochen) > 0)) f.push('Wochen');
    if (!(zahl0(v?.preisProWoche) > 0)) f.push('Preis je Woche');
  }
  if (art === 'regie') {
    if (!regie || regie.length === 0) f.push('mindestens eine Zeile');
    (regie || []).forEach((z, i) => {
      const m: string[] = [];
      if (!z.bezeichnung.trim()) m.push('Bezeichnung');
      if (!(zahl0(z.personen) > 0)) m.push('Personen');
      if (!(zahl0(z.stunden) > 0)) m.push('Stunden');
      if (!(zahl0(z.satz) > 0)) m.push('Satz');
      if (m.length) f.push(`Zeile ${i + 1}: ${m.join(', ')}`);
    });
  }
  return f;
}

export interface NachtragRechnungsPosition { bezeichnung: string; menge: number; einheit: string; einzelpreis: number }

/** Positionen für die Rechnung: Verlängerung als Wochen × Preis, Regie je Zeile als Stunden × Satz, sonst Pauschale. */
export function nachtragPositionen(n: Nachtrag): NachtragRechnungsPosition[] {
  const d = new Date(n.datum + 'T12:00:00');
  const datum = Number.isNaN(d.getTime()) ? n.datum : d.toLocaleDateString('de-DE');
  const kopf = `Nachtrag ${nachtragNummer(n)} vom ${datum}`;
  if (n.art === 'verlaengerung' && n.verlaengerung && verlaengerungBetrag(n.verlaengerung) > 0) {
    const v = n.verlaengerung;
    const bis = v.bis ? ` bis ${new Date(v.bis + 'T12:00:00').toLocaleDateString('de-DE')}` : '';
    return [{ bezeichnung: `${kopf}: ${n.titel} (${v.wochen.toLocaleString('de-DE')} Wochen${bis})`, menge: v.wochen, einheit: 'Wo.', einzelpreis: v.preisProWoche }];
  }
  if (n.art === 'regie' && n.regie && regieBetrag(n.regie) > 0) {
    return n.regie.filter((z) => z.personen > 0 && z.stunden > 0 && z.satz > 0).map((z) => ({
      bezeichnung: `${kopf}: ${n.titel} – ${z.bezeichnung} (${z.personen.toLocaleString('de-DE')} Mitarbeiter × ${z.stunden.toLocaleString('de-DE')} Std.)`,
      menge: runde2(z.personen * z.stunden), einheit: 'Std.', einzelpreis: z.satz,
    }));
  }
  return n.betrag > 0 ? [{ bezeichnung: `${kopf}: ${n.titel}`, menge: 1, einheit: 'Pauschale', einzelpreis: runde2(n.betrag) }] : [];
}

export function parseBetrag(s: string): number {
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  // "1.250,50" → 1250.5 ; "250" → 250 ; "250.5" (Punkt als Dezimal) → s. unten
  if (Number.isFinite(n) && !/,/.test(s) && /^\d+\.\d{1,2}$/.test(String(s).trim())) return parseFloat(String(s));
  return Number.isFinite(n) ? n : 0;
}

export function neuerNachtrag(
  liste: Nachtrag[],
  eingabe: { datum: string; titel: string; grund: string; betrag: number; fotos: NachtragFoto[]; vorOrt?: boolean; art?: NachtragArt; verlaengerung?: Verlaengerung; regie?: RegieZeile[] },
  id: string,
  jetzt: Date = new Date(),
): Nachtrag {
  return {
    id,
    nr: naechsteNachtragNr(liste),
    datum: eingabe.datum,
    titel: eingabe.titel.trim(),
    grund: eingabe.grund.trim(),
    betrag: Math.round(eingabe.betrag * 100) / 100,
    fotos: eingabe.fotos,
    status: 'offen',
    erstelltAm: jetzt.toISOString(),
    ...(eingabe.vorOrt ? { vorOrt: true } : {}),
    ...(eingabe.art === 'verlaengerung' && eingabe.verlaengerung ? { art: 'verlaengerung' as const, verlaengerung: eingabe.verlaengerung } : {}),
    ...(eingabe.art === 'regie' && eingabe.regie ? { art: 'regie' as const, regie: eingabe.regie } : {}),
  };
}

/** Trägt/ändert den Betrag eines OFFENEN Nachtrags (Büro ergänzt Meldungen von der Baustelle). */
export function setzeNachtragBetrag(liste: Nachtrag[], id: string, betrag: number): Nachtrag[] {
  const b = Math.round(betrag * 100) / 100;
  return liste.map((n) => (n.id === id && n.status === 'offen' ? { ...n, betrag: b } : n));
}

/** Ein Nachtrag ohne Betrag ist noch nicht versandfertig (kein PDF, keine Bestätigung). */
export function nachtragBraeuchteBetrag(n: Pick<Nachtrag, 'betrag'>): boolean {
  return !(n.betrag > 0);
}

export function setzeNachtragStatus(liste: Nachtrag[], id: string, status: NachtragStatus, heute: string): Nachtrag[] {
  return liste.map((n) => (n.id === id ? { ...n, status, statusDatum: heute } : n));
}

export function nachtragSummen(liste: Nachtrag[]): Record<NachtragStatus, number> {
  const s: Record<NachtragStatus, number> = { offen: 0, bestaetigt: 0, abgelehnt: 0 };
  for (const n of liste) s[n.status] += n.betrag;
  return { offen: Math.round(s.offen * 100) / 100, bestaetigt: Math.round(s.bestaetigt * 100) / 100, abgelehnt: Math.round(s.abgelehnt * 100) / 100 };
}
