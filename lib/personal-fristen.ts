import { AUSWEIS_LABEL } from './personalstamm';
import { tageBisAblauf, VORWARN_TAGE } from './personal-dokumente';

// ============================================================
// SCAFFOLD OS – Fristen aus Personalstamm und Dokumenten (Ausweis, Reisepass, Führerschein, Dokumente)
// Gemeinsame Grundlage für die Anzeige im Reiter „Dokumente“ und die E-Mail-Erinnerung (Cron).
// ============================================================

export interface PersonalFrist { schluessel: string; employee_id: string; mitarbeiter: string; was: string; gueltig_bis: string }

interface MaZeile { id: string; first_name: string; last_name: string; status?: string | null; license_expires?: string | null }
interface PersonalZeile { employee_id: string; ausweisart?: string | null; ausweis_gueltig_bis?: string | null; reisepass_gueltig_bis?: string | null }
interface DokZeile { id: string; employee_id: string; bezeichnung: string; gueltig_bis: string | null }

/** Fristen aus dem Stamm (nur aktive Mitarbeiter). */
export function sammleStammFristen(mitarbeiter: MaZeile[], personal: PersonalZeile[]): PersonalFrist[] {
  const pro = new Map(personal.map(p => [p.employee_id, p]));
  const aus: PersonalFrist[] = [];
  for (const m of mitarbeiter) {
    if (m.status && m.status !== 'active') continue;
    const name = `${m.first_name} ${m.last_name}`;
    const p = pro.get(m.id);
    if (p?.ausweis_gueltig_bis) aus.push({ schluessel: `ausweis:${m.id}`, employee_id: m.id, mitarbeiter: name, was: p.ausweisart ? (AUSWEIS_LABEL[p.ausweisart] || 'Ausweisdokument') : 'Ausweisdokument', gueltig_bis: p.ausweis_gueltig_bis });
    if (p?.reisepass_gueltig_bis) aus.push({ schluessel: `reisepass:${m.id}`, employee_id: m.id, mitarbeiter: name, was: 'Reisepass', gueltig_bis: p.reisepass_gueltig_bis });
    if (m.license_expires) aus.push({ schluessel: `fuehrerschein:${m.id}`, employee_id: m.id, mitarbeiter: name, was: 'Führerschein', gueltig_bis: m.license_expires });
  }
  return aus;
}

export function sammleDokumentFristen(mitarbeiter: MaZeile[], dokumente: DokZeile[]): PersonalFrist[] {
  const namen = new Map(mitarbeiter.filter(m => !m.status || m.status === 'active').map(m => [m.id, `${m.first_name} ${m.last_name}`]));
  return dokumente
    .filter(d => d.gueltig_bis && namen.has(d.employee_id))
    .map(d => ({ schluessel: `dokument:${d.id}`, employee_id: d.employee_id, mitarbeiter: namen.get(d.employee_id)!, was: d.bezeichnung, gueltig_bis: d.gueltig_bis! }));
}

/** Fristen, die innerhalb der Vorwarnzeit ablaufen (0 bis 30 Tage) und für dieses Ablaufdatum noch nicht gemeldet wurden. Überfällige lösen keine Mail aus. */
export function neueErinnerungen(fristen: PersonalFrist[], gesendet: Set<string>, heute: string, tage = VORWARN_TAGE): PersonalFrist[] {
  return fristen
    .filter(f => {
      const t = tageBisAblauf(f.gueltig_bis, heute);
      return t !== null && t >= 0 && t <= tage && !gesendet.has(`${f.schluessel}|${f.gueltig_bis}`);
    })
    .sort((a, b) => a.gueltig_bis.localeCompare(b.gueltig_bis));
}
