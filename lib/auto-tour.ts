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
  gesamtgewichtKg, teileInFahrten, planeFahrtZeit, minutenZuUhrzeit, uhrzeitZuMinuten, FAHRT_DAUER_MIN,
  type ZeitPlanung,
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
      lese<any>(`tours?planned_date=eq.${p.datum}&status=in.(planned,in_progress)&select=vehicle_id,driver_id,team_ids,planned_start_time`),
      lese<any>('drivers?select=id,name,employee_id'),
      lese<any>('employees?status=eq.active&select=id,first_name,last_name,fuehrerschein_klassen'),
      lese<any>(`absences?status=eq.approved&start_date=lte.${p.datum}&end_date=gte.${p.datum}&select=employee_id`),
      lese<any>('project_assignments?select=employee_id,project_id'),
    ]);
    const beginne = await lese<any>('projects?select=id,beginn:data->step1->>projektbeginn');

    // Wer ist an dem Tag schon gebunden? (Touren als Fahrer/Team + Baustellen-Zuteilung mit gleichem Beginn)
    const driverZuMa = new Map<string, string>(drivers.filter((d: any) => d.employee_id).map((d: any) => [d.id, d.employee_id]));
    // Belegung am Tag: wann ist welches Fahrzeug / welcher Mitarbeiter durch bestehende Touren wieder frei?
    const zeit: ZeitPlanung = { fahrzeugFreiAb: new Map(), maFreiAb: new Map() };
    const merke = (m: Map<string, number>, id: string, bis: number) => m.set(id, Math.max(m.get(id) ?? 0, bis));
    for (const t of touren) {
      const bis = uhrzeitZuMinuten(t.planned_start_time) + FAHRT_DAUER_MIN;
      if (t.vehicle_id) merke(zeit.fahrzeugFreiAb, t.vehicle_id, bis);
      for (const did of [t.driver_id, ...(Array.isArray(t.team_ids) ? t.team_ids : [])]) {
        const ma = did && driverZuMa.get(did);
        if (ma) merke(zeit.maFreiAb, ma, bis);
      }
    }
    // Baustellen-Zuteilung mit gleichem Beginn: ganztägig gebunden
    const ganztagBelegteMa = new Set<string>();
    const beginnNachProjekt = new Map<string, string>(beginne.map((b: any) => [b.id, b.beginn]));
    for (const z of zuweisungen) {
      if (beginnNachProjekt.get(z.project_id) === p.datum) ganztagBelegteMa.add(z.employee_id);
    }
    const abwesendIds = new Set<string>(abwesend.map((a: any) => a.employee_id));

    // Fahrten: passt alles auf ein Fahrzeug → eine Fahrt, sonst auf mehrere aufteilen
    if (p.positionen.length !== p.transportOrderIds.length) {
      return { hinweis: 'Interner Hinweis: Positionen und Transportaufträge passen nicht zusammen – Fahrt nicht automatisch angelegt.' };
    }
    const maxNutzlast = Math.max(0, ...fahrzeuge.map((f) => Number(f.capacity_kg) || 0));
    let fahrten: { id: string; gewicht: number }[][] = [
      p.transportOrderIds.map((id, i) => ({ id, gewicht: (Number(p.positionen[i].quantity) || 0) * (preise[p.positionen[i].sku]?.weightKg ?? 0) })),
    ];
    if (gewicht > 0 && maxNutzlast > 0 && gewicht > maxNutzlast) {
      const geteilt = teileInFahrten(fahrten[0], maxNutzlast);
      if ('hinweis' in geteilt) return { hinweis: geteilt.hinweis, gewichtKg: gewicht, datum: p.datum };
      fahrten = geteilt.fahrten;
    }

    // Erst alles planen (Fahrzeug + Fahrer je Fahrt), dann anlegen – nichts halb.
    const kandidaten: FahrerKandidat[] = mitarbeiter.map((e: any) => ({
      employee_id: e.id,
      name: `${e.first_name} ${e.last_name}`.trim(),
      klassen: Array.isArray(e.fuehrerschein_klassen) ? e.fuehrerschein_klassen : [],
    }));
    const plan: { items: { id: string; gewicht: number }[]; gewicht: number; fz: FahrzeugKurz; fa: FahrerKandidat; startMin: number }[] = [];
    for (let i = 0; i < fahrten.length; i++) {
      const items = fahrten[i];
      const w = Math.round(items.reduce((s, x) => s + x.gewicht, 0) * 100) / 100;
      const vor = fahrten.length > 1 ? `Fahrt ${i + 1} von ${fahrten.length}: ` : '';
      const wahl = planeFahrtZeit({ fahrzeuge, kandidaten, abwesendIds, ganztagBelegteMa, zeit, gewicht: w });
      if ('hinweis' in wahl) return { hinweis: vor + wahl.hinweis, gewichtKg: gewicht, datum: p.datum };
      plan.push({ items, gewicht: w, fz: wahl.fahrzeug, fa: wahl.fahrer, startMin: wahl.startMin });
    }

    const angelegt: { tourId: string; name: string; fz: string; fa: string }[] = [];
    for (let i = 0; i < plan.length; i++) {
      const t = plan[i];
      const tourName = plan.length > 1 ? `Anlieferung ${p.projektName} (Fahrt ${i + 1}/${plan.length})` : `Anlieferung ${p.projektName}`;

      // Fahrer-Datensatz (drivers) holen oder anlegen – wie POST /api/tours
      let driverId = drivers.find((d: any) => d.employee_id === t.fa.employee_id)?.id as string | undefined;
      if (!driverId) {
        const r = await fetch(`${url}/rest/v1/drivers`, {
          method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ name: t.fa.name, employee_id: t.fa.employee_id }),
        });
        if (!r.ok) throw new Error('Fahrer-Datensatz konnte nicht angelegt werden (' + r.status + ')');
        driverId = (await r.json())?.[0]?.id;
        if (!driverId) throw new Error('Fahrer-Datensatz ohne ID');
        drivers.push({ id: driverId, name: t.fa.name, employee_id: t.fa.employee_id });
      }

      const tRes = await fetch(`${url}/rest/v1/tours`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          name: tourName,
          vehicle_id: t.fz.id,
          driver_id: driverId,
          team_ids: [driverId],
          planned_date: p.datum,
          planned_start_time: minutenZuUhrzeit(t.startMin),
          status: 'planned',
          total_weight_kg: Math.round(t.gewicht),
        }),
      });
      if (!tRes.ok) throw new Error('Tour konnte nicht angelegt werden (' + tRes.status + ')');
      const tour = (await tRes.json())?.[0];
      if (!tour?.id) throw new Error('Tour ohne ID');

      const stopps = t.items.map((x, j) => ({
        tour_id: tour.id, transport_order_id: x.id, stop_order: j + 1,
        address: p.adresse || 'Unbekannt', status: 'pending',
      }));
      const sRes = await fetch(`${url}/rest/v1/tour_stops`, { method: 'POST', headers, body: JSON.stringify(stopps) });
      if (!sRes.ok) {
        // Halb angelegte Tour nicht stehen lassen: stornieren (nichts löschen)
        await fetch(`${url}/rest/v1/tours?id=eq.${tour.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'cancelled' }) });
        throw new Error('Tour-Stopps konnten nicht angelegt werden (' + sRes.status + ')');
      }

      for (const x of t.items) {
        await fetch(`${url}/rest/v1/transport_orders?id=eq.${x.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'in_transit' }) });
      }
      angelegt.push({ tourId: tour.id, name: tourName, fz: t.fz.name, fa: t.fa.name });
    }

    return {
      tourId: angelegt[0].tourId,
      tourName: angelegt.length > 1 ? `Anlieferung ${p.projektName} (${angelegt.length} Fahrten)` : angelegt[0].name,
      datum: p.datum, gewichtKg: gewicht,
      fahrzeug: Array.from(new Set(angelegt.map((x) => x.fz))).join(' + '),
      fahrer: Array.from(new Set(angelegt.map((x) => x.fa))).join(' + '),
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

// ------------------------------------------------------------
// Alle Projekte mit offenen Transportaufträgen (noch in keiner Tour)
// automatisch einplanen. Wird beim Öffnen von "Touren" aufgerufen –
// die Dispo muss nichts anklicken. Reihenfolge: frühester Projektbeginn
// zuerst, damit knappe Fahrzeuge/Fahrer dort landen, wo es zuerst brennt.
// Idempotent: Aufträge, die schon in einer Tour sind, werden nicht angefasst.
// ------------------------------------------------------------
export interface OffeneFahrt { projektId: string; projekt: string; beginn: string | null; hinweis: string }

export async function offeneFahrtenPruefen(): Promise<{ angelegt: number; offen: OffeneFahrt[] }> {
  const tRes = await fetch(`${url}/rest/v1/transport_orders?status=eq.pending&to_project_id=not.is.null&select=to_project_id`, { headers, cache: 'no-store' });
  if (!tRes.ok) throw new Error('Transportaufträge nicht lesbar (' + tRes.status + ')');
  const ids = Array.from(new Set<string>((await tRes.json()).map((r: any) => r.to_project_id)));
  if (ids.length === 0) return { angelegt: 0, offen: [] };

  const pRes = await fetch(
    `${url}/rest/v1/projects?id=in.(${ids.join(',')})&select=id,name,status,beginn:data->step1->>projektbeginn`,
    { headers, cache: 'no-store' }
  );
  if (!pRes.ok) throw new Error('Projekte nicht lesbar (' + pRes.status + ')');
  const projekte: any[] = (await pRes.json()).filter((x: any) => x.status !== 'completed');
  projekte.sort((a, b) => String(a.beginn || '9999').localeCompare(String(b.beginn || '9999')));

  let angelegt = 0;
  const offen: OffeneFahrt[] = [];
  for (const pr of projekte) {
    try {
      const r = await fahrtNachholen(pr.id);
      if (r.ok) angelegt++;
      else if (r.tour?.hinweis) offen.push({ projektId: pr.id, projekt: pr.name, beginn: pr.beginn || null, hinweis: r.tour.hinweis });
    } catch (e: any) {
      offen.push({ projektId: pr.id, projekt: pr.name, beginn: pr.beginn || null, hinweis: String(e?.message || e) });
    }
  }
  return { angelegt, offen };
}
