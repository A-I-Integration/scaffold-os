import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Neue Aufträge ohne Team (Phase 43)
//
// Schließt eine echte Lücke: Ein aus dem Aufmaß angelegter Auftrag mit
// geplantem Datum (Schritt 1: projektbeginn) taucht bisher NIRGENDS
// automatisch dort auf, wo man ihn einem Mitarbeiter zuordnen könnte
// (Touren = Material-/Fahrzeuglogistik, komplett getrennt davon).
// Diese Route listet aktive Projekte mit gesetztem Startdatum, die
// noch KEINE Eintragung in project_assignments haben.
//
// GET → { projekte: [{ id, name, kunde, projektbeginn }] }
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const [projRes, zugewiesenRes] = await Promise.all([
      fetch(`${url}/rest/v1/projects?status=eq.active&select=id,name,adresse,data,customer_id,customer:customer_id(name)`, { headers }),
      fetch(`${url}/rest/v1/project_assignments?select=project_id`, { headers }),
    ]);
    if (!projRes.ok) throw new Error(await projRes.text());
    if (!zugewiesenRes.ok) throw new Error(await zugewiesenRes.text());

    const projekte = await projRes.json();
    const zugewiesenIds = new Set((await zugewiesenRes.json()).map((z: any) => z.project_id));

    const heute = new Date().toISOString().slice(0, 10);
    const offen = projekte
      .filter((p: any) => {
        const beginn = p.data?.step1?.projektbeginn;
        return beginn && beginn >= heute && !zugewiesenIds.has(p.id);
      })
      .map((p: any) => ({
        id: p.id, name: p.name, adresse: p.adresse,
        kunde: p.customer?.name || p.data?.step1?.name || '',
        projektbeginn: p.data.step1.projektbeginn,
      }))
      .sort((a: any, b: any) => a.projektbeginn.localeCompare(b.projektbeginn));

    return NextResponse.json({ success: true, projekte: offen });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
