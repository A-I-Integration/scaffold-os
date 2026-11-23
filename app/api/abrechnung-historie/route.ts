import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';

// ============================================================
// SCAFFOLD OS – Änderungsverlauf der Abrechnung lesen (Faktura F6, Tabelle abrechnung_historie)
// GET ?invoice_id=<uuid>  → Verlauf dieser Rechnung (neueste zuerst)
// GET ?project_id=<uuid>  → Verlauf der ganzen Baustelle
// Geschrieben wird nur vom Server (Rechnung anlegen/ändern/löschen). Nur Admin und Disposition. Benutzer erscheinen mit Namen.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const r = await pruefeRolle(ROLLEN.ADMIN_DISPO);
  if (!r.ok) return r.response;
  try {
    const rechnung = req.nextUrl.searchParams.get('invoice_id');
    const projekt = req.nextUrl.searchParams.get('project_id');
    if (!rechnung && !projekt) return NextResponse.json({ success: false, error: 'invoice_id oder project_id erforderlich' }, { status: 400 });
    if ((rechnung && !UUID.test(rechnung)) || (projekt && !UUID.test(projekt))) return NextResponse.json({ success: false, error: 'id ungültig' }, { status: 400 });
    const filter = rechnung ? `invoice_id=eq.${rechnung}` : `project_id=eq.${projekt}`;
    const res = await fetch(`${url}/rest/v1/abrechnung_historie?${filter}&select=*&order=created_at.desc&limit=500`, { headers });
    if (!res.ok) {
      const t = await res.text();
      if (/abrechnung_historie/.test(t) && /(does not exist|schema cache|PGRST205|42P01)/i.test(t)) {
        return NextResponse.json({ success: false, code: 'TABELLE_FEHLT', error: 'Der Änderungsverlauf ist noch nicht eingerichtet (supabase/phase-125-abrechnung-historie.sql im SQL-Editor ausführen).' });
      }
      throw new Error(t);
    }
    const eintraege = (await res.json()) as { user_id: string | null }[];
    const ids = [...new Set(eintraege.map((e) => e.user_id).filter((x): x is string => !!x && UUID.test(x)))];
    const namen: Record<string, string> = {};
    if (ids.length) {
      try {
        const pr = await fetch(`${url}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,full_name,email`, { headers });
        if (pr.ok) for (const p of await pr.json()) namen[p.id] = p.full_name || p.email || 'Benutzer';
      } catch { /* ohne Namen: „Benutzer“ */ }
    }
    return NextResponse.json({ success: true, eintraege: eintraege.map((e) => ({ ...e, benutzer: e.user_id ? namen[e.user_id] || 'Benutzer' : 'System' })) });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
