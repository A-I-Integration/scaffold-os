import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse, requireOwnEmployeeOrAdmin } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';
import { berlinDatum, ueberschneidet, pruefeAbschnitt } from '@/lib/zeit-abschnitte';
import { uebergang, verfuegbareKnoepfe, pruefeNachtrag, type Aktion, type Lauf } from '@/lib/zeit-knoepfe';

// ============================================================
// SCAFFOLD OS – Zeit-Knöpfe der Mitarbeiter (Vom Hof gefahren, Baustelle, Pause, Fahrt zum Hof, Stoppen, Nachtragen)
// Jeder eingeloggte Mitarbeiter bedient NUR seine eigenen Abschnitte. Die gebuchten Stunden (time_entries) bleiben unberührt.
// GET → { employee, lauf, knoepfe, abschnitte (heute) }
// POST { aktion, zeit?, project_id? }                          → Knopf drücken
// POST { aktion: 'nachtragen', art, start_time, end_time, project_id?, note? } → Abschnitt nachtragen
// Optional employee_id (Auswahl „Wer bist du?“): Chef/Disposition für jeden, alle anderen nur für sich selbst.
// DELETE ?id=…  → eigenen, selbst erfassten Abschnitt der letzten 7 Tage löschen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AKTIONEN: Aktion[] = ['abfahrt', 'ankunft', 'pause', 'pause_ende', 'rueckfahrt', 'hof', 'stopp'];

