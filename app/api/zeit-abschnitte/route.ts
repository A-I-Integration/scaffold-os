import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { pruefeAbschnitt, ueberschneidet } from '@/lib/zeit-abschnitte';

// ============================================================
// SCAFFOLD OS – Tagesabschnitte (Baustelle, Fahrt vom Hof, Pause, Schlechtwetter, Fortbildung)
// GET ?datum=JJJJ-MM-TT (inkl. gerade laufende Abschnitte der Mitarbeiter): Chef, Dispo, Bauleiter (nur lesen) · POST/PATCH/DELETE: Chef und Dispo
// Die Abschnitte ändern die gebuchten Stunden nicht (siehe lib/zeit-abschnitte.ts).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

async function tagesAbschnitte(employeeId: string, tag: string): Promise<{ id: string; start_time: string; end_time: string }[]> {
  const r = await fetch(`${url}/rest/v1/zeit_abschnitte?select=id,start_time,end_time&employee_id=eq.${employeeId}&work_date=eq.${tag}`, { headers });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent', 'bauleiter']);
  if (!rolle.ok) return rolle.response;
  const datum = new URL(req.url).searchParams.get('datum') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return fehler('datum=JJJJ-MM-TT erforderlich');
  try {
    const [emp, ent, abs, lauf] = await Promise.all([
      fetch(`${url}/rest/v1/employees?select=id,first_name,last_name,status&order=last_name.asc,first_name.asc`, { headers }),
      fetch(`${url}/rest/v1/time_entries?select=id,employee_id,project_id,start_time,end_time,hours,break_minutes,note,project:project_id(id,name)&work_date=eq.${datum}&order=start_time.asc`, { headers }),
      fetch(`${url}/rest/v1/zeit_abschnitte?select=*,project:project_id(id,name)&work_date=eq.${datum}&order=start_time.asc`, { headers }),
      fetch(`${url}/rest/v1/zeit_lauf?select=employee_id,art,start_time,project_id,project:project_id(id,name)`, { headers }),
    ]);
    if (!emp.ok || !ent.ok) throw new Error(await (emp.ok ? ent : emp).text());
    // Fehlt die Tabelle noch (SQL nicht ausgeführt), bleibt die Tagesansicht ohne Abschnitte nutzbar.
    const abschnitte = abs.ok ? await abs.json() : [];
    // Mitarbeiter, die an dem Tag in einer Tour eingeteilt sind, erscheinen auch ohne Stempel (für die Vorschläge aus der Ortung).
    let tourMitarbeiter: string[] = [];
    try {
      const rt = await fetch(`${url}/rest/v1/tours?select=driver_id,team_ids&planned_date=eq.${datum}`, { headers });
      if (rt.ok) {
        const ids = new Set<string>();
        for (const t of await rt.json()) { if (t.driver_id) ids.add(t.driver_id); if (Array.isArray(t.team_ids)) for (const i of t.team_ids) if (typeof i === 'string') ids.add(i); }
        tourMitarbeiter = [...ids];
      }
    } catch { /* ohne Touren weiter */ }
    return NextResponse.json({ success: true, employees: await emp.json(), entries: await ent.json(), abschnitte, tabelleFehlt: !abs.ok, tourMitarbeiter, laufend: lauf.ok ? await lauf.json() : [] });
  } catch (err) {
    return serverErrorResponse(err, 'zeit-abschnitte/GET');
  }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  const p = pruefeAbschnitt(b);
  if (!p.ok) return fehler(p.fehler);
  try {
    if (ueberschneidet(p.daten, await tagesAbschnitte(p.daten.employee_id, p.daten.work_date))) return fehler('Der Abschnitt überschneidet sich mit einem vorhandenen Abschnitt.');
    const r = await fetch(`${url}/rest/v1/zeit_abschnitte`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ ...p.daten, quelle: 'manuell', created_by: rolle.userId }),
    });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true, abschnitt: (await r.json())[0] });
  } catch (err) {
    return serverErrorResponse(err, 'zeit-abschnitte/POST');
  }
}

export async function PATCH(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  if (!UUID.test(String(b?.id ?? ''))) return fehler('id erforderlich');
  const p = pruefeAbschnitt(b);
  if (!p.ok) return fehler(p.fehler);
  try {
    if (ueberschneidet(p.daten, await tagesAbschnitte(p.daten.employee_id, p.daten.work_date), b.id)) return fehler('Der Abschnitt überschneidet sich mit einem vorhandenen Abschnitt.');
    const r = await fetch(`${url}/rest/v1/zeit_abschnitte?id=eq.${b.id}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ ...p.daten, quelle: 'manuell' }),
    });
    if (!r.ok) throw new Error(await r.text());
    const zeilen = await r.json();
    if (!zeilen.length) return fehler('Abschnitt nicht gefunden.', 404);
    return NextResponse.json({ success: true, abschnitt: zeilen[0] });
  } catch (err) {
    return serverErrorResponse(err, 'zeit-abschnitte/PATCH');
  }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const r = await fetch(`${url}/rest/v1/zeit_abschnitte?id=eq.${id}`, { method: 'DELETE', headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'zeit-abschnitte/DELETE');
  }
}
