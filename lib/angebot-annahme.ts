// ============================================================
// SCAFFOLD OS – Automatik bei Angebots-Annahme (Phase 62)
//
// Schließt die von Michelle beschriebene Lücke: Aufmaß → Kunde →
// Angebot → Rechnung war bereits verbunden, aber Aufmaß → Lager →
// Tour lief bisher NIE automatisch, sondern nur über manuelle
// Buttons (Material reservieren / Transportauftrag anlegen).
//
// Bewusst erst bei ANNAHME des Angebots ausgelöst, nicht schon beim
// Speichern/Erstellen – verhindert, dass für nicht zustande gekommene
// Aufträge Material reserviert und Touren angelegt werden (explizite
// Entscheidung von Michelle).
//
// Matching materialList ↔ Lagerartikel bewusst nur bei GENAUEM
// Namens-Treffer (case-insensitive) – kein unscharfes Raten, das zu
// falschen Abbuchungen führen könnte. Nicht gefundene Positionen
// werden klar zurückgemeldet, nicht stillschweigend übersprungen –
// die bestehenden manuellen Buttons ("Material reservieren" /
// "Transportauftrag anlegen") bleiben für diese Fälle nutzbar.
// ============================================================

import { bucheAusZentrallager } from '@/lib/inventory/buchung';
import { baueLagerIndex, findeLagerartikel, type LagerArtikelKurz } from '@/lib/lager-zuordnung';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

interface MaterialZeile { name: string; quantity: number; unit?: string; articleNumber?: string | null }

export interface AngebotsannahmeErgebnis {
  reserviert: string[];
  transportAngelegt: string[];
  nichtGefunden: string[];
  nichtGenugBestand: string[];
  /** Technischer Fehler beim Lauf (sonst nicht sichtbar). */
  fehler?: string;
  /** Hinweis, warum nichts gebucht wurde (z. B. keine Materialliste). */
  hinweis?: string;
}

export async function beiAngebotsannahme(projectId: string): Promise<AngebotsannahmeErgebnis> {
  const ergebnis: AngebotsannahmeErgebnis = { reserviert: [], transportAngelegt: [], nichtGefunden: [], nichtGenugBestand: [] };

  const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers });
  if (!pRes.ok) throw new Error('Projekt konnte nicht gelesen werden (' + pRes.status + ').');
  const pRows = await pRes.json();
  const materialList: MaterialZeile[] = pRows?.[0]?.data?.kiResult?.materialList || [];
  if (materialList.length === 0) {
    ergebnis.hinweis = 'Keine Materialliste im Projekt – nichts reserviert.';
    await speichereErgebnis(projectId, ergebnis);
    return ergebnis;
  }

  const invRes = await fetch(`${url}/rest/v1/inventory?select=id,name,sku,quantity,unit&is_active=eq.true`, { headers });
  if (!invRes.ok) throw new Error('Lagerartikel konnten nicht geladen werden (' + invRes.status + ').');
  const lagerArtikel: LagerArtikelKurz[] = await invRes.json();
  const lagerIndex = baueLagerIndex(lagerArtikel);

  for (const zeile of materialList) {
    const { artikel: treffer } = findeLagerartikel(zeile, lagerIndex);
    if (!treffer) {
      ergebnis.nichtGefunden.push(zeile.name);
      continue;
    }

    // Zentrale Buchungsfunktion (lib/inventory/buchung.ts) – prüft
    // Bestand, bucht atomar ab, legt site_stock-Reservierung an,
    // loggt in inventory_transactions. Liest den Bestand bei jedem
    // Aufruf frisch aus der DB, daher kein manuelles Nachführen eines
    // lokalen Zwischenstands mehr nötig, auch wenn derselbe Lagerartikel
    // mehrfach in der Materialliste vorkommt.
    const buchung = await bucheAusZentrallager({
      inventory_id: treffer.id,
      project_id: projectId,
      quantity: zeile.quantity,
      reason: 'Automatisch bei Angebots-Annahme reserviert',
      reference_type: 'angebot_annahme',
    });
    if (!buchung.success) {
      ergebnis.nichtGenugBestand.push(`${zeile.name}: ${buchung.error}`);
      continue;
    }
    ergebnis.reserviert.push(zeile.name);

    // Transportauftrag anlegen (gleiche Logik wie /api/transport-orders POST)
    const transRes = await fetch(`${url}/rest/v1/transport_orders`, {
      method: 'POST', headers,
      body: JSON.stringify({ inventory_id: treffer.id, quantity: zeile.quantity, to_project_id: projectId, status: 'pending' }),
    });
    if (transRes.ok) ergebnis.transportAngelegt.push(zeile.name);
  }

  // Ergebnis am Projekt vermerken – sichtbar in Kunden-Detail, damit nicht
  // gefundene/nicht ausreichende Positionen nicht stillschweigend untergehen.
  await speichereErgebnis(projectId, ergebnis);

  return ergebnis;
}

async function speichereErgebnis(projectId: string, ergebnis: AngebotsannahmeErgebnis): Promise<void> {
  try {
    const rows = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers }).then((r) => r.json());
    const bisher = rows?.[0]?.data || {};
    await fetch(`${url}/rest/v1/projects?id=eq.${projectId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ data: { ...bisher, lagerAutomatikErgebnis: ergebnis } }),
    });
  } catch { /* Ergebnis ist best-effort */ }
}

/**
 * Für die Routen: läuft nach der Antwort (after()), fängt Fehler ab und
 * vermerkt sie im Projekt (lagerAutomatikErgebnis.fehler), statt sie still zu verschlucken.
 */
export async function beiAngebotsannahmeSicher(projectId: string): Promise<void> {
  try {
    await beiAngebotsannahme(projectId);
  } catch (e: any) {
    await speichereErgebnis(projectId, {
      reserviert: [], transportAngelegt: [], nichtGefunden: [], nichtGenugBestand: [],
      fehler: String(e?.message || e),
    });
  }
}
