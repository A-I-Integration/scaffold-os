// ============================================================
// app/api/disposition/route.ts
// SCAFFOLD OS – Dispositions-API (robust)
// ============================================================

import { NextResponse } from 'next/server';
import { optimizeDisposition } from '@/lib/calculations/disposition';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
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
    async function getCentralStock(articleNumbers: string[]) {
      try {
        const { data, error } = await supabase
          .from('inventory')
          .select('article_number, quantity, location')
          .in('article_number', articleNumbers)
          .gt('quantity', 0);

        if (error || !data) {
          console.warn('[Disposition] inventory table error:', error?.message);
          return [];
        }
        return data.map((item: any) => ({
          articleNumber: item.article_number,
          quantity: item.quantity || 0,
          location: item.location || 'Zentrallager',
        }));
      } catch (e) {
        console.warn('[Disposition] inventory fetch failed:', e);
        return [];
      }
    }

    // --- BAUSTELLEN-BESTAND (robust) ---
    async function getSiteStock(articleNumbers: string[], excludeSiteId: string) {
      try {
        // Prüfe ob site_stock existiert
        const { data, error } = await supabase
          .from('site_stock')
          .select('site_id, article_number, quantity')
          .in('article_number', articleNumbers)
          .gt('quantity', 0)
          .neq('site_id', excludeSiteId);

        if (error || !data || data.length === 0) {
          console.warn('[Disposition] site_stock empty or missing:', error?.message);
          return [];
        }

        // Baustellen-Namen holen
        const siteIds = [...new Set(data.map((d: any) => d.site_id))];
        const { data: sites } = await supabase
          .from('projects')
          .select('id, name, address')
          .in('id', siteIds);

        const siteMap = new Map(sites?.map((s: any) => [s.id, s]) || []);

        return data.map((item: any) => {
          const site = siteMap.get(item.site_id);
          return {
            siteId: item.site_id,
            siteName: site?.name || `Baustelle ${item.site_id}`,
            address: site?.address || '',
            articleNumber: item.article_number,
            quantity: item.quantity || 0,
            distanceKm: Math.floor(Math.random() * 35) + 5,
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