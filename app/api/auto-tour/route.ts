import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { fahrtNachholen } from '@/lib/auto-tour';

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

    const r = await fahrtNachholen(project_id);
    if (r.fehler) return NextResponse.json({ success: false, error: r.fehler }, { status: r.status || 400 });
    return NextResponse.json({ success: r.ok, tour: r.tour });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
