import { NextRequest, NextResponse } from 'next/server';
import { buildGaebX84 } from '@/lib/gaeb';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – GAEB-Angebot exportieren (Phase 40)
// POST { xml: string, preise: (number|null)[] } → X84-Datei (Text)
// Preise werden nach REIHENFOLGE der Positionen zugeordnet (siehe
// buildGaebX84 – robust auch ohne/mit unvollständiger Positionsnummer).
// ============================================================

const ROLES = ['admin', 'disponent'];

async function callerRole(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    return profile?.role || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const role = await callerRole();
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: 'Nur Admin und Disposition.' }, { status: 403 });
  }

  try {
    const { xml, preise } = await req.json();
    if (!xml || !preise) {
      return NextResponse.json({ success: false, error: 'xml und preise erforderlich' }, { status: 400 });
    }
    const x84 = buildGaebX84(xml, preise);
    return NextResponse.json({ success: true, x84 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
