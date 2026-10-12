// ============================================================
// SCAFFOLD OS – Automatische Fahrt bei Angebots-Annahme (DB-Teil)
//
// Wird von lib/angebot-annahme.ts nach dem Anlegen der Transportaufträge
// aufgerufen. Legt eine Tour (Status 'planned') am Projektbeginn an:
// Fahrzeug nach Gewicht, Fahrer = freier Mitarbeiter (Regeln:
// lib/auto-tour-wahl.ts). Gleiche Struktur wie POST /api/tours
// (tours + tour_stops, Transporte → in_transit), nur ohne Session,
// weil der Lauf nach der Antwort per after() passiert.
// Nichts Passendes gefunden → keine Tour, sondern ein Hinweis.
// ============================================================

import { loadArticlePrices } from '@/lib/calculations/article-prices';
import {
  gesamtgewichtKg, waehleFahrzeug, waehleFahrer,
  type FahrzeugKurz, type FahrerKandidat,
} from '@/lib/auto-tour-wahl';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export interface AutoTourErgebnis {
  tourId?: string;
  tourName?: string;
  fahrzeug?: string;
  fahrer?: string;
  datum?: string;
  gewichtKg?: number;
  hinweis?: string;
}

async function lese<T = any>(pfad: string): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${pfad}`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`${pfad.split('?')[0]} nicht lesbar (${res.status})`);
  return res.json();
}

export async function legeAutoTourAn(p: {
  projektName: string;
  adresse: string | null;
  /** Projektbeginn (YYYY-MM-DD) aus Aufmaß Schritt 1 */
  datum: string | null | undefined;
  transportOrderIds: string[];
  positionen: { sku: string; quantity: number }[];
}): Promise<AutoTourErgebnis> {
  try {
    if (p.transportOrderIds.length === 0) return { hinweis: 'Keine Transportaufträge – keine Fahrt nötig.' };
    if (!p.datum) return { hinweis: 'Im Aufmaß ist kein Projektbeginn eingetragen – ohne Datum keine automatische Fahrt.' };
    const heute = new Date().toISOString().slice(0, 10);
    if (p.datum < heute) return { hinweis: `Der Projektbeginn (${p.datum}) liegt in der Vergangenheit.` };

    // Gewicht: Lager-Gewicht, sonst Standardgewicht der Artikelnummer (article-prices.ts)
    const preise = await loadArticlePrices();
    const gewicht = gesamtgewichtKg(
      p.positionen.map((z) => ({ quantity: z.quantity, gewichtProStueckKg: preise[z.sku]?.weightKg ?? 0 }))
    );

    const [fahrzeuge, touren, drivers, mitarbeiter, abwesend, zuweisungen] = await Promise.all([
      lese<FahrzeugKurz>('vehicles?is_active=eq.true&select=id,name,capacity_kg,zulaessiges_gesamtgewicht_kg'),
      lese<any>(`tours?planned_date=eq.${p.datum}&status=in.(planned,in_progress)&select=vehicle_id,driver_id,team_ids`),
      lese<any>('drivers?select=id,name,employee_id'),
      lese<any>('employees?status=eq.active&select=id,first_name,last_name,fuehrerschein_klassen'),
      lese<any>(`absences?status=eq.approved&start_date=lte.${p.datum}&end_date=gte.${p.datum}&select=employee_id`),
      lese<any>('project_assignments?select=employee_id,project_id'),
    ]);
    const beginne = await lese<any>('projects?select=id,beginn:data->step1->>projektbeginn');

    // Wer ist an dem Tag schon gebunden? (Touren als Fahrer/Team + Baustellen-Zuteilung mit gleichem Beginn)
    const driverZuMa = new Map<string, string>(drivers.filter((d: any) => d.employee_id).map((d: any) => [d.id, d.employee_id]));
    const belegteFahrzeuge = new Set<string>(touren.map((t: any) => t.vehicle_id).filter(Boolean));
    const belegteMa = new Set<string>();
    for (const t of touren) {
      for (const did of [t.driver_id, ...(Array.isArray(t.team_ids) ? t.team_ids : [])]) {
        const ma = did && driverZuMa.get(did);
        if (ma) belegteMa.add(ma);
      }
    }
    const beginnNachProjekt = new Map<string, string>(beginne.map((b: any) => [b.id, b.beginn]));
    for (const z of zuweisungen) {
      if (beginnNachProjekt.get(z.project_id) === p.datum) belegteMa.add(z.employee_id);
    }
    const abwesendIds = new Set<string>(abwesend.map((a: any) => a.employee_id));

    const fz = waehleFahrzeug(fahrzeuge, gewicht, belegteFahrzeuge);
    if ('hinweis' in fz) return { hinweis: fz.hinweis, gewichtKg: gewicht, datum: p.datum };

    const kandidaten: FahrerKandidat[] = mitarbeiter.map((e: any) => ({
      employee_id: e.id,
      name: `${e.first_name} ${e.last_name}`.trim(),
      klassen: Array.isArray(e.fuehrerschein_klassen) ? e.fuehrerschein_klassen : [],
    }));
    const fa = waehleFahrer(kandidaten, abwesendIds, belegteMa, fz.fahrzeug);
    if ('hinweis' in fa) return { hinweis: fa.hinweis, gewichtKg: gewicht, datum: p.datum, fahrzeug: fz.fahrzeug.name };

    // Fahrer-Datensatz (drivers) holen oder anlegen – wie POST /api/tours
    let driverId = drivers.find((d: any) => d.employee_id === fa.fahrer.employee_id)?.id as string | undefined;
    if (!driverId) {
      const r = await fetch(`${url}/rest/v1/drivers`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ name: fa.fahrer.name, employee_id: fa.fahrer.employee_id }),
      });
      if (!r.ok) throw new Error('Fahrer-Datensatz konnte nicht angelegt werden (' + r.status + ')');
      driverId = (await r.json())?.[0]?.id;
      if (!driverId) throw new Error('Fahrer-Datensatz ohne ID');
    }

    const tourName = `Anlieferung ${p.projektName}`;
    const tRes = await fetch(`${url}/rest/v1/tours`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        name: tourName,
        vehicle_id: fz.fahrzeug.id,
        driver_id: driverId,
        team_ids: [driverId],
        planned_date: p.datum,
        planned_start_time: '07:00:00',
        status: 'planned',
        total_weight_kg: Math.round(gewicht),
      }),
    });
    if (!tRes.ok) throw new Error('Tour konnte nicht angelegt werden (' + tRes.status + ')');
    const tour = (await tRes.json())?.[0];
    if (!tour?.id) throw new Error('Tour ohne ID');

    const stopps = p.transportOrderIds.map((id, i) => ({
      tour_id: tour.id, transport_order_id: id, stop_order: i + 1,
      address: p.adresse || 'Unbekannt', status: 'pending',
    }));
    const sRes = await fetch(`${url}/rest/v1/tour_stops`, { method: 'POST', headers, body: JSON.stringify(stopps) });
    if (!sRes.ok) {
      // Halb angelegte Tour nicht stehen lassen: stornieren (nichts löschen)
      await fetch(`${url}/rest/v1/tours?id=eq.${tour.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'cancelled' }) });
      throw new Error('Tour-Stopps konnten nicht angelegt werden (' + sRes.status + ')');
    }

    for (const id of p.transportOrderIds) {
      await fetch(`${url}/rest/v1/transport_orders?id=eq.${id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'in_transit' }) });
    }

    return {
      tourId: tour.id, tourName, datum: p.datum, gewichtKg: gewicht,
      fahrzeug: fz.fahrzeug.name, fahrer: fa.fahrer.name,
    };
  } catch (e: any) {
    return { hinweis: `Fehler beim Anlegen der Fahrt: ${String(e?.message || e)}` };
  }
}

// ------------------------------------------------------------
// Fahrt nachholen: Transportaufträge des Projekts, die noch in keiner
// Tour sind (Status 'pending'), mit denselben Regeln einplanen und das
// Ergebnis am Projekt vermerken. Wird automatisch ausgelöst, sobald der
// Projektbeginn eingetragen/geändert wird (app/api/projects PATCH), und
// von POST /api/auto-tour ("Jetzt neu prüfen").
// ------------------------------------------------------------
export async function fahrtNachholen(projectId: string): Promise<{ ok: boolean; tour?: AutoTourErgebnis; fehler?: string; status?: number }> {
  const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=name,adresse,data`, { headers });
  if (!pRes.ok) throw new Error('Projekt nicht lesbar (' + pRes.status + ')');
  const projekt = (await pRes.json())?.[0];
  if (!projekt) return { ok: false, fehler: 'Projekt nicht gefunden', status: 404 };

  const tRes = await fetch(
    `${url}/rest/v1/transport_orders?to_project_id=eq.${projectId}&status=eq.pending&select=id,quantity,inventory:inventory_id(sku)`,
    { headers }
  );
  if (!tRes.ok) throw new Error('Transportaufträge nicht lesbar (' + tRes.status + ')');
  const offen: { id: string; quantity: number; inventory: { sku: string | null } | null }[] = await tRes.json();
  if (offen.length === 0) {
    return { ok: false, fehler: 'Keine offenen Transportaufträge für dieses Projekt (schon in einer Tour oder nie angelegt).', status: 409 };
  }

  const tour = await legeAutoTourAn({
    projektName: projekt.name || 'Projekt',
    adresse: projekt.adresse ?? null,
    datum: projekt.data?.step1?.projektbeginn,
    transportOrderIds: offen.map((o) => o.id),
    positionen: offen.map((o) => ({ sku: o.inventory?.sku || '', quantity: Number(o.quantity) || 0 })),
  });

  // Ergebnis am Projekt vermerken (frisch lesen, damit nichts überschrieben wird)
  const frisch = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers }).then((r) => r.json());
  const data = frisch?.[0]?.data || {};
  await fetch(`${url}/rest/v1/projects?id=eq.${projectId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ data: { ...data, lagerAutomatikErgebnis: { ...(data.lagerAutomatikErgebnis || {}), tour } } }),
  });
  return { ok: !!tour.tourId, tour };
}

/** Für after(): fängt Fehler ab und vermerkt sie als Hinweis am Projekt. */
export async function fahrtNachholenSicher(projectId: string): Promise<void> {
  try {
    await fahrtNachholen(projectId);
  } catch (e: any) {
    try {
      const frisch = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers }).then((r) => r.json());
      const data = frisch?.[0]?.data || {};
      await fetch(`${url}/rest/v1/projects?id=eq.${projectId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ data: { ...data, lagerAutomatikErgebnis: { ...(data.lagerAutomatikErgebnis || {}), tour: { hinweis: `Fehler beim Anlegen der Fahrt: ${String(e?.message || e)}` } } } }),
      });
    } catch { /* best-effort */ }
  }
}
