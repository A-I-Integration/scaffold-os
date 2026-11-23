import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth';
import { distanceMatrixKm } from '@/lib/google-distance';

// POST /api/fahrtstrecke  { adresse }  →  Fahrstrecke (einfach) vom Lager der Firma zur Baustelle, in km.
// Quelle: Google Distance Matrix (lib/google-distance.ts). Ohne Ergebnis wird KEINE Zahl erfunden:
// { km: null, grund } – die Seite lässt dann die km von Hand eintragen.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

export async function POST(req: NextRequest) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const { adresse } = await req.json();
    const ziel = String(adresse ?? '').trim().slice(0, 300);
    if (!ziel) return NextResponse.json({ success: true, km: null, grund: 'Für die Baustelle ist keine Adresse eingetragen.' });
    if (!process.env.GOOGLE_MAPS_API_KEY) return NextResponse.json({ success: true, km: null, grund: 'Die automatische Entfernung ist nicht eingerichtet – bitte die km von Hand eintragen.' });

    const res = await fetch(`${url}/rest/v1/company_settings?id=eq.${SINGLETON_ID}&select=depot_address,street,zip,city`, { headers, cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text());
    const f = (await res.json())?.[0] ?? {};
    const start = String(f.depot_address || [f.street, [f.zip, f.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')).trim();
    if (!start) return NextResponse.json({ success: true, km: null, grund: 'In den Einstellungen ist weder Lager- noch Firmenadresse eingetragen.' });

    const km = (await distanceMatrixKm([ziel], start)).get(ziel) ?? null;
    if (km === null) return NextResponse.json({ success: true, km: null, grund: 'Die Strecke konnte nicht ermittelt werden – bitte die km von Hand eintragen.' });
    return NextResponse.json({ success: true, km, start });
  } catch (err) {
    return serverErrorResponse(err);
  }
}
