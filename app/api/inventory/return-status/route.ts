import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Material-Rückgabe-Status je Projekt (Phase 42)
//
// Schließt die Lücke zwischen Standzeit-Korrektur (Rechnung, rein
// finanziell) und Material-Rückgabe (Lager, an die Demontage-
// Dokumentation gekoppelt) – bisher zwei komplett getrennte Abläufe.
// Gibt zurück, für welche Demontage-Ereignisse dieses Projekts schon
// eine Material-Buchung existiert (inventory_transactions mit
// reference_type demontage_rueckgabe/demontage_verlust), damit die
// Standzeit-Korrektur darauf hinweisen kann, falls das noch fehlt.
//
// GET ?project_id=... → { erledigtEventIds: string[] }
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');
    if (!projectId) return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });

    const res = await fetch(
      `${url}/rest/v1/inventory_transactions?project_id=eq.${projectId}&reference_type=in.(demontage_rueckgabe,demontage_verlust)&select=reference_id`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    const erledigtEventIds = Array.from(new Set(rows.map((r: any) => r.reference_id).filter(Boolean)));

    return NextResponse.json({ success: true, erledigtEventIds });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
