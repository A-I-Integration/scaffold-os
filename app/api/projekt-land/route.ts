import { NextRequest, NextResponse } from 'next/server';
import { pruefeRolle, serverErrorResponse } from '@/lib/auth';
import { pruefeLand } from '@/lib/auswertung';

// ============================================================
// SCAFFOLD OS – Land der Baustelle (für die Auswertung der Zeiterfassung)
// GET: Chef, Dispo, Bauleiter · PATCH { project_id, land }: Chef und Dispo
// Leeres Land = nicht gesetzt (gilt in der Auswertung als Deutschland).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (text: string, status = 400) => NextResponse.json({ success: false, error: text }, { status });

export async function GET() {
  const rolle = await pruefeRolle(['admin', 'disponent', 'bauleiter']);
  if (!rolle.ok) return rolle.response;
  try {
    const r = await fetch(`${url}/rest/v1/projects?select=id,name,adresse,land&order=name.asc&limit=1000`, { headers });
    if (!r.ok) {
      // Spalte fehlt noch (SQL phase-139 nicht ausgeführt): Liste ohne Land, Bearbeiten gesperrt.
      const r2 = await fetch(`${url}/rest/v1/projects?select=id,name,adresse&order=name.asc&limit=1000`, { headers });
      if (!r2.ok) throw new Error(await r2.text());
      return NextResponse.json({ success: true, projekte: await r2.json(), spalteFehlt: true });
    }
    return NextResponse.json({ success: true, projekte: await r.json(), spalteFehlt: false });
  } catch (err) {
    return serverErrorResponse(err, 'projekt-land/GET');
  }
}

export async function PATCH(req: NextRequest) {
  const rolle = await pruefeRolle(['admin', 'disponent']);
  if (!rolle.ok) return rolle.response;
  let b: any;
  try { b = await req.json(); } catch { return fehler('Ungültige Anfrage'); }
  if (!UUID.test(String(b?.project_id ?? ''))) return fehler('project_id erforderlich');
  const p = pruefeLand(b?.land);
  if (!p.ok) return fehler(p.fehler);
  try {
    const r = await fetch(`${url}/rest/v1/projects?id=eq.${b.project_id}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ land: p.land }),
    });
    if (!r.ok) throw new Error(await r.text());
    const z = await r.json();
    if (!z.length) return fehler('Baustelle nicht gefunden.', 404);
    return NextResponse.json({ success: true, land: p.land });
  } catch (err) {
    return serverErrorResponse(err, 'projekt-land/PATCH');
  }
}
