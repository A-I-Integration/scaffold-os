import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { pruefePersonalEingabe } from '@/lib/personalstamm';
import { FUEHRERSCHEIN_KLASSEN } from '@/lib/touren/fuehrerschein';
import { istIsoDatum } from '@/lib/personalstamm';

// ============================================================
// SCAFFOLD OS – Personalstamm (Reiter „Mitarbeiter“)
// Enthält SV-Nummer, Steuer-ID, IBAN usw.: NUR Chef (admin). Tabelle employee_personal hat RLS ohne Policy.
//
// GET                    → Liste aller Mitarbeiter (Name, Status, Führerschein)
// GET ?employee_id=…     → ein Mitarbeiter mit allen Stammdaten
// POST { employee_id?, first_name, last_name, phone?, weekly_hours?, fuehrerschein_klassen?, license_expires?, …Stammdaten }
//        ohne employee_id wird ein neuer Mitarbeiter angelegt (ohne Login)
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });
const MA_FELDER = 'id,first_name,last_name,email,phone,status,weekly_hours,fuehrerschein_klassen,license_expires,user_id';

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('employee_id');
  try {
    if (!id) {
      const res = await fetch(`${url}/rest/v1/employees?select=${MA_FELDER}&order=last_name.asc`, { headers });
      if (!res.ok) throw new Error(await res.text());
      return NextResponse.json({ success: true, mitarbeiter: await res.json() });
    }
    if (!UUID.test(id)) return fehler('employee_id ungültig');
    const [m, p] = await Promise.all([
      fetch(`${url}/rest/v1/employees?id=eq.${id}&select=${MA_FELDER}`, { headers }),
      fetch(`${url}/rest/v1/employee_personal?employee_id=eq.${id}&select=*`, { headers }),
    ]);
    if (!m.ok) throw new Error(await m.text());
    if (!p.ok) throw new Error(await p.text());
    const ma = (await m.json())[0];
    if (!ma) return fehler('Mitarbeiter nicht gefunden', 404);
    return NextResponse.json({ success: true, mitarbeiter: ma, personal: (await p.json())[0] || null });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-stamm/GET');
  }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }

  const vorname = String(b?.first_name ?? '').trim(), nachname = String(b?.last_name ?? '').trim();
  if (!vorname || !nachname) return fehler('Vor- und Nachname sind Pflicht.');
  const p = pruefePersonalEingabe(b);
  if (!p.ok) return fehler(p.fehler);

  const klassen: string[] = Array.isArray(b.fuehrerschein_klassen) ? b.fuehrerschein_klassen.map(String) : [];
  if (klassen.some(k => !(FUEHRERSCHEIN_KLASSEN as readonly string[]).includes(k))) return fehler('Unbekannte Führerscheinklasse.');
  const ablauf = b.license_expires ? String(b.license_expires) : null;
  if (ablauf && !istIsoDatum(ablauf)) return fehler('Führerschein „gültig bis“ ist kein gültiges Datum.');
  let wochenstunden: number | undefined;
  if (b.weekly_hours !== undefined && b.weekly_hours !== null && String(b.weekly_hours).trim() !== '') {
    const w = Number(String(b.weekly_hours).replace(',', '.'));
    if (!Number.isFinite(w) || w <= 0 || w > 60) return fehler('Wochenstunden: Zahl zwischen 0 und 60.');
    wochenstunden = Math.round(w);
  }

  const maDaten = {
    first_name: vorname, last_name: nachname,
    phone: b.phone ? String(b.phone).trim().slice(0, 40) : null,
    fuehrerschein_klassen: klassen, license_expires: ablauf,
    ...(wochenstunden !== undefined ? { weekly_hours: wochenstunden } : {}),
    updated_by: rolle.userId,
  };

  try {
    let employeeId: string = String(b.employee_id || '');
    if (employeeId) {
      if (!UUID.test(employeeId)) return fehler('employee_id ungültig');
      const upd = await fetch(`${url}/rest/v1/employees?id=eq.${employeeId}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(maDaten) });
      if (!upd.ok) throw new Error(await upd.text());
      if ((await upd.json()).length === 0) return fehler('Mitarbeiter nicht gefunden', 404);
    } else {
      const neu = await fetch(`${url}/rest/v1/employees`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ ...maDaten, status: 'active', created_by: rolle.userId }) });
      if (!neu.ok) throw new Error(await neu.text());
      employeeId = (await neu.json())[0].id;
    }
    const sp = await fetch(`${url}/rest/v1/employee_personal?on_conflict=employee_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ employee_id: employeeId, ...p.daten, updated_by: rolle.userId, updated_at: new Date().toISOString() }),
    });
    if (!sp.ok) throw new Error(await sp.text());
    return NextResponse.json({ success: true, employee_id: employeeId, personal: (await sp.json())[0] });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-stamm/POST');
  }
}
