// ============================================================
// SCAFFOLD OS – Nachträge am Auftrag (reine Logik)
//
// Ein Nachtrag ist eine zusätzliche Leistung, die erst NACH dem Angebot
// entsteht (z. B. Bauherr will Gerüst verlängern). Er wird beim Auftrag
// (projects.data.nachtraege) mit Grund, Datum, Fotos, Betrag und Status
// festgehalten. Beträge netto (zzgl. gesetzlicher MwSt.).
// ============================================================

export type NachtragStatus = 'offen' | 'bestaetigt' | 'abgelehnt';

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
    }));
}

export function parseBetrag(s: string): number {
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  // "1.250,50" → 1250.5 ; "250" → 250 ; "250.5" (Punkt als Dezimal) → s. unten
  if (Number.isFinite(n) && !/,/.test(s) && /^\d+\.\d{1,2}$/.test(String(s).trim())) return parseFloat(String(s));
  return Number.isFinite(n) ? n : 0;
}

export function neuerNachtrag(
  liste: Nachtrag[],
  eingabe: { datum: string; titel: string; grund: string; betrag: number; fotos: NachtragFoto[] },
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
  };
}

export function setzeNachtragStatus(liste: Nachtrag[], id: string, status: NachtragStatus, heute: string): Nachtrag[] {
  return liste.map((n) => (n.id === id ? { ...n, status, statusDatum: heute } : n));
}

export function nachtragSummen(liste: Nachtrag[]): Record<NachtragStatus, number> {
  const s: Record<NachtragStatus, number> = { offen: 0, bestaetigt: 0, abgelehnt: 0 };
  for (const n of liste) s[n.status] += n.betrag;
  return { offen: Math.round(s.offen * 100) / 100, bestaetigt: Math.round(s.bestaetigt * 100) / 100, abgelehnt: Math.round(s.abgelehnt * 100) / 100 };
}
