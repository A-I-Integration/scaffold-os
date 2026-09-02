import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Material-Rückgabe nach Demontage (Phase 23)
//
// Schließt die Lücke zwischen Dokumentation (Demontage/Rücktransport,
// Phase 18) und Lager: bisher gab es keine Verbindung – reserviertes
// Material "verschwand" beim Abbau, ohne dass der Lagerbestand je
// wieder erhöht oder eine Fehlmenge/ein Schaden erfasst wurde.
//
// POST /api/inventory/return
// Body: {
//   project_id, event_id? (project_events.id, falls aus der
//   Dokumentation heraus aufgerufen),
//   items: [{ inventory_id, zurueck, fehlt_beschaedigt, grund? }]
// }
//
// Pro Position:
//   - "zurueck" (intaktes Material) → Lagerbestand wird erhöht,
//     Transaktion type "in", reference_type "demontage_rueckgabe"
//   - "fehlt_beschaedigt" (Fehlmenge/Schaden) → Lagerbestand bleibt
//     unverändert (es kommt ja nichts zurück), aber wird als
//     Transaktion type "loss" protokolliert – für Auswertung/
//     ggf. Weiterberechnung an den Kunden, nicht automatisch.
//
// Rollen: admin, disponent, lager, bauleiter (wer vor Ort abbaut).
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const ROLES = ['admin', 'disponent', 'lager', 'bauleiter'];

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
    return NextResponse.json({ success: false, error: 'Keine Berechtigung für Lagerbuchungen.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { project_id, event_id, items } = body;

    if (!project_id) {
      return NextResponse.json({ success: false, error: 'project_id erforderlich' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'Mindestens eine Position erforderlich.' }, { status: 400 });
    }

    const ergebnisse: any[] = [];

    for (const pos of items) {
      const { inventory_id, zurueck, fehlt_beschaedigt, grund } = pos;
      if (!inventory_id) continue;
      const menzeZurueck = Math.max(0, Number(zurueck) || 0);
      const menzeVerlust = Math.max(0, Number(fehlt_beschaedigt) || 0);
      if (menzeZurueck === 0 && menzeVerlust === 0) continue;

      // Aktuellen Bestand holen
      const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=quantity,name,unit`, { headers });
      if (!getRes.ok) throw new Error(await getRes.text());
      const rows = await getRes.json();
      const artikel = rows?.[0];
      if (!artikel) continue;

      if (menzeZurueck > 0) {
        const neuerBestand = artikel.quantity + menzeZurueck;
        const updRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ quantity: neuerBestand, updated_at: new Date().toISOString() }),
        });
        if (!updRes.ok) throw new Error(await updRes.text());

        await fetch(`${url}/rest/v1/inventory_transactions`, {
          method: 'POST', headers,
          body: JSON.stringify({
            inventory_id, project_id, type: 'in', quantity: menzeZurueck,
            reason: grund || `Rückgabe nach Demontage`,
            reference_type: 'demontage_rueckgabe',
            reference_id: event_id || null,
          }),
        });
      }

      if (menzeVerlust > 0) {
        // Bewusst KEINE Bestandsänderung – das Material war schon "draußen"
        // (Reservierung hat den Bestand bereits verringert), es kommt nur
        // nicht zurück. Reine Protokollierung für Auswertung/Nachbelastung.
        await fetch(`${url}/rest/v1/inventory_transactions`, {
          method: 'POST', headers,
          body: JSON.stringify({
            inventory_id, project_id, type: 'loss', quantity: -menzeVerlust,
            reason: grund || `Fehlmenge/Schaden bei Rücktransport`,
            reference_type: 'demontage_verlust',
            reference_id: event_id || null,
          }),
        });
      }

      ergebnisse.push({ inventory_id, name: artikel.name, unit: artikel.unit, zurueck: menzeZurueck, verlust: menzeVerlust });
    }

    if (ergebnisse.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine gültigen Positionen zum Buchen.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, gebucht: ergebnisse });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
