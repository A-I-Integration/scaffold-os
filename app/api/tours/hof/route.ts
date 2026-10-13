import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, serverErrorResponse, forbiddenResponse } from '@/lib/auth';
import { darfStoppAendern } from '@/lib/touren/berechtigung';
import { hofSpalteFehlt, istGueltigePosition } from '@/lib/touren/hof';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// ============================================================
// POST /api/tours/hof
// Body: { tour_id, aktion: 'abfahrt' | 'rueckkehr', lat?, lng? }
//
// "Vom Hof gefahren" setzt die Tour auf "unterwegs" und speichert
// Uhrzeit + Position. "Zurück auf dem Hof" speichert Uhrzeit + Position
// und schließt die Tour ab.
//
// Berechtigung: wie bei den Tour-Stopps – nur admin/disponent ODER wer
// laut Tour (Fahrer oder Team) zuständig ist (darfStoppAendern).
// Die Hof-Adresse selbst wird nicht gebraucht: gespeichert wird die
// Position des Handys beim Knopfdruck.
//
// Idempotent: ein zweiter Klick überschreibt die erste Zeit NICHT.
// Fehlen die Datenbank-Spalten (SQL phase-100 noch nicht ausgeführt),
// wird nur der Status gesetzt und zeitenGespeichert=false gemeldet.
// ============================================================
export async function POST(req: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const body = await req.json().catch(() => ({}));
    const tourId = String(body?.tour_id || '');
    const aktion = body?.aktion;
    if (!/^[0-9a-fA-F-]{36}$/.test(tourId)) {
      return NextResponse.json({ success: false, error: 'Tour nicht gefunden.' }, { status: 400 });
    }
    if (aktion !== 'abfahrt' && aktion !== 'rueckkehr') {
      return NextResponse.json({ success: false, error: 'Unbekannte Aktion.' }, { status: 400 });
    }
    if (!(await darfStoppAendern(tourId))) {
      return forbiddenResponse('Du bist für diese Tour nicht zuständig.');
    }

    const pos = istGueltigePosition(body?.lat, body?.lng) ? { lat: body.lat as number, lng: body.lng as number } : null;

    // Tour lesen (mit Hof-Spalten; fehlen sie noch, ohne)
    let hatSpalten = true;
    let tRes = await fetch(`${url}/rest/v1/tours?id=eq.${tourId}&select=id,status,departed_at,returned_at`, { headers });
    if (!tRes.ok) {
      const txt = await tRes.text();
      if (!hofSpalteFehlt(txt)) throw new Error(txt);
      hatSpalten = false;
      tRes = await fetch(`${url}/rest/v1/tours?id=eq.${tourId}&select=id,status`, { headers });
      if (!tRes.ok) throw new Error(await tRes.text());
    }
    const tour = (await tRes.json())?.[0];
    if (!tour) return NextResponse.json({ success: false, error: 'Tour nicht gefunden.' }, { status: 404 });

    const jetzt = new Date().toISOString();
    let updates: Record<string, unknown>;

    if (aktion === 'abfahrt') {
      if (tour.status === 'completed' || tour.status === 'cancelled') {
        return NextResponse.json({ success: false, error: 'Diese Tour ist bereits abgeschlossen oder storniert.' }, { status: 400 });
      }
      if (tour.departed_at || (!hatSpalten && tour.status === 'in_progress')) {
        return NextResponse.json({ success: true, bereitsErledigt: true, zeitenGespeichert: hatSpalten, tour });
      }
      updates = { status: 'in_progress', updated_at: jetzt };
      if (hatSpalten) {
        updates.departed_at = jetzt;
        if (pos) { updates.departed_lat = pos.lat; updates.departed_lng = pos.lng; }
      }
    } else {
      if (tour.status === 'cancelled') {
        return NextResponse.json({ success: false, error: 'Diese Tour ist storniert.' }, { status: 400 });
      }
      if (tour.status === 'completed') {
        return NextResponse.json({ success: true, bereitsErledigt: true, zeitenGespeichert: hatSpalten, tour });
      }
      if (!tour.departed_at && tour.status !== 'in_progress') {
        return NextResponse.json({ success: false, error: 'Bitte zuerst „Vom Hof gefahren“ drücken.' }, { status: 400 });
      }
      updates = { status: 'completed', completed_at: jetzt, updated_at: jetzt };
      if (hatSpalten) {
        updates.returned_at = jetzt;
        if (pos) { updates.returned_lat = pos.lat; updates.returned_lng = pos.lng; }
      }
    }

    let res = await fetch(`${url}/rest/v1/tours?id=eq.${tourId}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(updates),
    });
    let zeitenGespeichert = hatSpalten;
    if (!res.ok) {
      const txt = await res.text();
      if (!hatSpalten || !hofSpalteFehlt(txt)) throw new Error(txt);
      // Spalten fehlen doch: nur Status/Abschluss setzen, Zeiten melden wir als nicht gespeichert
      const nurStatus: Record<string, unknown> = { status: updates.status, updated_at: jetzt };
      if (updates.completed_at) nurStatus.completed_at = updates.completed_at;
      res = await fetch(`${url}/rest/v1/tours?id=eq.${tourId}`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(nurStatus),
      });
      if (!res.ok) throw new Error(await res.text());
      zeitenGespeichert = false;
    }
    const rows = await res.json();
    return NextResponse.json({ success: true, zeitenGespeichert, positionGespeichert: !!pos && zeitenGespeichert, tour: rows?.[0] ?? null });
  } catch (err: any) {
    return serverErrorResponse(err, 'tours/hof');
  }
}
