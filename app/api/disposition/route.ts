// ============================================================
// app/api/disposition/route.ts
// SCAFFOLD OS – Dispositions-API (robust)
// ============================================================

import { NextResponse } from 'next/server';
import { optimizeDisposition } from '@/lib/calculations/disposition';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { distanceMatrixKm } from '@/lib/google-distance';
import { ordneZentralbestand, ordneBaustellenbestand, type LagerMitOrt, type BaustellenInfo } from '@/lib/disposition-bestand';

export async function POST(request: Request) {
  if (!(await requireAuth())) return unauthorizedResponse();
  try {
    const body = await request.json();
    const { materialList, targetSiteId, targetAddress, targetStart } = body;

    if (!materialList || !Array.isArray(materialList) || materialList.length === 0) {
      return NextResponse.json(
        { error: 'Materialliste erforderlich' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // --- LAGER laden (einmal) ---
    // Abgleich Materialzeile ↔ Lagerartikel: erst Artikelnummer (SKU), dann
    // genau gleicher Name – dieselbe Logik wie bei der Angebots-Annahme
    // (lib/lager-zuordnung.ts, lib/disposition-bestand.ts). Früher nur per
    // Name: Artikel mit Artikelnummer wurden nicht gefunden → "neu bestellen".
    let lager: LagerMitOrt[] = [];
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, name, sku, quantity, unit, location_in_warehouse')
        .eq('is_active', true);
      if (error) console.warn('[Disposition] inventory table error:', error.message);
      lager = (data || []) as LagerMitOrt[];
    } catch (e) {
      console.warn('[Disposition] inventory fetch failed:', e);
    }

    async function getCentralStock() {
      return ordneZentralbestand(materialList, lager);
    }

    // --- BAUSTELLEN-BESTAND ---
    // Nur Material auf Baustellen, die bis zu UNSEREM Projektbeginn
    // abgebaut sind (Projektende im Aufmaß). Ohne Projektbeginn oder ohne
    // deren Projektende: nicht verfügbar (nichts raten).
    async function getSiteStock(_namen: string[], excludeSiteId: string, zielAdresse: string) {
      try {
        if (!targetStart) return [];
        const { data, error } = await supabase
          .from('site_stock')
          .select('project_id, inventory_id, quantity')
          .gt('quantity', 0)
          .neq('project_id', excludeSiteId);
        if (error || !data || data.length === 0) {
          if (error) console.warn('[Disposition] site_stock error:', error.message);
          return [];
        }
        const siteIds = [...new Set(data.map((d: any) => d.project_id))];
        const { data: sites } = await supabase
          .from('projects')
          .select('id, name, adresse, data')
          .in('id', siteIds);
        const projekte: BaustellenInfo[] = (sites || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          adresse: p.adresse || null,
          projektende: typeof p.data?.step1?.projektende === 'string' ? p.data.step1.projektende.slice(0, 10) : null,
        }));

        const zeilen = ordneBaustellenbestand(materialList, lager, data as any[], projekte, String(targetStart).slice(0, 10));
        if (zeilen.length === 0) return [];

        // Echte Fahrstrecke je Baustellen-Adresse zur Ziel-Adresse; ohne
        // Ergebnis bleibt distanceKm null (keine erfundene Zahl).
        const adressen = [...new Set(zeilen.map((z) => z.address).filter((a) => a && a.trim()))];
        const distanzen = zielAdresse && adressen.length > 0
          ? await distanceMatrixKm(adressen, zielAdresse)
          : new Map<string, number | null>();
        return zeilen.map((z) => ({ ...z, distanceKm: z.address ? (distanzen.get(z.address) ?? null) : null }));
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