async function lesen(pfad: string): Promise<any[]> {
  const r = await fetch(`${url}/rest/v1/${pfad}`, { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

type Mitarbeiter = { id: string; first_name: string; last_name: string };

/** Der Mitarbeiter, für den gestempelt wird: der in „Wer bist du?“ gewählte (Chef/Disposition für jeden, alle anderen nur für sich), sonst der zum Login verknüpfte. */
async function meinMitarbeiter(userId: string, gewaehlt?: unknown): Promise<{ emp: Mitarbeiter | null; verboten?: string }> {
  if (typeof gewaehlt === 'string' && gewaehlt) {
    if (!UUID.test(gewaehlt)) return { emp: null, verboten: 'Der Mitarbeiter ist ungültig.' };
    const a = await requireOwnEmployeeOrAdmin(gewaehlt);
    if (!a.allowed) return { emp: null, verboten: a.error || 'Keine Berechtigung.' };
    const z = await lesen(`employees?select=id,first_name,last_name&id=eq.${gewaehlt}&limit=1`);
    return { emp: z[0] ?? null };
  }
  const z = await lesen(`employees?select=id,first_name,last_name&user_id=eq.${userId}&limit=1`);
  return { emp: z[0] ?? null };
}

async function laufHolen(employeeId: string): Promise<Lauf | null> {
  const z = await lesen(`zeit_lauf?select=art,start_time,project_id,davor_art&employee_id=eq.${employeeId}&limit=1`);
  return z[0] ?? null;
}

async function heutigeAbschnitte(employeeId: string, tag: string) {
  return lesen(`zeit_abschnitte?select=id,art,start_time,end_time,project_id,note,quelle,project:project_id(id,name)&employee_id=eq.${employeeId}&work_date=eq.${tag}&order=start_time.asc`);
}

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN.ALLE);
  if (!rolle.ok) return rolle.response;
  try {
    const m = await meinMitarbeiter(rolle.userId, new URL(req.url).searchParams.get('employee_id'));
    if (m.verboten) return fehler(m.verboten, 403);
    const emp = m.emp;
    if (!emp) return NextResponse.json({ success: true, employee: null });
    let lauf: Lauf | null = null; let abschnitte: any[] = []; let tabelleFehlt = false;
    try {
      lauf = await laufHolen(emp.id);
      abschnitte = await heutigeAbschnitte(emp.id, berlinDatum(new Date().toISOString()));
    } catch { tabelleFehlt = true; }
    return NextResponse.json({ success: true, employee: emp, lauf, knoepfe: verfuegbareKnoepfe(lauf), abschnitte, tabelleFehlt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) { return serverErrorResponse(err, 'zeit-knoepfe/GET'); }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN.ALLE);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  try {
    const m = await meinMitarbeiter(rolle.userId, b?.employee_id);
    if (m.verboten) return fehler(m.verboten, 403);
    const emp = m.emp;
    if (!emp) return fehler('Zu deinem Zugang gibt es keinen Mitarbeiter. Bitte oben „Wer bist du?“ wählen.', 403);
    const jetzt = new Date();
    const projekt = b?.project_id && UUID.test(String(b.project_id)) ? String(b.project_id) : null;

    // ---- Nachtragen ----
    if (b?.aktion === 'nachtragen') {
      const p = pruefeNachtrag({ ...b, project_id: projekt }, emp.id, jetzt);
      if (!p.ok) return fehler(p.fehler);
      const vorhanden = await lesen(`zeit_abschnitte?select=id,start_time,end_time&employee_id=eq.${emp.id}&work_date=eq.${p.daten.work_date}`);
      if (ueberschneidet(p.daten, vorhanden)) return fehler('Der Abschnitt überschneidet sich mit einem vorhandenen Abschnitt.');
      const r = await fetch(`${url}/rest/v1/zeit_abschnitte`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ ...p.daten, quelle: 'mitarbeiter', created_by: rolle.userId }) });
      if (!r.ok) throw new Error(await r.text());
      return NextResponse.json({ success: true, abschnitt: (await r.json())[0] });
    }

    // ---- Knopf ----
    if (!AKTIONEN.includes(b?.aktion)) return fehler('Unbekannte Aktion.');
    const lauf = await laufHolen(emp.id);
    const u = uebergang(lauf, b.aktion as Aktion, jetzt, { zeit: typeof b.zeit === 'string' ? b.zeit : null, projectId: projekt });
    if (!u.ok) return fehler(u.fehler, 409);

    if (u.abschliessen) {
      const a = u.abschliessen;
      const p = pruefeAbschnitt({ employee_id: emp.id, art: a.art, start_time: a.start_time, end_time: a.end_time, project_id: a.project_id, work_date: berlinDatum(a.start_time) });
      if (!p.ok) return fehler(p.fehler);
      const vorhanden = await lesen(`zeit_abschnitte?select=id,start_time,end_time&employee_id=eq.${emp.id}&work_date=eq.${p.daten.work_date}`);
      if (ueberschneidet(p.daten, vorhanden)) return fehler('Die Zeit überschneidet sich mit einem eingetragenen Abschnitt. Bitte eine andere Uhrzeit einstellen.');
      const r = await fetch(`${url}/rest/v1/zeit_abschnitte`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ ...p.daten, quelle: 'knopf', created_by: rolle.userId }) });
      if (!r.ok) throw new Error(await r.text());
    }
    // Laufenden Abschnitt ersetzen oder entfernen
    const del = await fetch(`${url}/rest/v1/zeit_lauf?employee_id=eq.${emp.id}`, { method: 'DELETE', headers });
    if (!del.ok) throw new Error(await del.text());
    if (u.neuerLauf) {
      const n = u.neuerLauf;
      const r = await fetch(`${url}/rest/v1/zeit_lauf`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ employee_id: emp.id, art: n.art, start_time: n.start_time, project_id: n.project_id, davor_art: n.davor_art }) });
      if (!r.ok) throw new Error(await r.text());
    }
    return NextResponse.json({ success: true, lauf: u.neuerLauf, knoepfe: verfuegbareKnoepfe(u.neuerLauf) });
  } catch (err) { return serverErrorResponse(err, 'zeit-knoepfe/POST'); }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(ROLLEN.ALLE);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const m = await meinMitarbeiter(rolle.userId, new URL(req.url).searchParams.get('employee_id'));
    if (m.verboten) return fehler(m.verboten, 403);
    const emp = m.emp;
    if (!emp) return fehler('Kein Mitarbeiter gewählt.', 403);
    const z = await lesen(`zeit_abschnitte?select=id,quelle,start_time&id=eq.${id}&employee_id=eq.${emp.id}&limit=1`);
    if (!z[0]) return fehler('Abschnitt nicht gefunden.', 404);
    if (!['knopf', 'mitarbeiter'].includes(z[0].quelle)) return fehler('Diesen Abschnitt haben Chef oder Disposition eingetragen. Bitte dort ändern lassen.', 403);
    if (Date.now() - Date.parse(z[0].start_time) > 7 * 24 * 3600 * 1000) return fehler('Älter als 7 Tage: bitte Chef oder Disposition fragen.', 403);
    const r = await fetch(`${url}/rest/v1/zeit_abschnitte?id=eq.${id}&employee_id=eq.${emp.id}`, { method: 'DELETE', headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true });
  } catch (err) { return serverErrorResponse(err, 'zeit-knoepfe/DELETE'); }
}
