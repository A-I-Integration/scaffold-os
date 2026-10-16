import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

// ============================================================
// SCAFFOLD OS – Zugriffsschutz für Cron-Routen (/api/cron/*)
//
// Vercel ruft Cron-Routen mit "Authorization: Bearer <CRON_SECRET>" auf.
// Früher galt: Secret gesetzt → prüfen, NICHT gesetzt → alles durchlassen.
// Damit konnte auf einer Instanz ohne Secret jeder die Adresse aufrufen und
// Mahnungen versenden, Rechnungen erzeugen oder (Datenhygiene) Daten löschen.
//
// Jetzt gesperrt-by-default: ohne CRON_SECRET antwortet die Route mit 500 und
// führt nichts aus. Rückgabe: null = darf laufen, sonst die fertige Antwort.
// ============================================================

export function pruefeCronAufruf(
  req: Request,
  secret: string | undefined = process.env.CRON_SECRET
): NextResponse | null {
  if (!secret) {
    console.error('[Cron] CRON_SECRET ist nicht gesetzt – Route bleibt gesperrt. In Vercel unter Environment Variables eintragen.');
    return NextResponse.json({ error: 'Cron nicht konfiguriert (CRON_SECRET fehlt).' }, { status: 500 });
  }
  const erwartet = Buffer.from(`Bearer ${secret}`);
  const erhalten = Buffer.from(req.headers.get('authorization') || '');
  if (erwartet.length !== erhalten.length || !timingSafeEqual(erwartet, erhalten)) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }
  return null;
}
