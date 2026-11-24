import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { pruefeKonditionen, pruefeSonderzahlung, pruefeUrlaubsanspruch } from '@/lib/konditionen';

// ============================================================
// SCAFFOLD OS – Lohn-Konditionen je Mitarbeiter (Reiter „Lohn & Konditionen“). NUR Chef (admin).
//
// GET    ?employee_id=…  → erster Arbeitstag, Kündigungsfrist/Probezeit, Urlaubsanspruch-Verlauf, Sonderzahlungen
// POST   { typ: 'konditionen' | 'urlaub' | 'sonderzahlung', employee_id, … }
//        konditionen: { eintrittsdatum, kuendigungsfrist, probezeit_ende, notiz } (Eintritt wird im Personalstamm geführt)
//        urlaub: { tage_pro_jahr, gueltig_ab, notiz }   (derselbe Tag ersetzt den Eintrag)
//        sonderzahlung: { art, bezeichnung?, betrag?, monat 'JJJJ-MM', notiz? }
// DELETE ?typ=urlaub|sonderzahlung&id=…
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

export async function GET(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const id = new URL(req.url).searchParams.get('employee_id') || '';
  if (!UUID.test(id)) return fehler('employee_id erforderlich');
  try {
    const lies = async (pfad: string) => { const r = await fetch(`${url}/rest/v1/${pfad}`, { headers }); if (!r.ok) throw new Error(await r.text()); return r.json(); };
    const [pers, kond, urlaub, sonder] = await Promise.all([
      lies(`employee_personal?employee_id=eq.${id}&select=eintrittsdatum`),
      lies(`employee_konditionen?employee_id=eq.${id}&select=kuendigungsfrist,probezeit_ende,notiz`),
      lies(`employee_urlaubsanspruch?employee_id=eq.${id}&select=id,tage_pro_jahr,gueltig_ab,notiz`),
      lies(`employee_sonderzahlungen?employee_id=eq.${id}&select=id,art,bezeichnung,betrag,monat,notiz,created_at`),
    ]);
    const neu = <T extends Record<string, any>>(l: T[], f: string) => [...l].sort((a, b) => String(b[f]).localeCompare(String(a[f])));
    return NextResponse.json({
      success: true,
      eintrittsdatum: pers[0]?.eintrittsdatum ?? null,
      konditionen: kond[0] ?? { kuendigungsfrist: null, probezeit_ende: null, notiz: null },
      urlaub: neu(urlaub, 'gueltig_ab'),
      sonderzahlungen: neu(sonder, 'monat'),
    });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-konditionen/GET');
  }
}

export async function POST(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  const employeeId = String(b?.employee_id || '');
  if (!UUID.test(employeeId)) return fehler('employee_id erforderlich');
  try {
    const emp = await fetch(`${url}/rest/v1/employees?id=eq.${employeeId}&select=id`, { headers });
    if (!emp.ok || (await emp.json()).length === 0) return fehler('Mitarbeiter nicht gefunden', 404);
    const post = async (pfad: string, body: unknown, prefer: string) => {
      const r = await fetch(`${url}/rest/v1/${pfad}`, { method: 'POST', headers: { ...headers, Prefer: prefer }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json())[0];
    };

    if (b.typ === 'konditionen') {
      const p = pruefeKonditionen(b);
      if (!p.ok) return fehler(p.fehler);
      const k = await post('employee_konditionen?on_conflict=employee_id',
        { employee_id: employeeId, kuendigungsfrist: p.kuendigungsfrist, probezeit_ende: p.probezeit_ende, notiz: p.notiz, updated_by: rolle.userId, updated_at: new Date().toISOString() },
        'resolution=merge-duplicates,return=representation');
      // Erster Arbeitstag = Eintrittsdatum im Personalstamm; nur diese Spalte wird angefasst
      await post('employee_personal?on_conflict=employee_id', { employee_id: employeeId, eintrittsdatum: p.eintrittsdatum }, 'resolution=merge-duplicates,return=representation');
      return NextResponse.json({ success: true, konditionen: k });
    }
    if (b.typ === 'urlaub') {
      const p = pruefeUrlaubsanspruch(b);
      if (!p.ok) return fehler(p.fehler);
      const u = await post('employee_urlaubsanspruch?on_conflict=employee_id,gueltig_ab',
        { employee_id: employeeId, tage_pro_jahr: p.tage_pro_jahr, gueltig_ab: p.gueltig_ab, notiz: p.notiz, created_by: rolle.userId },
        'resolution=merge-duplicates,return=representation');
      return NextResponse.json({ success: true, urlaub: u });
    }
    if (b.typ === 'sonderzahlung') {
      const p = pruefeSonderzahlung(b);
      if (!p.ok) return fehler(p.fehler);
      const s = await post('employee_sonderzahlungen', { employee_id: employeeId, art: p.art, bezeichnung: p.bezeichnung, betrag: p.betrag, monat: p.monat, notiz: p.notiz, created_by: rolle.userId }, 'return=representation');
      return NextResponse.json({ success: true, sonderzahlung: s });
    }
    return fehler('Unbekannter Typ');
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-konditionen/POST');
  }
}

export async function DELETE(req: NextRequest) {
  const rolle = await pruefeRolle(['admin']);
  if (!rolle.ok) return rolle.response;
  const q = new URL(req.url).searchParams;
  const id = q.get('id') || '', typ = q.get('typ') || '';
  const tabelle = typ === 'urlaub' ? 'employee_urlaubsanspruch' : typ === 'sonderzahlung' ? 'employee_sonderzahlungen' : '';
  if (!tabelle) return fehler('Unbekannter Typ');
  if (!UUID.test(id)) return fehler('id erforderlich');
  try {
    const r = await fetch(`${url}/rest/v1/${tabelle}?id=eq.${id}`, { method: 'DELETE', headers });
    if (!r.ok) throw new Error(await r.text());
    return NextResponse.json({ success: true });
  } catch (err) {
    return serverErrorResponse(err, 'mitarbeiter-konditionen/DELETE');
  }
}
