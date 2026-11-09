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
import { baueLagerIndex, findeLagerartikel, einheitenPassen, type LagerArtikelKurz } from '@/lib/lager-zuordnung';
import { legeAutoTourAn, type AutoTourErgebnis } from '@/lib/auto-tour';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

interface MaterialZeile { name: string; quantity: number; unit?: string; articleNumber?: string | null; category?: string | null }

/** Frei eingetragene Leistung (Sonderteil, z. B. aus dem Leistungskatalog): kein Lagerartikel, wird nicht gebucht. */
export const istLeistungsZeile = (z: { category?: string | null; articleNumber?: string | null }) => z.category === 'Sonderteil' || z.articleNumber === 'SONDER';

export interface AngebotsannahmeErgebnis {
  reserviert: string[];
  transportAngelegt: string[];
  nichtGefunden: string[];
  nichtGenugBestand: string[];
  /** Material und Lagerartikel gefunden, aber Einheiten verschieden (z. B. m² gegen Stück): nichts gebucht. */
  einheitenKonflikt: string[];
  /** Material ist reserviert, aber der Transportauftrag konnte nicht angelegt werden (Fehlertext je Zeile). */
  transportFehler?: string[];
  /** Leistungen/Sonderteile im Angebot: bewusst nicht ans Lager gebucht (keine Meldung „nicht gefunden“). */
  leistungen?: string[];
  /** Technischer Fehler beim Lauf (sonst nicht sichtbar). */
  fehler?: string;
  /** Hinweis, warum nichts gebucht wurde (z. B. keine Materialliste). */
  hinweis?: string;
  /** Automatisch angelegte Fahrt (oder Hinweis, warum keine). */
  tour?: AutoTourErgebnis;
}

