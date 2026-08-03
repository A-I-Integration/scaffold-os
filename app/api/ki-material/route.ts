// ============================================================
// app/api/ki-material/route.ts
// ============================================================

import { NextResponse } from 'next/server';
import { calculateScaffoldMaterial } from '@/lib/calculations/scaffold-engine';
import { loadArticlePrices } from '@/lib/calculations/article-prices';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Minimal-Validierung
    if (!body.lengthM || !body.heightM) {
      return NextResponse.json(
        { error: 'Länge und Höhe erforderlich' },
        { status: 400 }
      );
    }

    // Preise laden (DB oder Fallback)
    const articlePrices = await loadArticlePrices();

    // Berechnung durchführen
    const result = calculateScaffoldMaterial(body, articlePrices);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('KI-Fehler:', error);
    return NextResponse.json(
      { error: error.message || 'Berechnung fehlgeschlagen' },
      { status: 500 }
    );
  }
}