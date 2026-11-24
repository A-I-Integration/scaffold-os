import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { pruefeLohnEingabe, lohnVerlauf } from '@/lib/stundenlohn';

// ============================================================
// SCAFFOLD OS – Stundenlohn je Mitarbeiter (Bereich Personal)
//
// Lohn ist sensibel: NUR Admin (Chef) darf lesen, anlegen und löschen. Die Tabelle employee_wages hat RLS ohne Policy,
// der Zugriff läuft ausschließlich hier über den Service-Role-Key.
//
// GET    ?employee_id=…            → Verlauf (neueste zuerst)
// POST   { employee_id, stundenlohn, gueltig_ab, notiz? } → neuer Eintrag ab Datum (derselbe Tag ersetzt den Eintrag)
// DELETE ?id=…                     → Eintrag löschen
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const employeeId = new URL(req.url).searchParams.get('employee_id') || '';
  if (!UUID.test(employeeId)) return fehler('employee_id erforderlich');
  try {
    const res = await fetch(`${url}/rest/v1/employee_wages?employee_id=eq.${employeeId}&select=id,employee_id,stundenlohn,gueltig_ab,notiz,created_at`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, loehne: lohnVerlauf(await res.json()) });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-lohn/GET');
  }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  let body: any;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  if (!UUID.test(String(body?.employee_id || ''))) return fehler('employee_id erforderlich');
  const p = pruefeLohnEingabe({ stundenlohn: body.stundenlohn, gueltig_ab: body.gueltig_ab, notiz: body.notiz });
  if (!p.ok) return fehler(p.fehler);
  try {
    const emp = await fetch(`${url}/rest/v1/employees?id=eq.${body.employee_id}&select=id`, { headers });
    if (!emp.ok || (await emp.json()).length === 0) return fehler('Mitarbeiter nicht gefunden', 404);
    const res = await fetch(`${url}/rest/v1/employee_wages?on_conflict=employee_id,gueltig_ab`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ employee_id: body.employee_id, stundenlohn: p.stundenlohn, gueltig_ab: p.gueltig_ab, notiz: p.notiz, created_by: rolle.userId }),
    });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true, lohn: (await res.json())[0] });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-lohn/POST');
  }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const res = await fetch(`${url}/rest/v1/employee_wages?id=eq.${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-lohn/DELETE');
  }
}
