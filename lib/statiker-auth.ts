import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { istStatiker } from '@/lib/statiker'

// Prüft für die Statiker-API-Routen: eingeloggt UND als Statiker gekennzeichnet
// (Flag app_metadata.statiker, nur per Service-Schlüssel setzbar). Normale
// Mitarbeiter-Logins kommen hier bewusst NICHT durch – die Routen sind nur für Statiker.
export async function pruefeStatiker(): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, response: NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 }) }
    if (!istStatiker(user)) return { ok: false, response: NextResponse.json({ success: false, error: 'Keine Berechtigung.' }, { status: 403 }) }
    return { ok: true, userId: user.id }
  } catch {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 }) }
  }
}
