import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Wer bin ich?
// Phase 6 / Stufe 3
//
// Liefert den Mitarbeiter-Datensatz, der mit dem aktuell
// eingeloggten Login verknüpft ist (employees.user_id).
// Die Fahrer-App nutzt das zur automatischen Erkennung –
// keine Namenswahl mehr nötig.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Nicht eingeloggt' }, { status: 401 });
    }

    const res = await fetch(
      `${url}/rest/v1/employees?select=id,first_name,last_name&user_id=eq.${user.id}&limit=1`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    const employee = rows?.[0] || null;

    return NextResponse.json({ success: true, employee });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
