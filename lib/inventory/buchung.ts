// ============================================================
// lib/inventory/buchung.ts
// SCAFFOLD OS – Zentrale Lagerbuchungs-Funktion
// ============================================================
// Vorher war "Material aus dem Zentrallager auf ein Projekt buchen"
// an 3 Stellen separat implementiert, mit unterschiedlichem, nicht
// abgeglichenem Verhalten:
//   - /api/inventory/reserve      (manueller "Reservieren"-Button)
//   - /api/transport-orders POST  (Transportauftrag anlegen)
//   - lib/angebot-annahme.ts      (automatisch bei Angebots-Annahme)
//
// transport-orders schrieb dabei z.B. weder site_stock noch
// inventory_transactions – Buchungen über diesen Weg waren im Lager-
// Bestand und in Reports unsichtbar. Alle drei lasen außerdem erst
// den Bestand und schrieben dann blind den neuen Wert zurück (Race
// Condition bei gleichzeitigen Buchungen).
//
// Diese eine Funktion wird jetzt von allen drei Stellen genutzt.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

export interface BucheParams {
  inventory_id: string;
  project_id: string;
  quantity: number;
  reason: string;
  reference_type: 'reservation' | 'transport' | 'angebot_annahme';
}

export interface BucheErgebnis {
  success: boolean;
  error?: string;
  itemName?: string;
  unit?: string;
  remaining?: number;
}

/**
 * Bucht `quantity` eines Lagerartikels aus dem Zentrallager auf ein
 * Projekt:
 *  1. Bestand pruefen
 *  2. Bestand ATOMAR verringern (optimistic lock: PATCH nur, wenn
 *     quantity seit dem Lesen unveraendert ist - schlaegt bei einer
 *     zwischenzeitlichen, gleichzeitigen Buchung sauber fehl statt sie
 *     stillschweigend zu ueberschreiben)
 *  3. site_stock-Reservierung anlegen (reserved_quantity, physisch
 *     noch nicht da - quantity bleibt 0, bis eine Tour das Material
 *     tatsaechlich anliefert)
 *  4. inventory_transactions loggen (Audit-Trail)
 *
 * Schlaegt Schritt 2 oder 3 fehl, wird nichts inkonsistent stehen
 * gelassen: bei einem site_stock-Fehler wird der Bestand aus Schritt 2
 * zurueckgebucht.
 */
// ------------------------------------------------------------
// Neues Lager (Belegprinzip, phase-108/109): gebucht wird über buche_lager() – ein Beleg, eine Transaktion,
// Zeilensperren, kein negativer Bestand. Die Altfelder inventory.quantity / site_stock führt die Datenbank selbst nach.
// ------------------------------------------------------------

