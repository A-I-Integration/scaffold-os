import type { SpesenTagZeile } from './spesen-export';

// Lädt die Tages-Spesen (Tabelle spesen_tage) für einen Zeitraum. Fehlt die Tabelle noch (SQL phase-138 nicht ausgeführt),
// kommt eine leere Liste zurück: dann zählen wie bisher die Handeingaben der Zeitbuchungen.
export async function ladeSpesenTage(von: string, bis: string, employeeIds?: string[]): Promise<{ tage: SpesenTagZeile[]; tabelleFehlt: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const filter = employeeIds?.length ? `&employee_id=in.(${employeeIds.join(',')})` : '';
  const r = await fetch(`${url}/rest/v1/spesen_tage?select=employee_id,work_date,einsatzart,vorschlag_tarif,vorschlag_steuer,betrag_manuell&work_date=gte.${von}&work_date=lte.${bis}${filter}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) { const t = await r.text(); if (/spesen_tage/.test(t)) return { tage: [], tabelleFehlt: true }; throw new Error(t); }
  return { tage: await r.json(), tabelleFehlt: false };
}
