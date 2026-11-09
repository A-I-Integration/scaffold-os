import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse } from '@/lib/auth';
import { hauptlagerId, rpc } from '@/lib/inventory/buchung';

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
    // Auf der Baustelle zurückgeben kann man höchstens, was dort gebucht ist: physischer Bestand ("frei") + noch reserviertes Material
    // (Rückgabe vor der Anlieferung gibt die Reservierung frei). Der Abzug läuft erst vom physischen Bestand, dann von der Reservierung.
    interface Plan {
      inventory_id: string; name: string; unit: string; zurueck: number; verlust: number; grund?: string; frei: number; reserviert: number;
    }
    const plaene: Plan[] = [];
    const ortRes = await rpc('lagerort_fuer_projekt', { p_project: project_id });
    if (!ortRes.ok || typeof ortRes.daten !== 'string') {
      return NextResponse.json({ success: false, error: 'Lagerort der Baustelle konnte nicht bestimmt werden.' }, { status: 400 });
    }
    const baustellenOrt = ortRes.daten;

    for (const pos of items) {
      const { inventory_id, zurueck, fehlt_beschaedigt, grund } = pos;
      if (!inventory_id) continue;
      const menzeZurueck = Math.max(0, Math.floor(Number(zurueck) || 0));
      const menzeVerlust = Math.max(0, Math.floor(Number(fehlt_beschaedigt) || 0));
      if (menzeZurueck === 0 && menzeVerlust === 0) continue;

      const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=quantity,name,unit`, { headers });
      if (!getRes.ok) throw new Error(await getRes.text());
      const artikel = (await getRes.json())?.[0];
      if (!artikel) continue;

      const bRes = await fetch(`${url}/rest/v1/bestand?inventory_id=eq.${inventory_id}&lagerort_id=eq.${baustellenOrt}&select=zustand,menge`, { headers });
      if (!bRes.ok) throw new Error(await bRes.text());
      const zeilen: { zustand: string; menge: number }[] = await bRes.json();
      const frei = zeilen.filter((z) => z.zustand === 'frei').reduce((n, z) => n + (Number(z.menge) || 0), 0);
      const reserviert = zeilen.filter((z) => z.zustand === 'reserviert').reduce((n, z) => n + (Number(z.menge) || 0), 0);
      const aufBaustelle = frei + reserviert;
      const verlassen = menzeZurueck + menzeVerlust;
      if (verlassen > aufBaustelle) {
        return NextResponse.json(
          { success: false, error: `${artikel.name}: Auf der Baustelle sind nur ${aufBaustelle} ${artikel.unit || ''} gebucht, ${verlassen} sollen zurück bzw. fehlen.` },
          { status: 400 },
        );
      }
      plaene.push({ inventory_id, name: artikel.name, unit: artikel.unit, zurueck: menzeZurueck, verlust: menzeVerlust, grund, frei, reserviert });
    }

    // ---- 2. Buchen: Rücknahme (RN: Baustelle → Hauptlager) und Verlust (VL: Baustelle → ausgebucht) als Belege ----
    const ergebnisse: any[] = [];
    if (plaene.length > 0) {
      const haupt = await hauptlagerId();
      if (!haupt) throw new Error('Hauptlager nicht gefunden');
      const rn: Record<string, unknown>[] = [];
      const vl: Record<string, unknown>[] = [];
      for (const pl of plaene) {
        let frei = pl.frei, res = pl.reserviert;
        const nimm = (menge: number) => { const f = Math.min(menge, frei); frei -= f; const r = menge - f; res -= r; return { f, r }; };
        const z = nimm(pl.zurueck);
        if (z.f) rn.push({ inventory_id: pl.inventory_id, menge: z.f, von_lagerort: baustellenOrt, von_zustand: 'frei', nach_lagerort: haupt, nach_zustand: 'frei' });
        if (z.r) rn.push({ inventory_id: pl.inventory_id, menge: z.r, von_lagerort: baustellenOrt, von_zustand: 'reserviert', nach_lagerort: haupt, nach_zustand: 'frei' });
        const v = nimm(pl.verlust);
        if (v.f) vl.push({ inventory_id: pl.inventory_id, menge: v.f, von_lagerort: baustellenOrt, von_zustand: 'frei' });
        if (v.r) vl.push({ inventory_id: pl.inventory_id, menge: v.r, von_lagerort: baustellenOrt, von_zustand: 'reserviert' });
      }
      const bem = event_id ? `Rückgabe nach Demontage (Ereignis ${event_id})` : 'Rückgabe nach Demontage';
      const fehlerAntwort = (msg: string) => /Nicht genug Bestand/.test(msg)
        ? NextResponse.json({ success: false, error: 'Der Baustellenbestand wurde zwischenzeitlich geändert. Bitte erneut versuchen.' }, { status: 409 })
        : null;

      let rnBeleg: string | null = null;
      if (rn.length > 0) {
        const r = await rpc('buche_lager', { p_bewegungsart: 'RN', p_positionen: rn, p_project: project_id, p_bemerkung: bem, p_referenz_typ: 'demontage_rueckgabe' });
        if (!r.ok) return fehlerAntwort(r.meldung) ?? serverErrorResponse(new Error(r.meldung));
        rnBeleg = String(r.daten);
      }
      if (vl.length > 0) {
        const r = await rpc('buche_lager', { p_bewegungsart: 'VL', p_positionen: vl, p_project: project_id, p_bemerkung: 'Fehlmenge/Schaden bei Rücktransport', p_referenz_typ: 'demontage_verlust' });
        if (!r.ok) {
          // Beide Teile gehören zusammen: scheitert der zweite, wird der erste storniert.
          if (rnBeleg) await rpc('storniere_lager', { p_beleg: rnBeleg, p_grund: 'Rückgabe abgebrochen (Verlustbuchung fehlgeschlagen)' });
          return fehlerAntwort(r.meldung) ?? serverErrorResponse(new Error(r.meldung));
        }
      }

      // Altes Protokoll (Berichte lesen es noch)
      for (const pl of plaene) {
        if (pl.zurueck > 0) {
          await fetch(`${url}/rest/v1/inventory_transactions`, {
            method: 'POST', headers,
            body: JSON.stringify({ inventory_id: pl.inventory_id, project_id, type: 'in', quantity: pl.zurueck, reason: pl.grund || `Rückgabe nach Demontage`, reference_type: 'demontage_rueckgabe', reference_id: event_id || null }),
          });
        }
        if (pl.verlust > 0) {
          await fetch(`${url}/rest/v1/inventory_transactions`, {
            method: 'POST', headers,
            body: JSON.stringify({ inventory_id: pl.inventory_id, project_id, type: 'loss', quantity: -pl.verlust, reason: pl.grund || `Fehlmenge/Schaden bei Rücktransport`, reference_type: 'demontage_verlust', reference_id: event_id || null }),
          });
        }
        ergebnisse.push({ inventory_id: pl.inventory_id, name: pl.name, unit: pl.unit, zurueck: pl.zurueck, verlust: pl.verlust });
      }
    }

    if (ergebnisse.length === 0) {
      return NextResponse.json({ success: false, error: 'Keine gültigen Positionen zum Buchen.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, gebucht: ergebnisse });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
