// ============================================================
// SCAFFOLD OS – Spesen zentral: eine Quelle für Stundenzettel, Lohnkosten je Baustelle, Auftragsstand und Exporte
//
// Regel: Je Mitarbeiter und Tag zählt genau ein Betrag.
//  • Gibt es eine Tagesberechnung (Tabelle spesen_tage), gilt deren Endbetrag (von Hand geänderter Betrag vor Vorschlag).
//    Die alten Spesenfelder der Zeitbuchungen dieses Tages werden dann NICHT zusätzlich gezählt.
//  • Gibt es keine, zählt wie bisher die Handeingabe der Zeitbuchung (Feld Spesen).
// Der Tagesbetrag wird auf die Baustellen verteilt, und zwar im Verhältnis der gebuchten Stunden dieses Tages
// (auf Cent genau, Restcents gehen an den größten Rest; die Summe bleibt immer erhalten).
// Hat ein Tag mit Tagesberechnung keine Buchung mit Stunden, bleibt der Betrag „ohne Zuordnung“ stehen und geht nicht verloren.
// ============================================================
import { endbetrag } from './spesen';
import type { SpesenTagZeile } from './spesen-export';

export interface SpesenBuchung { employee_id: string; project_id?: string | null; work_date: string; hours?: number | string | null; spesen_euro?: number | string | null }
export interface OhneZuordnung { employee_id: string; work_date: string; betrag: number; grund: string }
export interface SpesenVerteilung {
  /** Betrag je Buchung, gleiche Reihenfolge wie die Eingabe */
  jeBuchung: number[];
  ohneZuordnung: OhneZuordnung[];
  gesamt: number;
}

const cents = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };

/** Verteilt `summe` (in Cent) im Verhältnis der Gewichte auf ganze Cent; die Summe bleibt exakt erhalten. */
export function verteileCents(summe: number, gewichte: number[]): number[] {
  const gesamt = gewichte.reduce((s, g) => s + g, 0);
  if (summe <= 0 || gesamt <= 0) return gewichte.map(() => 0);
  const roh = gewichte.map(g => (summe * g) / gesamt);
  const unten = roh.map(Math.floor);
  let rest = summe - unten.reduce((s, x) => s + x, 0);
  const reihenfolge = roh.map((r, i) => ({ i, bruch: r - Math.floor(r) })).sort((a, b) => b.bruch - a.bruch || a.i - b.i);
  for (const { i } of reihenfolge) { if (rest <= 0) break; unten[i] += 1; rest--; }
  return unten;
}

export function verteileSpesen(buchungen: SpesenBuchung[], tage: SpesenTagZeile[]): SpesenVerteilung {
  const tagMap = new Map(tage.map(t => [`${t.employee_id}|${t.work_date}`, t]));
  const jeBuchung = buchungen.map(() => 0);
  const ohneZuordnung: OhneZuordnung[] = [];
  const nachTag = new Map<string, number[]>();
  buchungen.forEach((b, i) => { const k = `${b.employee_id}|${b.work_date}`; (nachTag.get(k) ?? nachTag.set(k, []).get(k)!).push(i); });

  for (const [k, indizes] of nachTag) {
    const tag = tagMap.get(k);
    if (!tag) { for (const i of indizes) jeBuchung[i] = cents(buchungen[i].spesen_euro) / 100; continue; }
    const summe = cents(endbetrag(tag));
    const gewichte = indizes.map(i => Math.round(Math.max(0, Number(buchungen[i].hours) || 0) * 3600));
    if (!gewichte.some(g => g > 0)) { if (summe > 0) ohneZuordnung.push({ employee_id: tag.employee_id, work_date: tag.work_date, betrag: summe / 100, grund: 'Keine Buchung mit Stunden an diesem Tag' }); continue; }
    verteileCents(summe, gewichte).forEach((c, n) => { jeBuchung[indizes[n]] = c / 100; });
  }
  // Tage mit Tagesberechnung, aber ganz ohne Zeitbuchung
  for (const t of tage) {
    if (nachTag.has(`${t.employee_id}|${t.work_date}`)) continue;
    const c = cents(endbetrag(t));
    if (c > 0) ohneZuordnung.push({ employee_id: t.employee_id, work_date: t.work_date, betrag: c / 100, grund: 'Keine Zeitbuchung an diesem Tag' });
  }
  const gesamt = Math.round((jeBuchung.reduce((s, x) => s + x, 0) + ohneZuordnung.reduce((s, x) => s + x.betrag, 0)) * 100) / 100;
  return { jeBuchung, ohneZuordnung, gesamt };
}
