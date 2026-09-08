import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildTeamVorschlag } from '@/lib/team-vorschlag';

// POST /api/team-vorschlag { project_id, datum, gewerke? }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'disponent'].includes(profile.role)) {
      return NextResponse.json({ success: false, error: 'Kein Zugriff' }, { status: 403 });
    }

    const { project_id, datum, gewerke } = await req.json();
    if (!project_id || !datum) return NextResponse.json({ success: false, error: 'project_id und datum erforderlich' }, { status: 400 });

    const ergebnis = await buildTeamVorschlag(project_id, datum, gewerke || []);
    if ('fehler' in ergebnis) return NextResponse.json({ success: false, error: ergebnis.fehler }, { status: 502 });
    return NextResponse.json({ success: true, ...ergebnis });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
