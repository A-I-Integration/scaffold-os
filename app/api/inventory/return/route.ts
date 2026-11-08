import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';

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

    // ---- 1. Alles prüfen und planen, BEVOR irgendetwas gebucht wird ----
    // Auf der Baustelle zurückgeben kann man höchstens, was dort gebucht ist: physischer Bestand + noch reserviertes Material
    // (Rückgabe vor der Anlieferung gibt die Reservierung frei). Je Baustelle und Artikel kann es mehrere Zeilen geben (ältere Daten);
    // der Abzug läuft über alle Zeilen, erst vom physischen Bestand, dann von der Reservierung.
    type Zeile = { id: string; quantity: number; reserved_quantity: number };
    interface Plan {
      inventory_id: string; name: string; unit: string; lagerMenge: number;
      zurueck: number; verlust: number; grund?: string;
      zeilen: { id: string; quantity: number; reserved_quantity: number }[];
    }
    const plaene: Plan[] = [];

    for (const pos of items) {
      const { inventory_id, zurueck, fehlt_beschaedigt, grund } = pos;
      if (!inventory_id) continue;
      const menzeZurueck = Math.max(0, Number(zurueck) || 0);
      const menzeVerlust = Math.max(0, Number(fehlt_beschaedigt) || 0);
      if (menzeZurueck === 0 && menzeVerlust === 0) continue;

      const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=quantity,name,unit`, { headers });
      if (!getRes.ok) throw new Error(await getRes.text());
      const artikel = (await getRes.json())?.[0];
      if (!artikel) continue;

      const siteGet = await fetch(
        `${url}/rest/v1/site_stock?project_id=eq.${project_id}&inventory_id=eq.${inventory_id}&select=id,quantity,reserved_quantity&order=created_at.asc`,
        { headers },
      );
      const zeilen: Zeile[] = siteGet.ok ? await siteGet.json() : [];
      const aufBaustelle = zeilen.reduce((sum, z) => sum + (Number(z.quantity) || 0) + (Number(z.reserved_quantity) || 0), 0);
      const verlassen = menzeZurueck + menzeVerlust;
      if (verlassen > aufBaustelle) {
        return NextResponse.json(
          { success: false, error: `${artikel.name}: Auf der Baustelle sind nur ${aufBaustelle} ${artikel.unit || ''} gebucht, ${verlassen} sollen zurück bzw. fehlen.` },
          { status: 400 },
        );
      }
      plaene.push({ inventory_id, name: artikel.name, unit: artikel.unit, lagerMenge: Number(artikel.quantity) || 0, zurueck: menzeZurueck, verlust: menzeVerlust, grund, zeilen });
    }

    // ---- 2. Buchen ----
    const ergebnisse: any[] = [];
    for (const pl of plaene) {
      if (pl.zurueck > 0) {
        // Bestand nur ändern, wenn er seit dem Lesen unverändert ist (sonst Fehler statt stilles Überschreiben)
        const updRes = await fetch(`${url}/rest/v1/inventory?id=eq.${pl.inventory_id}&quantity=eq.${pl.lagerMenge}`, {
          method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ quantity: pl.lagerMenge + pl.zurueck, updated_at: new Date().toISOString() }),
        });
        if (!updRes.ok) throw new Error(await updRes.text());
        if (!(await updRes.json()).length) {
          return NextResponse.json({ success: false, error: `${pl.name}: Der Lagerbestand wurde zwischenzeitlich geändert. Bitte erneut versuchen.` }, { status: 409 });
        }

        await fetch(`${url}/rest/v1/inventory_transactions`, {
          method: 'POST', headers,
          body: JSON.stringify({
            inventory_id: pl.inventory_id, project_id, type: 'in', quantity: pl.zurueck,
            reason: pl.grund || `Rückgabe nach Demontage`,
            reference_type: 'demontage_rueckgabe',
            reference_id: event_id || null,
          }),
        });
      }

      if (pl.verlust > 0) {
        // Bewusst KEINE Zentrallager-Änderung – das Material war schon
        // "draußen", es kommt nur nicht zurück. Reine Protokollierung
        // für Auswertung/Nachbelastung.
        await fetch(`${url}/rest/v1/inventory_transactions`, {
          method: 'POST', headers,
          body: JSON.stringify({
            inventory_id: pl.inventory_id, project_id, type: 'loss', quantity: -pl.verlust,
            reason: pl.grund || `Fehlmenge/Schaden bei Rücktransport`,
            reference_type: 'demontage_verlust',
            reference_id: event_id || null,
          }),
        });
      }

      // Baustellenbestand verringern (zurück + Verlust verlassen beide die Baustelle):
      // erst vom physischen Bestand, dann von der Reservierung, über alle Zeilen.
      let rest = pl.zurueck + pl.verlust;
      for (const z of pl.zeilen) {
        if (rest <= 0) break;
        const ausPhysisch = Math.min(rest, Number(z.quantity) || 0);
        rest -= ausPhysisch;
        const ausReserviert = Math.min(rest, Number(z.reserved_quantity) || 0);
        rest -= ausReserviert;
        if (ausPhysisch === 0 && ausReserviert === 0) continue;
        await fetch(`${url}/rest/v1/site_stock?id=eq.${z.id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ quantity: (Number(z.quantity) || 0) - ausPhysisch, reserved_quantity: (Number(z.reserved_quantity) || 0) - ausReserviert }),
        });
      }

      ergebnisse.push({ inventory_id: pl.inventory_id, name: pl.name, unit: pl.unit, zurueck: pl.zurueck, verlust: pl.verlust });
    }

    if (ergebnisse.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine gültigen Positionen zum Buchen.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, gebucht: ergebnisse });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
