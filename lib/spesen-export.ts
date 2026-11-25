// ============================================================
// SCAFFOLD OS – Spesen für den Lohn-Export (CSV)
// Je Mitarbeiter und Tag zählt genau ein Betrag, damit nichts doppelt gerechnet wird:
//  • gibt es eine Tagesberechnung (Tabelle spesen_tage), gilt deren Endbetrag (von Hand überschriebener Betrag vor Vorschlag),
//  • sonst die von Hand erfasste Summe aus der Zeiterfassung (Feld Spesen in den Zeiteinträgen).
// ============================================================
import { EINSATZ_LABEL, endbetrag } from './spesen';

export interface SpesenEintrag { employee_id: string; work_date: string; spesen_euro?: number | string | null }
export interface SpesenTagZeile { employee_id: string; work_date: string; einsatzart: string; vorschlag_steuer: number | string; betrag_manuell?: number | string | null; vorschlag_tarif: number | string }
export interface SpesenZeileExport { employee_id: string; work_date: string; betrag: number; steuer: number | null; einsatzart: string; quelle: string }

const cent = (n: number) => Math.round(n * 100) / 100;

export function spesenJeTag(eintraege: SpesenEintrag[], tage: SpesenTagZeile[]): SpesenZeileExport[] {
  const ergebnis = new Map<string, SpesenZeileExport>();
  for (const t of tage) {
    ergebnis.set(`${t.employee_id}|${t.work_date}`, {
      employee_id: t.employee_id, work_date: t.work_date, betrag: cent(endbetrag(t)), steuer: cent(Number(t.vorschlag_steuer || 0)),
      einsatzart: EINSATZ_LABEL[t.einsatzart] || t.einsatzart, quelle: t.betrag_manuell != null ? 'Tagesberechnung, von Hand geändert' : 'Tagesberechnung',
    });
  }
  const hand = new Map<string, number>();
  for (const e of eintraege) {
    const k = `${e.employee_id}|${e.work_date}`;
    if (ergebnis.has(k)) continue;
    const v = Number(e.spesen_euro || 0);
    if (v > 0) hand.set(k, (hand.get(k) || 0) + v);
  }
  for (const [k, v] of hand) { const [employee_id, work_date] = k.split('|'); ergebnis.set(k, { employee_id, work_date, betrag: cent(v), steuer: null, einsatzart: '', quelle: 'Handeingabe' }); }
  return [...ergebnis.values()].sort((a, b) => (a.employee_id + a.work_date).localeCompare(b.employee_id + b.work_date));
}

const zq = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
const zahl = (n: number) => String(n).replace('.', ',');
const datumDe = (d: string) => d.split('-').reverse().join('.');

/** CSV mit einer Zeile je Mitarbeiter und Tag; am Ende die Summe je Mitarbeiter. Schreibt auch den Monat der Auszahlung. */
export function spesenCsv(zeilen: SpesenZeileExport[], mitarbeiter: Record<string, { nachname: string; vorname: string; pnr: string }>, auszahlungsMonat: string | null): string {
  const kopf = 'Personalnummer;Nachname;Vorname;Datum;Spesen Tarif/Hand (EUR);Steuerliche Pauschale zum Vergleich (EUR);Einsatzart;Herkunft;Auszahlung mit Lohn für';
  const auszahl = auszahlungsMonat ? auszahlungsMonat.split('-').reverse().join('/') : '';
  const out = [kopf];
  const summen = new Map<string, number>();
  for (const z of zeilen) {
    const m = mitarbeiter[z.employee_id]; if (!m) continue;
    out.push([zq(m.pnr), zq(m.nachname), zq(m.vorname), datumDe(z.work_date), zahl(z.betrag), z.steuer === null ? '' : zahl(z.steuer), zq(z.einsatzart), zq(z.quelle), auszahl].join(';'));
    summen.set(z.employee_id, cent((summen.get(z.employee_id) || 0) + z.betrag));
  }
  for (const [id, s] of summen) { const m = mitarbeiter[id]; out.push([zq(m.pnr), zq(m.nachname), zq(m.vorname), zq('SUMME'), zahl(s), '', '', '', auszahl].join(';')); }
  return out.join('\r\n');
}
