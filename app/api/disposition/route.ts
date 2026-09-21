// ============================================================
// app/api/disposition/route.ts
// SCAFFOLD OS – Dispositions-API (robust)
// ============================================================

import { NextResponse } from 'next/server';
import { optimizeDisposition } from '@/lib/calculations/disposition';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { distanceMatrixKm } from '@/lib/google-distance';

export async function POST(request: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const body = await request.json();
    const { materialList, targetSiteId, targetAddress } = body;

    if (!materialList || !Array.isArray(materialList) || materialList.length === 0) {
      return NextResponse.json(
        { error: 'Materialliste erforderlich' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // --- ZENTRALLAGER (robust, auch wenn Tabelle leer/falsch) ---
    // WICHTIG: Abgleich läuft über den Artikel-NAMEN (case-insensitiv,
    // exakter Treffer), nicht über eine "article_number"-Spalte – die
    // gibt es in der echten inventory-Tabelle nicht (echte Spalten:
    // sku, location_in_warehouse, name, quantity, ...). Gleiche
    // Abgleich-Logik wie in lib/angebot-annahme.ts, bewusst kein
    // unscharfes Matching.
    async function getCentralStock(materialNamen: string[]) {
      try {
        const gesuchte = new Set(materialNamen.map((n) => n.trim().toLowerCase()));
        const { data, error } = await supabase
          .from('inventory')
          .select('name, quantity, location_in_warehouse')
          .gt('quantity', 0);

        if (error || !data) {
          console.warn('[Disposition] inventory table error:', error?.message);
          return [];
        }
        return data
          .filter((item: any) => gesuchte.has((item.name || '').trim().toLowerCase()))
          .map((item: any) => ({
            articleNumber: item.name,
            quantity: item.quantity || 0,
            location: item.location_in_warehouse || 'Zentrallager',
          }));
      } catch (e) {
        console.warn('[Disposition] inventory fetch failed:', e);
        return [];
      }
    }

    // --- BAUSTELLEN-BESTAND (robust) ---
    async function getSiteStock(materialNamen: string[], excludeSiteId: string, zielAdresse: string) {
      try {
        const gesuchte = new Set(materialNamen.map((n) => n.trim().toLowerCase()));

        // site_stock hat keine article_number-Spalte, sondern verweist
        // per inventory_id auf inventory und per project_id auf projects
        // (frühere Annahme "site_id" existiert dort nicht).
        const { data, error } = await supabase
          .from('site_stock')
          .select('project_id, quantity, inventory:inventory_id (name)')
          .gt('quantity', 0)
          .neq('project_id', excludeSiteId);

        if (error || !data || data.length === 0) {
          console.warn('[Disposition] site_stock empty or missing:', error?.message);
          return [];
        }

        const gefiltert = data.filter((d: any) => {
          const name = d.inventory?.name || '';
          return gesuchte.has(name.trim().toLowerCase());
        });
        if (gefiltert.length === 0) return [];

        // Baustellen-Namen holen
        const siteIds = [...new Set(gefiltert.map((d: any) => d.project_id))];
        const { data: sites } = await supabase
          .from('projects')
          .select('id, name, adresse')
          .in('id', siteIds);

        const siteMap = new Map(sites?.map((s: any) => [s.id, s]) || []);

        // Echte Fahrstrecke je Baustellen-Adresse zur Ziel-Adresse (ein
        // API-Call für alle Adressen auf einmal). Ohne Ziel-Adresse oder
        // ohne auflösbare Baustellen-Adresse bleibt distanceKm `null` -
        // KEINE erfundene Zahl mehr (siehe lib/google-distance.ts).
        const adressen = [...new Set(
          [...siteMap.values()].map((s: any) => s.adresse).filter((a: string) => a && a.trim())
        )] as string[];
        const distanzen = zielAdresse
          ? await distanceMatrixKm(adressen, zielAdresse)
          : new Map<string, number | null>();

        return gefiltert.map((item: any) => {
          const site = siteMap.get(item.project_id);
          const adresse = site?.adresse || '';
          return {
            siteId: item.project_id,
            siteName: site?.name || `Baustelle ${item.project_id}`,
            address: adresse,
            articleNumber: item.inventory?.name || '',
            quantity: item.quantity || 0,
            distanceKm: adresse ? (distanzen.get(adresse) ?? null) : null,
          };
        });
      } catch (e) {
        console.warn('[Disposition] site_stock fetch failed:', e);
        return [];
      }
    }

    const result = await optimizeDisposition(
      materialList,
      targetSiteId || 'neu',
      targetAddress || '',
      getCentralStock,
      getSiteStock
    );

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Disposition fehlgeschlagen:', error);
    return NextResponse.json(
      { error: error.message || 'Interner Serverfehler' },
      { status: 500 }
    );
  }
}