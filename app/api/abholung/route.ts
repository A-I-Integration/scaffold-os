import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { legeAbholTourAn } from '@/lib/auto-tour';

// ============================================================
// SCAFFOLD OS – Abholfahrt (Abbau) planen
// POST { project_id }
// Legt eine Tour am Abholtermin an (lib/auto-tour.ts → legeAbholTourAn).
// Verändert keine Lagerbestände. Nur admin/disponent.
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
    const body = await req.json().catch(() => ({}));
    const projectId = typeof body?.project_id === 'string' ? body.project_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
      return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });
    }
    const tour = await legeAbholTourAn(projectId);
    return NextResponse.json({ success: !!tour.tourId, tour });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