export async function beiAngebotsannahme(projectId: string): Promise<AngebotsannahmeErgebnis> {
  const ergebnis: AngebotsannahmeErgebnis = { reserviert: [], transportAngelegt: [], nichtGefunden: [], nichtGenugBestand: [], einheitenKonflikt: [] };

  const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=name,adresse,data`, { headers });
  if (!pRes.ok) throw new Error('Projekt konnte nicht gelesen werden (' + pRes.status + ').');
  const pRows = await pRes.json();
  const projekt = pRows?.[0];
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

  const transportIds: string[] = [];
  const positionen: { sku: string; quantity: number }[] = [];

  // Erst zuordnen und je Lagerartikel zusammenzählen (derselbe Artikel kann mehrfach in der Materialliste stehen),
  // dann je Artikel EINMAL buchen.
  const bedarf = new Map<string, { treffer: LagerArtikelKurz; menge: number; namen: string[] }>();
  for (const zeile of materialList) {
    if (istLeistungsZeile(zeile)) { (ergebnis.leistungen ??= []).push(zeile.name); continue; }
    const { artikel: treffer } = findeLagerartikel(zeile, lagerIndex);
    if (!treffer) {
      ergebnis.nichtGefunden.push(zeile.name);
      continue;
    }
    if (!einheitenPassen(zeile.unit, treffer.unit)) {
      ergebnis.einheitenKonflikt.push(`${zeile.name}: Materialliste ${zeile.quantity} ${zeile.unit}, Lager führt in ${treffer.unit}`);
      continue;
    }
    const b = bedarf.get(treffer.id) ?? { treffer, menge: 0, namen: [] };
    b.menge += Number(zeile.quantity) || 0;
    b.namen.push(zeile.name);
    bedarf.set(treffer.id, b);
  }

  for (const { treffer, menge, namen } of bedarf.values()) {
    const bezeichnung = namen.length > 1 ? `${namen[0]} (+${namen.length - 1} weitere Zeile${namen.length > 2 ? 'n' : ''})` : namen[0];

    // Schon früher für dieses Projekt über die Annahme reserviert (z. B. Angebot nach einer Korrektur erneut angenommen,
    // oder zwei Annahmen kurz hintereinander)? Dann nur die FEHLENDE Menge buchen, sonst würde der Bestand doppelt abgebucht.
    const bereits = await schonReserviert(projectId, treffer.id);
    if (bereits === null) {
      ergebnis.nichtGenugBestand.push(`${bezeichnung}: Bisherige Reservierung konnte nicht gelesen werden, es wurde nichts gebucht.`);
      continue;
    }
    const fehlt = menge - bereits;
    if (fehlt <= 0) {
      ergebnis.reserviert.push(`${bezeichnung} (bereits reserviert)`);
      continue;
    }

    // Zentrale Buchungsfunktion (lib/inventory/buchung.ts) – prüft Bestand, bucht atomar ab, legt die Reservierung an
    // und loggt in inventory_transactions. Liest den Bestand bei jedem Aufruf frisch aus der DB.
    const buchung = await bucheAusZentrallager({
      inventory_id: treffer.id,
      project_id: projectId,
      quantity: fehlt,
      reason: 'Automatisch bei Angebots-Annahme reserviert',
      reference_type: 'angebot_annahme',
    });
    if (!buchung.success) {
      ergebnis.nichtGenugBestand.push(`${bezeichnung}: ${buchung.error}`);
      continue;
    }
    ergebnis.reserviert.push(bezeichnung);

    // Transportauftrag anlegen (gleiche Logik wie /api/transport-orders POST).
    // Schlägt das fehl, ist das Material schon reserviert: Das muss sichtbar werden (transportFehler),
    // damit keine Position reserviert ist, aber ohne Transportauftrag und ohne Tour bleibt.
    try {
      const transRes = await fetch(`${url}/rest/v1/transport_orders`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ inventory_id: treffer.id, quantity: fehlt, to_project_id: projectId, status: 'pending' }),
      });
      if (transRes.ok) {
        ergebnis.transportAngelegt.push(bezeichnung);
        const neu = (await transRes.json().catch(() => null))?.[0];
        if (neu?.id) { transportIds.push(neu.id); positionen.push({ sku: treffer.sku || '', quantity: fehlt }); }
      } else {
        (ergebnis.transportFehler ??= []).push(`${bezeichnung}: Transportauftrag nicht angelegt (Status ${transRes.status})`);
      }
    } catch (e: unknown) {
      (ergebnis.transportFehler ??= []).push(`${bezeichnung}: Transportauftrag nicht angelegt (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  // Fahrt automatisch anlegen (Fahrzeug nach Gewicht, Fahrer = freier Mitarbeiter)
  ergebnis.tour = await legeAutoTourAn({
    projektName: projekt?.name || 'Projekt',
    adresse: projekt?.adresse ?? null,
    datum: projekt?.data?.step1?.projektbeginn,
    transportOrderIds: transportIds,
    positionen,
  });

  // Ergebnis am Projekt vermerken – sichtbar in Kunden-Detail, damit nicht
  // gefundene/nicht ausreichende Positionen nicht stillschweigend untergehen.
  await speichereErgebnis(projectId, ergebnis);

  return ergebnis;
}

/** Menge, die für dieses Projekt und diesen Artikel schon über die Angebots-Annahme reserviert wurde (null = nicht lesbar). */
async function schonReserviert(projectId: string, inventoryId: string): Promise<number | null> {
  const r = await fetch(`${url}/rest/v1/inventory_transactions?project_id=eq.${projectId}&inventory_id=eq.${inventoryId}&reference_type=eq.angebot_annahme&type=eq.out&select=quantity`, { headers });
  if (!r.ok) return null;
  const rows: { quantity: number }[] = await r.json();
  return rows.reduce((summe, z) => summe + Math.abs(Number(z.quantity) || 0), 0);
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
      reserviert: [], transportAngelegt: [], nichtGefunden: [], nichtGenugBestand: [], einheitenKonflikt: [],
      fehler: String(e?.message || e),
    });
  }
}
