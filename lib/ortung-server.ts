import { berlinLokal, erkenneAufenthalte, schlageAbschnitteVor, type Ort, type Pos, type Vorschlag } from './ortung';
import { leseAlleZeilen } from './zeit-validierung';
import { ueberschneidet } from './zeit-abschnitte';

// Leitet für einen Mitarbeiter und Tag Abschnitts-Vorschläge aus Touren und Fahrzeug-Positionen ab (nur lesend).

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const headers = () => { const k = process.env.SUPABASE_SERVICE_ROLE_KEY!; return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }; };

async function lesen<T = any>(pfad: string): Promise<T[]> {
  const r = await fetch(`${url()}/rest/v1/${pfad}`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface TourVorschlag { tour: string; vorschlaege: (Vorschlag & { bereitsVorhanden: boolean })[]; hinweise: string[] }

export async function leiteVorschlaegeAb(employeeId: string, datum: string): Promise<{ touren: TourVorschlag[]; hinweise: string[] }> {
  const [y, m, d] = datum.split('-').map(Number);
  const von = berlinLokal(y, m, d, 0, 0, 0).toISOString();
  const bis = new Date(Date.parse(von) + 24 * 3600000).toISOString();
  const alle = await lesen(`tours?select=id,name,vehicle_id,driver_id,team_ids,departed_at,returned_at&planned_date=eq.${datum}`);
  const meine = alle.filter((t: any) => t.driver_id === employeeId || (Array.isArray(t.team_ids) && t.team_ids.includes(employeeId)));
  let vorhanden: { id: string; start_time: string; end_time: string }[] = [];
  try { vorhanden = await lesen(`zeit_abschnitte?select=id,start_time,end_time&employee_id=eq.${employeeId}&work_date=eq.${datum}`); } catch { /* Tabelle fehlt noch */ }
  const touren: TourVorschlag[] = [];
  const hinweise: string[] = [];
  if (!meine.length) hinweise.push('An diesem Tag ist der Mitarbeiter in keiner Tour eingeteilt.');
  for (const t of meine) {
    const hint: string[] = [];
    if (!t.vehicle_id) { touren.push({ tour: t.name, vorschlaege: [], hinweise: ['Die Tour hat kein Fahrzeug.'] }); continue; }
    const stopps = await lesen(`tour_stops?select=id,project_id,address,lat,lng&tour_id=eq.${t.id}&order=stop_order.asc`);
    const orte: Ort[] = stopps.filter((s: any) => s.lat !== null && s.lng !== null && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
      .map((s: any) => ({ id: s.id, project_id: s.project_id || null, name: String(s.address || 'Baustelle'), lat: Number(s.lat), lng: Number(s.lng) }));
    if (stopps.length && orte.length < stopps.length) hint.push(`${stopps.length - orte.length} Stopp(s) ohne Koordinaten werden nicht erkannt.`);
    const positionen: Pos[] = (await leseAlleZeilen<any>(`${url()}/rest/v1/gps_tracking?select=created_at,lat,lng&vehicle_id=eq.${t.vehicle_id}&created_at=gte.${von}&created_at=lte.${bis}&order=created_at.asc`, headers()))
      .map(p => ({ t: p.created_at, lat: Number(p.lat), lng: Number(p.lng) }));
    if (!positionen.length) hint.push('Für das Fahrzeug liegen an diesem Tag keine Positionen vor.');
    const erg = schlageAbschnitteVor({ departed_at: t.departed_at, returned_at: t.returned_at }, erkenneAufenthalte(positionen, orte));
    touren.push({
      tour: t.name,
      vorschlaege: erg.vorschlaege.map(v => ({ ...v, bereitsVorhanden: ueberschneidet(v, vorhanden) })),
      hinweise: positionen.length && orte.length ? erg.hinweise : [...hint, ...(orte.length ? [] : ['Die Tour hat keine Stopps mit Koordinaten.'])].filter((x, i, a) => a.indexOf(x) === i),
    });
  }
  return { touren, hinweise };
}
