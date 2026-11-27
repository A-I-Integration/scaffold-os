// ============================================================
// app/api/ki-material/route.ts
// ============================================================

import { NextResponse } from 'next/server';
import { berechneMaterialServer } from '@/lib/ki-material-server';
import { requireAuth, unauthorizedResponse, pruefeRolle } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';

export async function POST(request: Request) {
  const rollenPruefung = await pruefeRolle(ROLLEN.ADMIN_BAULEITER);
  if (!rollenPruefung.ok) return rollenPruefung.response;
  try {
    const body = await request.json();

    // Minimal-Validierung
    if (!body.lengthM || !body.heightM) {
      return NextResponse.json(
        { error: 'Länge und Höhe erforderlich' },
        { status: 400 }
      );
    }

    // Preise + Kalkulations-Grundlagen + Engine: gemeinsame Berechnung (lib/ki-material-server.ts)
    const { result, preisHinweis } = await berechneMaterialServer(body);

    return NextResponse.json({
      success: true,
      data: result,
      ...(preisHinweis ? { preisHinweis } : {}),
    });
  } catch (error: any) {
    console.error('KI-Fehler:', error);
    return NextResponse.json(
      { error: error.message || 'Berechnung fehlgeschlagen' },
      { status: 500 }
    );
  }
}