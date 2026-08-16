import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – E-Mail-Tracking: Öffnungs-Pixel (Phase 18)
//
// GET /api/track/open?typ=angebot&ref=<projektId>
// GET /api/track/open?typ=rechnung&ref=<rechnungsnummer>
//
// Wird als 1×1-Bild in versendete Angebots-/Rechnungs-Mails
// eingebettet. Ruft der Kunde die Mail auf, lädt sein
// Mailprogramm das Bild → wir erfassen die Öffnung.
//
// • Kein Login nötig (der Empfänger ist ja der KUNDE des Betriebs)
// • Erfasst wird nur: Typ, Referenz, Zeitpunkt – keine
//   Personendaten (IP/User-Agent werden NICHT gespeichert)
// • Bei Angeboten: Status springt automatisch auf „gelesen"
// • Antwortet immer mit einem transparenten 1×1-GIF
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  'apikey': key,
  'Authorization': `Bearer ${key}`,
};

// Transparentes 1×1-GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(req: NextRequest) {
  const typ = req.nextUrl.searchParams.get('typ') || 'unbekannt';
  const ref = req.nextUrl.searchParams.get('ref') || '';

  // Feuer und vergessen – das Bild muss sofort raus, Tracking danach
  (async () => {
    try {
      if (ref) {
        await fetch(`${url}/rest/v1/impact_events`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            event: 'email_geoeffnet',
            meta: { typ, ref },
          }),
        });

        // Angebot geöffnet → Status „gelesen" (nur hochstufen, nie zurück)
        if (typ === 'angebot') {
          const pRes = await fetch(
            `${url}/rest/v1/projects?id=eq.${encodeURIComponent(ref)}&select=id,data`,
            { headers }
          );
          if (pRes.ok) {
            const rows = await pRes.json();
            const projekt = rows?.[0];
            if (projekt && projekt.data?.angebotsStatus === 'versendet') {
              await fetch(`${url}/rest/v1/projects?id=eq.${projekt.id}`, {
                method: 'PATCH',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify({
                  data: { ...projekt.data, angebotsStatus: 'gelesen' },
                }),
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('[Tracking] Öffnung nicht gespeichert (ignoriert):', err);
    }
  })();

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  });
}
