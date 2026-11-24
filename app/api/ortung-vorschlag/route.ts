import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { leiteVorschlaegeAb } from '@/lib/ortung-server';
import { pruefeAbschnitt, ueberschneidet } from '@/lib/zeit-abschnitte';
import { istIsoDatum } from '@/lib/personalstamm';

// ============================================================
// SCAFFOLD OS – Abschnitts-Vorschläge aus Tour und Fahrzeug-Ortung
// GET ?datum=&employee_id=  → Vorschläge (nichts wird gespeichert)
// POST {employee_id, work_date} → übernimmt die noch freien Vorschläge als Tagesabschnitte (Quelle „ortung“); danach wie alle Abschnitte änderbar
// Nur Chef und Dispo (Standortdaten). Die Positionen selbst werden nicht kopiert, nur die abgeleiteten Zeiten.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  const sp = new URL(req.url).searchParams;
  const employeeId = sp.get('employee_id') || '', datum = sp.get('datum') || '';
  if (!UUID.test(employeeId) || !istIsoDatum(datum)) return fehler('employee_id und datum=JJJJ-MM-TT erforderlich');
  try {
    return NextResponse.json({ success: true, ...(await leiteVorschlaegeAb(employeeId, datum)) });
  } catch (err) {
    return serverErrorResponse(err, 'ortung-vorschlag/GET');
  }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  const employeeId = String(b?.employee_id ?? ''), datum = String(b?.work_date ?? '');
  if (!UUID.test(employeeId) || !istIsoDatum(datum)) return fehler('employee_id und work_date erforderlich');
  try {
    const { touren } = await leiteVorschlaegeAb(employeeId, datum);
    const r0 = await fetch(`${url}/rest/v1/zeit_abschnitte?select=id,start_time,end_time&employee_id=eq.${employeeId}&work_date=eq.${datum}`, { headers });
    if (!r0.ok) throw new Error(await r0.text());
    const belegt: { id?: string; start_time: string; end_time: string }[] = await r0.json();
    let angelegt = 0, uebersprungen = 0;
    for (const t of touren) for (const v of t.vorschlaege) {
      const p = pruefeAbschnitt({ employee_id: employeeId, work_date: datum, art: v.art, start_time: v.start_time, end_time: v.end_time, project_id: v.project_id, note: v.note });
      if (!p.ok || ueberschneidet(p.daten, belegt)) { uebersprungen++; continue; }
      const r = await fetch(`${url}/rest/v1/zeit_abschnitte`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ ...p.daten, quelle: 'ortung', created_by: rolle.userId }) });
      if (!r.ok) throw new Error(await r.text());
      belegt.push({ start_time: p.daten.start_time, end_time: p.daten.end_time });
      angelegt++;
    }
    return NextResponse.json({ success: true, angelegt, uebersprungen });
  } catch (err) {
    return serverErrorResponse(err, 'ortung-vorschlag/POST');
  }
}
