import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildUmdispositionSuggestion } from '@/lib/umdisposition';

// ─── POST /api/umdisposition ───
// KI-Umdisposition für ein Datum (Button in der Planung).
// Rollen: admin + disponent.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'disponent'].includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Kein Zugriff' }, { status: 403 });
    }

    if (!process.env.KI_API_KEY) {
      return NextResponse.json({ success: false, error: 'KI_API_KEY fehlt (Vercel → Environment Variables).' }, { status: 400 });
    }

    const { date } = await req.json();
    if (!date) {
      return NextResponse.json({ success: false, error: 'Datum fehlt' }, { status: 400 });
    }

    const result = await buildUmdispositionSuggestion(date);
    if (!result) {
      return NextResponse.json({ success: false, error: 'KI konnte keinen Vorschlag erstellen (Dienst nicht erreichbar).' }, { status: 502 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Unbekannter Fehler' }, { status: 500 });
  }
}
