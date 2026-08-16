// ============================================================
// SCAFFOLD OS – Impact-Tracking (Phase 17)
//
// trackImpact() schreibt ein betriebliches Ereignis in die
// Tabelle impact_events (per REST mit Service-Key).
// Feuer-und-vergessen: Fehler werden nur geloggt, niemals
// geworfen – das Tracking darf nie einen Geschäftsvorgang
// blockieren.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function trackImpact(
  event: string,
  wert?: number,
  einheit?: 'eur' | 'std' | 'km' | '%' | 'min',
  meta?: Record<string, any>
): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/impact_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ event, wert: wert ?? null, einheit: einheit ?? null, meta: meta ?? {} }),
    });
  } catch (err) {
    console.error('Impact-Tracking fehlgeschlagen (ignoriert):', event, err);
  }
}
