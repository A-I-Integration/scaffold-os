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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

interface MaterialZeile { name: string; quantity: number; unit?: string }

export interface AngebotsannahmeErgebnis {
  reserviert: string[];
  transportAngelegt: string[];
  nichtGefunden: string[];
  nichtGenugBestand: string[];
}

export async function beiAngebotsannahme(projectId: string): Promise<AngebotsannahmeErgebnis> {
  const ergebnis: AngebotsannahmeErgebnis = { reserviert: [], transportAngelegt: [], nichtGefunden: [], nichtGenugBestand: [] };

  const pRes = await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers });
  if (!pRes.ok) return ergebnis;
  const pRows = await pRes.json();
  const materialList: MaterialZeile[] = pRows?.[0]?.data?.kiResult?.materialList || [];
  if (materialList.length === 0) return ergebnis;

  const invRes = await fetch(`${url}/rest/v1/inventory?select=id,name,quantity,unit&is_active=eq.true`, { headers });
  if (!invRes.ok) return ergebnis;
  const lagerArtikel: { id: string; name: string; quantity: number; unit: string }[] = await invRes.json();
  const lagerNachName = new Map(lagerArtikel.map((a) => [a.name.trim().toLowerCase(), a]));

  for (const zeile of materialList) {
    const treffer = lagerNachName.get((zeile.name || '').trim().toLowerCase());
    if (!treffer) {
      ergebnis.nichtGefunden.push(zeile.name);
      continue;
    }
    if (treffer.quantity < zeile.quantity) {
      ergebnis.nichtGenugBestand.push(`${zeile.name} (${zeile.quantity} benötigt, ${treffer.quantity} verfügbar)`);
      continue;
    }

    // Bestand abbuchen (gleiche Logik wie /api/inventory/reserve)
    const patchRes = await fetch(`${url}/rest/v1/inventory?id=eq.${treffer.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ quantity: treffer.quantity - zeile.quantity }),
    });
    if (!patchRes.ok) { ergebnis.nichtGefunden.push(`${zeile.name} (Fehler beim Abbuchen)`); continue; }
    // Bestand im lokalen Cache auch anpassen, falls derselbe Artikel mehrfach
    // in der Materialliste vorkommt (mehrere Zeilen, gleicher Lagerartikel).
    treffer.quantity -= zeile.quantity;

    await fetch(`${url}/rest/v1/site_stock`, {
      method: 'POST', headers,
      body: JSON.stringify({ inventory_id: treffer.id, project_id: projectId, quantity: 0, reserved_quantity: zeile.quantity, min_stock: 0, status: 'ok' }),
    }).catch(() => {});
    await fetch(`${url}/rest/v1/inventory_transactions`, {
      method: 'POST', headers,
      body: JSON.stringify({ inventory_id: treffer.id, project_id: projectId, type: 'out', quantity: -zeile.quantity, reason: 'Automatisch bei Angebots-Annahme reserviert', reference_type: 'reservation' }),
    }).catch(() => {});
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
  await fetch(`${url}/rest/v1/projects?id=eq.${projectId}&select=data`, { headers })
    .then((r) => r.json())
    .then(async (rows) => {
      const bisher = rows?.[0]?.data || {};
      await fetch(`${url}/rest/v1/projects?id=eq.${projectId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ data: { ...bisher, lagerAutomatikErgebnis: ergebnis } }),
      });
    })
    .catch(() => {});

  return ergebnis;
}
