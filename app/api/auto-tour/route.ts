import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { legeAutoTourAn } from '@/lib/auto-tour';

// ============================================================
// SCAFFOLD OS – Fahrt erneut automatisch anlegen
// POST { project_id }
//
// Für den Fall, dass die Automatik bei der Angebots-Annahme keine
// Fahrt anlegen konnte (z. B. Projektbeginn erst später eingetragen,
// kein Fahrer frei). Nimmt die noch OFFENEN Transportaufträge des
// Projekts (Status 'pending', also in keiner Tour) und wendet dieselben
// Regeln an wie bei der Annahme (lib/auto-tour.ts). Nur admin/disponent.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'disponent'].includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Kein Zugriff (nur CEO/Dispo)' }, { status: 403 });
    }

    const { project_id } = await req.json();
    if (!project_id) return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });

    const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${project_id}&select=name,adresse,data`, { headers });
    if (!pRes.ok) throw new Error('Projekt nicht lesbar (' + pRes.status + ')');
    const projekt = (await pRes.json())?.[0];
    if (!projekt) return NextResponse.json({ success: false, error: 'Projekt nicht gefunden' }, { status: 404 });

    const tRes = await fetch(
      `${url}/rest/v1/transport_orders?to_project_id=eq.${project_id}&status=eq.pending&select=id,quantity,inventory:inventory_id(sku)`,
      { headers }
    );
    if (!tRes.ok) throw new Error('Transportaufträge nicht lesbar (' + tRes.status + ')');
    const offen: { id: string; quantity: number; inventory: { sku: string | null } | null }[] = await tRes.json();
    if (offen.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine offenen Transportaufträge für dieses Projekt (schon in einer Tour oder nie angelegt).' }, { status: 409 });
    }

    const tour = await legeAutoTourAn({
      projektName: projekt.name || 'Projekt',
      adresse: projekt.adresse ?? null,
      datum: projekt.data?.step1?.projektbeginn,
      transportOrderIds: offen.map((o) => o.id),
      positionen: offen.map((o) => ({ sku: o.inventory?.sku || '', quantity: Number(o.quantity) || 0 })),
    });

    // Ergebnis am Projekt vermerken (frisch lesen, damit nichts überschrieben wird)
    const frisch = await fetch(`${url}/rest/v1/projects?id=eq.${project_id}&select=data`, { headers }).then((r) => r.json());
    const data = frisch?.[0]?.data || {};
    await fetch(`${url}/rest/v1/projects?id=eq.${project_id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ data: { ...data, lagerAutomatikErgebnis: { ...(data.lagerAutomatikErgebnis || {}), tour } } }),
    });

    return NextResponse.json({ success: !!tour.tourId, tour });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
