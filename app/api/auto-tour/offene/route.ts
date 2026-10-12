import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { offeneFahrtenPruefen } from '@/lib/auto-tour';

// ============================================================
// SCAFFOLD OS – Offene Lieferungen automatisch einplanen
// POST (ohne Body). Wird von der Touren-Seite beim Öffnen aufgerufen.
// Legt für alle Projekte mit offenen Transportaufträgen die Fahrten an
// (Regeln: lib/auto-tour.ts) und liefert zurück, was nicht ging – samt
// Grund. Nur admin/disponent.
// ============================================================

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'disponent'].includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Kein Zugriff (nur CEO/Dispo)' }, { status: 403 });
    }
    const r = await offeneFahrtenPruefen();
    return NextResponse.json({ success: true, angelegt: r.angelegt, offen: r.offen });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
