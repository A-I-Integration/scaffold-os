// ============================================================
// SCAFFOLD OS – Auswertung der Zeiterfassung
// Mitarbeiter wählen, Zeitraum Monat oder Jahr, nur Tage über einer Stundenzahl (z. B. 8 h),
// nach Land der Baustelle filtern. Reine Rechenlogik ohne Datenbank.
// ============================================================

export const STANDARD_LAND = 'Deutschland';
export const LAENDER_VORSCHLAG = ['Deutschland', 'Österreich', 'Schweiz', 'Niederlande', 'Belgien', 'Luxemburg', 'Frankreich', 'Polen', 'Tschechien', 'Dänemark'];

export interface AuswertungEintrag {
  employee_id: string; work_date: string; hours: number | null; project_id?: string | null;
  project?: { id: string; name: string; land?: string | null } | null;
}
export interface AuswertungMitarbeiter { id: string; first_name: string; last_name: string }
export interface AuswertungOptionen { employeeIds: string[]; schwelleStunden: number | null; land: string }

export interface AuswertungTag {
  employee_id: string; name: string; work_date: string;
  stunden: number;        // alle Stunden des Tages
  stundenImLand: number;  // davon auf Baustellen im gewählten Land (ohne Landfilter = stunden)
  laender: string[]; baustellen: string[];
}
export interface AuswertungSumme { employee_id: string; name: string; tage: number; stunden: number; stundenImLand: number; mehrAlsSchwelle: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
export const landVon = (e: AuswertungEintrag): string => (e.project?.land || '').trim() || STANDARD_LAND;

/** Land eingeben: leer = nicht gesetzt (null), sonst bereinigt, höchstens 60 Zeichen. */
export function pruefeLand(roh: unknown): { ok: true; land: string | null } | { ok: false; fehler: string } {
  if (roh === null || roh === undefined) return { ok: true, land: null };
  const s = String(roh).trim().replace(/\s+/g, ' ');
  if (!s) return { ok: true, land: null };
  if (s.length > 60) return { ok: false, fehler: 'Das Land ist zu lang (höchstens 60 Zeichen).' };
  if (/[<>"]/.test(s)) return { ok: false, fehler: 'Das Land enthält ungültige Zeichen.' };
  return { ok: true, land: s };
}

/** Tage je Mitarbeiter nach Auswahl, Stundenschwelle (mehr als X Stunden an dem Tag) und Land der Baustelle. */
export function werteAus(eintraege: AuswertungEintrag[], mitarbeiter: AuswertungMitarbeiter[], opt: AuswertungOptionen): { tage: AuswertungTag[]; summen: AuswertungSumme[] } {
  const name = new Map(mitarbeiter.map(m => [m.id, `${m.last_name}, ${m.first_name}`]));
  const auswahl = opt.employeeIds.length ? new Set(opt.employeeIds) : null;
  const gruppen = new Map<string, AuswertungEintrag[]>();
  for (const e of eintraege) {
    if (auswahl && !auswahl.has(e.employee_id)) continue;
    const k = `${e.employee_id}|${e.work_date}`;
    (gruppen.get(k) ?? gruppen.set(k, []).get(k)!).push(e);
  }
  const tage: AuswertungTag[] = [];
  for (const [, es] of gruppen) {
    const stunden = r2(es.reduce((s, e) => s + (e.hours || 0), 0));
    if (stunden <= 0) continue;
    if (opt.schwelleStunden !== null && !(stunden > opt.schwelleStunden)) continue;
    const imLand = opt.land ? es.filter(e => landVon(e) === opt.land) : es;
    if (opt.land && imLand.length === 0) continue;
    tage.push({
      employee_id: es[0].employee_id, name: name.get(es[0].employee_id) ?? '(unbekannt)', work_date: es[0].work_date,
      stunden, stundenImLand: r2(imLand.reduce((s, e) => s + (e.hours || 0), 0)),
      laender: [...new Set(es.map(landVon))].sort(),
      baustellen: [...new Set(es.map(e => e.project?.name).filter(Boolean) as string[])].sort(),
    });
  }
  tage.sort((a, b) => a.name.localeCompare(b.name, 'de') || a.work_date.localeCompare(b.work_date));
  const sm = new Map<string, AuswertungSumme>();
  for (const t of tage) {
    const s = sm.get(t.employee_id) ?? { employee_id: t.employee_id, name: t.name, tage: 0, stunden: 0, stundenImLand: 0, mehrAlsSchwelle: 0 };
    s.tage += 1; s.stunden = r2(s.stunden + t.stunden); s.stundenImLand = r2(s.stundenImLand + t.stundenImLand);
    if (opt.schwelleStunden !== null) s.mehrAlsSchwelle = r2(s.mehrAlsSchwelle + (t.stunden - opt.schwelleStunden));
    sm.set(t.employee_id, s);
  }
  return { tage, summen: [...sm.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')) };
}

/** Alle in den Daten vorkommenden Länder (für die Auswahl), inkl. Standard. */
export function vorkommendeLaender(eintraege: AuswertungEintrag[]): string[] {
  return [...new Set([STANDARD_LAND, ...eintraege.map(landVon)])].sort((a, b) => a.localeCompare(b, 'de'));
}

const zahlDe = (n: number) => String(n).replace('.', ',');
const datumDe = (d: string) => d.split('-').reverse().join('.');
const zq = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;

export const AUSWERTUNG_KOPF = ['Mitarbeiter', 'Datum', 'Stunden', 'Stunden im Land', 'Land', 'Baustellen'];
export const auswertungZeilen = (tage: AuswertungTag[]): (string | number)[][] =>
  tage.map(t => [t.name, datumDe(t.work_date), t.stunden, t.stundenImLand, t.laender.join(', '), t.baustellen.join(', ')]);

export function auswertungCsv(tage: AuswertungTag[]): string {
  return [AUSWERTUNG_KOPF.join(';'), ...auswertungZeilen(tage).map(z => z.map(v => typeof v === 'number' ? zahlDe(v) : zq(v)).join(';'))].join('\r\n');
}

export const SUMMEN_KOPF = ['Mitarbeiter', 'Tage', 'Stunden', 'Stunden im Land', 'Mehr als Schwelle (h)'];
export const summenZeilen = (s: AuswertungSumme[]): (string | number)[][] => s.map(x => [x.name, x.tage, x.stunden, x.stundenImLand, x.mehrAlsSchwelle]);
