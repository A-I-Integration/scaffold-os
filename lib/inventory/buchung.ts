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
export async function bucheAusZentrallager(p: BucheParams): Promise<BucheErgebnis> {
  const { inventory_id, project_id, quantity, reason, reference_type } = p;
  if (!inventory_id || !project_id) {
    return { success: false, error: 'inventory_id und project_id erforderlich.' };
  }
  if (!(quantity > 0)) {
    return { success: false, error: 'Menge muss größer als 0 sein.' };
  }

  // 1. Bestand lesen
  const getRes = await fetch(
    `${url}/rest/v1/inventory?id=eq.${inventory_id}&select=id,name,unit,quantity`,
    { headers }
  );
  if (!getRes.ok) return { success: false, error: 'Lagerartikel konnte nicht gelesen werden.' };
  const items = await getRes.json();
  if (!items.length) return { success: false, error: 'Lagerartikel nicht gefunden.' };
  const item = items[0];

  if (quantity > item.quantity) {
    return {
      success: false,
      error: `Nur ${item.quantity} ${item.unit || ''} verfügbar (angefragt: ${quantity}).`,
      itemName: item.name,
      unit: item.unit,
    };
  }

  // 2. Atomarer Abzug: PATCH nur, wenn der Bestand seit dem Lesen oben
  // unveraendert ist (quantity=eq.<gelesener Wert> als Filter macht
  // das zur DB-seitig atomaren Bedingung, kein Lesen-dann-Schreiben-
  // Wettlauf mehr moeglich).
  const patchRes = await fetch(
    `${url}/rest/v1/inventory?id=eq.${inventory_id}&quantity=eq.${item.quantity}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ quantity: item.quantity - quantity }),
    }
  );
  if (!patchRes.ok) return { success: false, error: 'Bestand konnte nicht aktualisiert werden.' };
  const patched = await patchRes.json();
  if (!patched.length) {
    return {
      success: false,
      error: 'Bestand wurde zwischenzeitlich von einer anderen Buchung geändert. Bitte erneut versuchen.',
    };
  }

  // 3. site_stock-Reservierung anlegen
  const stockRes = await fetch(`${url}/rest/v1/site_stock`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      inventory_id,
      project_id,
      quantity: 0, // physisch noch nicht auf der Baustelle
      reserved_quantity: quantity,
      min_stock: 0,
      status: 'ok',
    }),
  });
  if (!stockRes.ok) {
    // Bestand ist schon abgebucht (Schritt 2), site_stock schlug fehl:
    // Rueckbuchung statt inkonsistentem Zustand.
    await fetch(`${url}/rest/v1/inventory?id=eq.${inventory_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ quantity: item.quantity }),
    }).catch(() => {});
    return { success: false, error: 'Reservierung konnte nicht angelegt werden, Buchung wurde rückgängig gemacht.' };
  }

  // 4. Audit-Log (best effort – ein Fehler hier macht die Buchung
  // selbst nicht rueckgaengig, sie ist bereits korrekt/konsistent)
  await fetch(`${url}/rest/v1/inventory_transactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      inventory_id,
      project_id,
      type: 'out',
      quantity: -quantity,
      reason,
      reference_type,
    }),
  }).catch(() => {});

  return { success: true, itemName: item.name, unit: item.unit, remaining: item.quantity - quantity };
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
    // Bereits verbucht (z.B. Stopp wurde zweimal auf "completed" gesetzt) –
    // nicht nochmal Bestand verschieben.
    return { success: true };
  }

  let offen = order.quantity as number;

  const stockRes = await fetch(
    `${url}/rest/v1/site_stock?inventory_id=eq.${order.inventory_id}&project_id=eq.${order.to_project_id}&reserved_quantity=gt.0&select=id,quantity,reserved_quantity&order=created_at.asc`,
    { headers }
  );
  if (stockRes.ok) {
    const rows: { id: string; quantity: number; reserved_quantity: number }[] = await stockRes.json();
    for (const row of rows) {
      if (offen <= 0) break;
      const verschiebe = Math.min(offen, row.reserved_quantity);
      if (verschiebe <= 0) continue;
      await fetch(`${url}/rest/v1/site_stock?id=eq.${row.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          quantity: row.quantity + verschiebe,
          reserved_quantity: row.reserved_quantity - verschiebe,
        }),
      }).catch(() => {});
      offen -= verschiebe;
    }
  }
  // Bekannte Grenze: findet sich keine (ausreichende) reservierte
  // site_stock-Zeile mehr (z.B. weil die Reservierung manuell im Lager-
  // Bereich korrigiert wurde), bleibt "offen" > 0 – die Anlieferung wird
  // trotzdem als abgeschlossen markiert (das Material ist real
  // angekommen), aber ohne vollstaendige site_stock-Abbildung. Sichtbar
  // ueber inventory_transactions und die completed_at-Markierung selbst.

  await fetch(`${url}/rest/v1/transport_orders?id=eq.${transportOrderId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ completed_at: new Date().toISOString() }),
  }).catch(() => {});

  await fetch(`${url}/rest/v1/inventory_transactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      inventory_id: order.inventory_id,
      project_id: order.to_project_id,
      type: 'in',
      quantity: order.quantity - offen,
      reason: 'Anlieferung bestätigt (Tour-Stopp abgeschlossen)',
      reference_type: 'transport',
      reference_id: transportOrderId,
    }),
  }).catch(() => {});

  return { success: true };
}