const LAGER_TYPEN = ['standort', 'lagerbereich', 'lagerplatz'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rpc(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; daten?: unknown; meldung: string }> {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const text = await res.text();
  if (res.ok) { try { return { ok: true, daten: JSON.parse(text), meldung: '' }; } catch { return { ok: true, daten: text, meldung: '' }; } }
  let meldung = text;
  try { meldung = JSON.parse(text).message || text; } catch { /* kein JSON */ }
  return { ok: false, meldung };
}

/** Freier Bestand eines Artikels in allen Lagern (Standort/Bereich/Platz), größte Mengen zuerst. */
async function freierLagerbestand(inventory_id: string): Promise<{ lagerort_id: string; menge: number }[] | null> {
  const [orteRes, bestRes] = await Promise.all([
    fetch(`${url}/rest/v1/lagerorte?aktiv=eq.true&select=id,typ`, { headers }),
    fetch(`${url}/rest/v1/bestand?inventory_id=eq.${inventory_id}&zustand=eq.frei&menge=gt.0&select=lagerort_id,menge`, { headers }),
  ]);
  if (!orteRes.ok || !bestRes.ok) return null;
  const lager = new Set((await orteRes.json() as { id: string; typ: string }[]).filter((o) => LAGER_TYPEN.includes(o.typ)).map((o) => o.id));
  const zeilen = (await bestRes.json() as { lagerort_id: string; menge: number }[]).filter((z) => lager.has(z.lagerort_id));
  return zeilen.sort((a, b) => b.menge - a.menge);
}

/**
 * Bucht `quantity` eines Lagerartikels aus dem Lager auf ein Projekt (Bewegungsart AU, "Ausgabe/Zuteilung"):
 * Lager/frei → Lagerort der Baustelle/reserviert (physisch noch nicht da, bis eine Tour anliefert).
 * Reicht der Bestand nicht, wird nichts gebucht. Reicht er in einem Lagerort nicht, wird auf mehrere Orte verteilt.
 */
export async function bucheAusZentrallager(p: BucheParams): Promise<BucheErgebnis> {
  const { inventory_id, project_id, quantity, reason, reference_type } = p;
  if (!inventory_id || !project_id) {
    return { success: false, error: 'inventory_id und project_id erforderlich.' };
  }
  if (!(quantity > 0) || !Number.isInteger(quantity)) {
    return { success: false, error: 'Menge muss eine ganze Zahl größer als 0 sein.' };
  }

  const getRes = await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}&select=id,name,unit,quantity`, { headers });
  if (!getRes.ok) return { success: false, error: 'Lagerartikel konnte nicht gelesen werden.' };
  const items = await getRes.json();
  if (!items.length) return { success: false, error: 'Lagerartikel nicht gefunden.' };
  const item = items[0];

  const quellen = await freierLagerbestand(inventory_id);
  if (!quellen) return { success: false, error: 'Lagerbestand konnte nicht gelesen werden.' };
  const verfuegbar = quellen.reduce((s, z) => s + z.menge, 0);
  if (quantity > verfuegbar) {
    return { success: false, error: `Nur ${verfuegbar} ${item.unit || ''} verfügbar (angefragt: ${quantity}).`, itemName: item.name, unit: item.unit };
  }

  const ziel = await rpc('lagerort_fuer_projekt', { p_project: project_id });
  if (!ziel.ok || typeof ziel.daten !== 'string') return { success: false, error: 'Lagerort der Baustelle konnte nicht bestimmt werden.' };

  let rest = quantity;
  const positionen: Record<string, unknown>[] = [];
  for (const q of quellen) {
    if (rest <= 0) break;
    const nimm = Math.min(rest, q.menge);
    positionen.push({ inventory_id, menge: nimm, von_lagerort: q.lagerort_id, von_zustand: 'frei', nach_lagerort: ziel.daten, nach_zustand: 'reserviert' });
    rest -= nimm;
  }

  const gebucht = await rpc('buche_lager', {
    p_bewegungsart: 'AU', p_positionen: positionen, p_project: project_id, p_bemerkung: reason, p_referenz_typ: reference_type,
  });
  if (!gebucht.ok) {
    if (/Nicht genug Bestand/.test(gebucht.meldung)) {
      return { success: false, error: 'Bestand wurde zwischenzeitlich von einer anderen Buchung geändert. Bitte erneut versuchen.' };
    }
    return { success: false, error: 'Bestand konnte nicht gebucht werden.' };
  }

  // Altes Protokoll (Berichte lesen es noch) – best effort, der Beleg ist die maßgebliche Buchung
  await fetch(`${url}/rest/v1/inventory_transactions`, {
    method: 'POST', headers,
    body: JSON.stringify({ inventory_id, project_id, type: 'out', quantity: -quantity, reason, reference_type }),
  }).catch(() => {});

  return { success: true, itemName: item.name, unit: item.unit, remaining: verfuegbar - quantity };
}

/**
 * Bestätigt die physische Anlieferung eines Transportauftrags: verschiebt
 * die entsprechende Menge in site_stock von "reserviert" nach "physisch
 * da" und setzt completed_at auf dem Transportauftrag.
 *
 * VORHER GEFEHLT: Wenn ein Fahrer einen Tour-Stopp als "completed"
 * markierte, wurde der Transportauftrag zwar auf status='delivered'
 * gesetzt, aber site_stock.quantity (physisch vorhanden) blieb bei 0 –
 * nur reserved_quantity war je gesetzt. Baustellen zeigten dadurch
 * dauerhaft "physisch 0, reserviert N", obwohl das Material laengst
 * angekommen war (siehe supabase/diagnose-lager-konsistenz.sql, CHECK 2
 * und CHECK 4).
 *
 * transport_orders hat keine direkte Referenz auf eine einzelne
 * site_stock-Zeile (jede Buchung legt eine neue Zeile an, statt eine
 * bestehende zu mergen). Deshalb wird hier über alle site_stock-Zeilen
 * für (inventory_id, project_id) mit reserved_quantity > 0 gegangen und
 * die benoetigte Menge nacheinander verschoben, bis sie gedeckt ist.
 */
export async function bestaetigeAnlieferung(transportOrderId: string): Promise<BucheErgebnis> {
  const toRes = await fetch(
    `${url}/rest/v1/transport_orders?id=eq.${transportOrderId}&select=id,inventory_id,to_project_id,quantity,completed_at`,
    { headers }
  );
  if (!toRes.ok) return { success: false, error: 'Transportauftrag konnte nicht gelesen werden.' };
  const orders = await toRes.json();
  if (!orders.length) return { success: false, error: 'Transportauftrag nicht gefunden.' };
  const order = orders[0];

  if (order.completed_at) {
    // Bereits verbucht (z.B. Stopp wurde zweimal auf "completed" gesetzt) – nicht nochmal Bestand verschieben.
    return { success: true };
  }

  // Bewegungsart AN: auf der Baustelle reserviert → frei (physisch da). Gebucht wird höchstens, was dort reserviert ist;
  // fehlt eine Reservierung (z.B. von Hand korrigiert), gilt die Lieferung trotzdem als erfolgt (das Material ist real angekommen).
  let gebucht = 0;
  const ort = await rpc('lagerort_fuer_projekt', { p_project: order.to_project_id });
  if (ort.ok && typeof ort.daten === 'string') {
    const bRes = await fetch(
      `${url}/rest/v1/bestand?inventory_id=eq.${order.inventory_id}&lagerort_id=eq.${ort.daten}&zustand=eq.reserviert&select=menge`,
      { headers }
    );
    const reserviert = bRes.ok ? ((await bRes.json()) as { menge: number }[]).reduce((s, z) => s + z.menge, 0) : 0;
    const menge = Math.min(order.quantity as number, reserviert);
    if (menge > 0) {
      const r = await rpc('buche_lager', {
        p_bewegungsart: 'AN',
        p_positionen: [{ inventory_id: order.inventory_id, menge, von_lagerort: ort.daten, von_zustand: 'reserviert', nach_lagerort: ort.daten, nach_zustand: 'frei' }],
        p_project: order.to_project_id,
        p_bemerkung: 'Anlieferung bestätigt (Tour-Stopp abgeschlossen)',
        p_referenz_typ: 'transport_order',
        p_referenz_id: UUID.test(transportOrderId) ? transportOrderId : null,
      });
      if (!r.ok) return { success: false, error: 'Anlieferung konnte nicht gebucht werden.' };
      gebucht = menge;
    }
  }

  await fetch(`${url}/rest/v1/transport_orders?id=eq.${transportOrderId}`, {
    method: 'PATCH', headers, body: JSON.stringify({ completed_at: new Date().toISOString() }),
  }).catch(() => {});

  await fetch(`${url}/rest/v1/inventory_transactions`, {
    method: 'POST', headers,
    body: JSON.stringify({
      inventory_id: order.inventory_id, project_id: order.to_project_id, type: 'in', quantity: gebucht,
      reason: 'Anlieferung bestätigt (Tour-Stopp abgeschlossen)', reference_type: 'transport', reference_id: transportOrderId,
    }),
  }).catch(() => {});

  return { success: true };
}
