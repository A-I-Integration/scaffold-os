import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { wirksamesMietende, istIso } from '@/lib/miete';
import { lagerKonflikteBeiVerlaengerung, type OffenerTransport } from '@/lib/verlaengern-lager';

// GET ?project_id=…&bis=JJJJ-MM-TT → Auswirkung einer Verlängerung auf offene Transportaufträge dieser Baustelle.
// Nur lesend. Nur admin/disponent.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
const ROLLEN = ['admin', 'disponent'];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile?.role || !ROLLEN.includes(profile.role)) return NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 });

    const projectId = req.nextUrl.searchParams.get('project_id') || '';
    const bis = req.nextUrl.searchParams.get('bis') || '';
    if (!/^[0-9a-f-]{36}$/i.test(projectId) || !istIso(bis)) return NextResponse.json({ success: false, error: 'Ungültige Angaben.' }, { status: 400 });

    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=id,data`, { headers });
    if (!pRes.ok) throw new Error(await pRes.text());
    const projekt = (await pRes.json())?.[0];
    if (!projekt) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden.' }, { status: 404 });
    const data = typeof projekt.data === 'string' ? JSON.parse(projekt.data) : (projekt.data || {});
    const alterEnde = wirksamesMietende(data?.step1?.projektende, data?.mietVerlaengertBis);
    if (!alterEnde) return NextResponse.json({ success: true, konflikte: [], undatiert: 0 });

    const tRes = await fetch(
      `${url}/rest/v1/transport_orders?from_project_id=eq.${projectId}&status=eq.pending&select=id,to_project_id,quantity,planned_date,inventory:inventory_id(name),to_project:to_project_id(name,data)`,
      { headers }
    );
    if (!tRes.ok) throw new Error(await tRes.text());
    type Zeile = { id: string; to_project_id: string; quantity: number; planned_date: string | null; inventory?: { name?: string } | null; to_project?: { name?: string; data?: unknown } | null };
    const rows: Zeile[] = await tRes.json();
    const transporte: OffenerTransport[] = rows.map((r) => {
      const zd = typeof r.to_project?.data === 'string' ? (() => { try { return JSON.parse(r.to_project.data); } catch { return {}; } })() : (r.to_project?.data || {});
      return {
        id: r.id,
        to_project_id: r.to_project_id,
        quantity: Number(r.quantity) || 0,
        planned_date: r.planned_date || null,
        ziel_beginn: typeof zd?.step1?.projektbeginn === 'string' ? zd.step1.projektbeginn : null,
        ziel_name: r.to_project?.name || null,
        artikel_name: r.inventory?.name || null,
      };
    });
    return NextResponse.json({ success: true, ...lagerKonflikteBeiVerlaengerung(alterEnde, bis, transporte) });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
